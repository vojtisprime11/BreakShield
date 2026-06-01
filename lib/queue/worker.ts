/**
 * lib/queue/worker.ts
 *
 * Processes a single analysis job.
 * Called from:
 *   - webhook handler via waitUntil()  (primary path, Vercel)
 *   - /api/cron/retry endpoint         (fallback for failed jobs)
 */

import { Octokit } from '@octokit/rest'
import { supabaseAdmin } from '../supabase'
import { logger } from '../logger'
import { getInstallationOctokit } from '../github/client'
import { runAnalysisPipeline } from '../analysis/pipeline'
import { createCheckRun, completeCheckRun, failCheckRun } from '../github/check-runs'
import { generateComment, upsertPRComment } from '../github/comment'
import { markJobRunning, markJobCompleted, markJobFailed } from './index'
import type { AnalyzePRPayload } from './index'
import type { Finding, RiskAssessment } from '../analysis/types'
import { isBreakingChange } from '../analysis/types'
import { randomUUID } from 'crypto'

// ─── Main worker entry point ──────────────────────────────────────────────────

export async function processAnalysisJob(
  jobId:   string,
  payload: AnalyzePRPayload
): Promise<void> {
  const traceId = randomUUID()
  const log = logger.child({
    trace_id:  traceId,
    job_id:    jobId,
    repo:      payload.repoFullName,
    pr_number: payload.prNumber,
  })

  // Claim the job (idempotent guard)
  const claimed = await markJobRunning(jobId)
  if (!claimed) {
    log.warn('Job already running or completed, skipping')
    return
  }

  log.info('Worker started')

  const db = supabaseAdmin()
  let checkRunId:    number | null = null
  let analysisRunId: string | null = null

  try {
    // ── Get authenticated Octokit ─────────────────────────────────────────
    const octokit = await getInstallationOctokit(payload.installationId)

    // ── Ensure DB records exist ───────────────────────────────────────────
    const { orgId, repoId } = await upsertOrgAndRepo(db, payload, log)
    const prId = await upsertPR(db, repoId, payload, log)

    // ── Create in-progress Check Run ──────────────────────────────────────
    try {
      checkRunId = await createCheckRun(
        octokit,
        payload.owner,
        payload.repo,
        payload.headSha,
        payload.prNumber
      )
      await db.from('pull_requests')
        .update({ check_run_id: checkRunId })
        .eq('id', prId)
      log.info('Check run created', { check_run_id: checkRunId })
    } catch (e: unknown) {
      log.warn('Check run creation failed (non-fatal)', { error: String(e) })
    }

    // ── Create analysis run record ────────────────────────────────────────
    const { data: runData } = await db
      .from('analysis_runs')
      .insert({
        pull_request_id: prId,
        trigger_event:   payload.triggerEvent,
        status:          'running',
      })
      .select('id')
      .single()
    analysisRunId = runData?.id ?? null

    // ── Run analysis pipeline ─────────────────────────────────────────────
    const result = await runAnalysisPipeline(octokit as unknown as Octokit, {
      owner:          payload.owner,
      repo:           payload.repo,
      repoFullName:   payload.repoFullName,
      prNumber:       payload.prNumber,
      baseSha:        payload.baseSha,
      headSha:        payload.headSha,
      installationId: payload.installationId,
      traceId,
    })

    log.info('Pipeline complete', {
      findings:  result.findings.length,
      risk:      result.risk.riskLevel,
      duration_ms: result.durationMs,
    })

    // ── Persist findings + risk assessment ────────────────────────────────
    if (analysisRunId) {
      await persistResults(db, analysisRunId, prId, result.findings, result.risk, log)
    }

    // ── Complete analysis run ─────────────────────────────────────────────
    if (analysisRunId) {
      await db.from('analysis_runs').update({
        status:         'completed',
        duration_ms:    result.durationMs,
        files_analyzed: result.filesAnalyzed,
        completed_at:   new Date().toISOString(),
      }).eq('id', analysisRunId)
    }

    // ── Update Check Run ──────────────────────────────────────────────────
    if (checkRunId) {
      try {
        await completeCheckRun(
          octokit as unknown as Octokit,
          payload.owner,
          payload.repo,
          checkRunId,
          result.risk,
          result.findings,
          result.durationMs
        )
      } catch (e: unknown) {
        log.warn('Check run update failed (non-fatal)', { error: String(e) })
      }
    }

    // ── Post / update PR comment ──────────────────────────────────────────
    const body = generateComment(
      result.findings,
      result.risk,
      payload.prNumber,
      payload.repoFullName
    )

    const { data: prData } = await db
      .from('pull_requests')
      .select('comment_id')
      .eq('id', prId)
      .single()

    const commentId = await upsertPRComment(
      octokit as unknown as Octokit,
      payload.owner,
      payload.repo,
      payload.prNumber,
      body,
      prData?.comment_id ?? null
    )

    // ── Update PR to analyzed ─────────────────────────────────────────────
    await db.from('pull_requests').update({
      status:     'analyzed',
      comment_id: commentId,
      updated_at: new Date().toISOString(),
    }).eq('id', prId)

    await markJobCompleted(jobId)
    log.info('Job completed successfully')

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('Job failed', { error: msg })

    // Mark analysis run as failed
    if (analysisRunId) {
      await db.from('analysis_runs').update({
        status:        'failed',
        error_message: msg.substring(0, 500),
        completed_at:  new Date().toISOString(),
      }).eq('id', analysisRunId)
    }

    // Fail check run
    if (checkRunId) {
      const octokit = await getInstallationOctokit(payload.installationId).catch(() => null)
      if (octokit) {
        await failCheckRun(
          octokit as unknown as Octokit,
          payload.owner,
          payload.repo,
          checkRunId,
          msg
        ).catch(() => {})
      }
    }

    await markJobFailed(jobId, msg)
    throw err
  }
}

// ─── DB persistence helpers ───────────────────────────────────────────────────

async function upsertOrgAndRepo(
  db:      ReturnType<typeof supabaseAdmin>,
  payload: AnalyzePRPayload,
  log:     ReturnType<typeof logger.child>
): Promise<{ orgId: string; repoId: string }> {
  // Org
  const { data: org } = await db
    .from('organizations')
    .upsert(
      {
        github_installation_id: payload.installationId,
        github_account_login:   payload.owner,
        github_account_type:    'Organization',
      },
      { onConflict: 'github_installation_id' }
    )
    .select('id')
    .single()

  if (!org) throw new Error('Failed to upsert organization')

  // Repo — try SELECT first, then INSERT if not found.
  // github_repo_id has a UNIQUE constraint so we can't blindly upsert with 0.
  // The webhook payload doesn't include the numeric repo ID, so we use
  // full_name as the stable key and only insert github_repo_id=0 on first insert.
  let repo: { id: string } | null = null

  const { data: existingRepo } = await db
    .from('repositories')
    .select('id')
    .eq('full_name', payload.repoFullName)
    .single()

  if (existingRepo) {
    repo = existingRepo
    // Update default_branch in case it changed
    await db.from('repositories')
      .update({ default_branch: payload.baseBranch })
      .eq('id', existingRepo.id)
  } else {
    const { data: newRepo } = await db
      .from('repositories')
      .insert({
        organization_id: org.id,
        github_repo_id:  0,
        full_name:       payload.repoFullName,
        default_branch:  payload.baseBranch,
      })
      .select('id')
      .single()
    repo = newRepo
  }

  if (!repo) throw new Error('Failed to upsert repository')

  return { orgId: org.id, repoId: repo.id }
}

async function upsertPR(
  db:      ReturnType<typeof supabaseAdmin>,
  repoId:  string,
  payload: AnalyzePRPayload,
  log:     ReturnType<typeof logger.child>
): Promise<string> {
  const { data: pr } = await db
    .from('pull_requests')
    .upsert(
      {
        repository_id:    repoId,
        github_pr_number: payload.prNumber,
        github_pr_id:     payload.prId,
        title:            payload.prTitle,
        author:           payload.author,
        base_branch:      payload.baseBranch,
        head_branch:      payload.headBranch,
        base_sha:         payload.baseSha,
        head_sha:         payload.headSha,
        status:           'analyzing',
      },
      { onConflict: 'repository_id,github_pr_number' }
    )
    .select('id')
    .single()

  if (!pr) throw new Error('Failed to upsert pull request')
  return pr.id
}

/**
 * Persist all findings + evidence in exactly 4 DB round trips regardless of
 * how many findings exist:
 *
 *   1. DELETE existing findings for this run (idempotent re-run safety)
 *   2. INSERT all findings in one bulk call, SELECT back id + lookup key
 *   3. INSERT all evidence items in one bulk call (using returned IDs)
 *   4. UPSERT risk assessment
 *
 * Previous implementation: 2N round trips (N = finding count).
 * This implementation: 4 round trips always.
 *
 * Lookup key: (analysis_run_id, affected_value, source_file)
 * This combination is unique within a single analysis run because the
 * TypeScript and OpenAPI analyzers deduplicate on (type, file, affectedValue).
 */
async function persistResults(
  db:       ReturnType<typeof supabaseAdmin>,
  runId:    string,
  prId:     string,
  findings: Finding[],
  risk:     RiskAssessment,
  log:      ReturnType<typeof logger.child>
): Promise<void> {
  const persistStart = Date.now()

  // ── Round trip 1: clear stale data from re-runs ─────────────────────────
  await db.from('findings').delete().eq('analysis_run_id', runId)

  if (findings.length === 0) {
    // Still need to write the risk assessment
    await db.from('risk_assessments').upsert(
      buildRiskRow(prId, runId, risk),
      { onConflict: 'pull_request_id' }
    )
    log.info('Results persisted (no findings)', { duration_ms: Date.now() - persistStart })
    return
  }

  // ── Round trip 2: bulk insert all findings ──────────────────────────────
  const findingRows = findings.map(f => ({
    analysis_run_id: runId,
    pull_request_id: prId,
    change_type:     f.changeType,
    severity:        f.severity,
    source_file:     f.sourceFile,
    affected_value:  f.affectedValue,
    description:     f.description,
    before_schema:   f.beforeSchema ? { text: f.beforeSchema } : null,
    after_schema:    f.afterSchema  ? { text: f.afterSchema  } : null,
    confidence:      f.confidence,
  }))

  const { data: insertedFindings, error: findingsErr } = await db
    .from('findings')
    .insert(findingRows)
    .select('id, affected_value, source_file')

  if (findingsErr || !insertedFindings) {
    log.error('Bulk findings insert failed', { error: findingsErr?.message })
    // Still write risk assessment — analysis result is real even if DB partially failed
    await db.from('risk_assessments').upsert(
      buildRiskRow(prId, runId, risk),
      { onConflict: 'pull_request_id' }
    )
    return
  }

  // ── Build finding ID lookup: (affected_value, source_file) → DB uuid ────
  // Both columns together form a unique key within a run.
  const findingIdLookup = new Map<string, string>()
  for (const row of insertedFindings) {
    const key = `${row.affected_value}::${row.source_file}`
    findingIdLookup.set(key, row.id as string)
  }

  // ── Round trip 3: bulk insert all evidence items ─────────────────────────
  const evidenceRows = findings.flatMap(f => {
    if (f.evidence.length === 0) return []

    const key       = `${f.affectedValue}::${f.sourceFile}`
    const findingId = findingIdLookup.get(key)

    if (!findingId) {
      log.warn('Could not map finding to DB id', { key })
      return []
    }

    return f.evidence.map(e => ({
      finding_id:   findingId,
      repository:   e.repository,
      file_path:    e.filePath,
      line_number:  e.lineNumber,
      col_number:   e.column,
      code_snippet: e.codeSnippet.substring(0, 500),
      usage_type:   e.usageType,
      confidence:   e.confidence,
    }))
  })

  if (evidenceRows.length > 0) {
    const { error: evErr } = await db.from('evidence_items').insert(evidenceRows)
    if (evErr) {
      log.warn('Bulk evidence insert failed', { error: evErr.message, count: evidenceRows.length })
    }
  }

  // ── Round trip 4: upsert risk assessment ────────────────────────────────
  await db.from('risk_assessments').upsert(
    buildRiskRow(prId, runId, risk),
    { onConflict: 'pull_request_id' }
  )

  log.info('Results persisted', {
    findings:  findings.length,
    evidence:  evidenceRows.length,
    risk:      risk.riskLevel,
    duration_ms: Date.now() - persistStart,
  })
}

function buildRiskRow(prId: string, runId: string, risk: RiskAssessment) {
  return {
    pull_request_id:          prId,
    analysis_run_id:          runId,
    risk_level:               risk.riskLevel,
    risk_score:               risk.riskScore,
    breaking_count:           risk.breakingCount,
    total_consumers_affected: risk.totalConsumersAffected,
    max_confidence:           risk.maxConfidence,
    summary:                  risk.summary,
    calculated_at:            new Date().toISOString(),
  }
}
