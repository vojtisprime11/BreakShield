/**
 * lib/analysis/pipeline.ts
 *
 * End-to-end analysis pipeline.
 *
 * File handling:
 *   added   — before=null, after=content  → skip (no prior contract to break)
 *   modified — before=content, after=content → diff both
 *   removed — before=content, after=''    → treat as emptied: all exports removed
 *   renamed — treated as modified (GitHub returns previous_filename too)
 */

import { Octokit } from '@octokit/rest'
import type {
  AnalysisResult,
  AnalysisError,
  PRContext,
  FileVersion,
  Finding,
} from './types'
import {
  analyzeTypeScriptFile,
  shouldAnalyzeFile,
} from './typescript-analyzer'
import {
  analyzeOpenAPIFile,
  isOpenAPIFile,
} from './openapi-analyzer'
import { enrichWithEvidence } from './consumer-finder'
import { filterByConfidence } from './confidence'
import { calculateRisk } from './risk-engine'
import { logger } from '../logger'

// ─── Changed file record ──────────────────────────────────────────────────────

interface ChangedFile {
  path:         string
  previousPath: string | null   // set for renamed files
  status:       'added' | 'modified' | 'removed' | 'renamed'
}

// ─── Fetch list of changed files from GitHub PR ───────────────────────────────

async function getChangedFiles(
  octokit:  Octokit,
  owner:    string,
  repo:     string,
  prNumber: number
): Promise<ChangedFile[]> {
  const files: ChangedFile[] = []
  let page = 1

  while (true) {
    const resp = await octokit.request(
      'GET /repos/{owner}/{repo}/pulls/{pull_number}/files',
      { owner, repo, pull_number: prNumber, per_page: 100, page }
    )
    const items = resp.data as any[]
    if (items.length === 0) break

    for (const f of items) {
      files.push({
        path:         f.filename as string,
        previousPath: (f.previous_filename as string | undefined) ?? null,
        status:       f.status as ChangedFile['status'],
      })
    }

    if (items.length < 100) break
    page++
  }

  return files
}

// ─── Fetch one file at a specific git ref ────────────────────────────────────

async function fetchFileAt(
  octokit: Octokit,
  owner:   string,
  repo:    string,
  path:    string,
  ref:     string
): Promise<string | null> {
  try {
    const resp = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner, repo, path, ref,
    })
    const data = resp.data as { content?: string; encoding?: string; size?: number }

    if ((data.size ?? 0) > 200_000) return null   // skip very large files

    if (data.content && data.encoding === 'base64') {
      return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8')
    }
    return null
  } catch {
    return null
  }
}

// ─── Build FileVersion objects ────────────────────────────────────────────────

/**
 * Deleted file handling:
 *   A deleted TypeScript file means every exported interface, type alias,
 *   and function in it is gone. We represent this as after='' (empty string)
 *   rather than after=null. The analyzers will then correctly produce
 *   removed_interface / removed_field / removed_parameter findings for
 *   everything that was exported.
 *
 *   We do NOT skip deleted files. Skipping them silently is the original bug.
 */
async function buildFileVersions(
  octokit:  Octokit,
  owner:    string,
  repo:     string,
  files:    ChangedFile[],
  baseSha:  string,
  headSha:  string,
  log:      ReturnType<typeof logger.child>
): Promise<FileVersion[]> {
  // Only files whose type we understand
  const analyzable = files.filter(f =>
    shouldAnalyzeFile(f.path)  ||
    isOpenAPIFile(f.path)      ||
    // Renamed: use previous path for 'before' content
    (f.status === 'renamed' && f.previousPath &&
      (shouldAnalyzeFile(f.previousPath) || isOpenAPIFile(f.previousPath)))
  )

  if (analyzable.length === 0) return []

  log.info('Fetching file versions', {
    total: analyzable.length,
    removed: analyzable.filter(f => f.status === 'removed').length,
    added:   analyzable.filter(f => f.status === 'added').length,
  })

  const versions: FileVersion[] = await Promise.allSettled(
    analyzable.map(async (f): Promise<FileVersion> => {
      // ── Determine which paths to fetch ───────────────────────────────────
      // For renames: before content lives at previousPath on baseSha,
      //              after content lives at path on headSha.
      const beforePath = f.status === 'renamed' ? (f.previousPath ?? f.path) : f.path
      const afterPath  = f.path

      const [before, after] = await Promise.all([
        // added files had no 'before'
        f.status === 'added'
          ? Promise.resolve(null)
          : fetchFileAt(octokit, owner, repo, beforePath, baseSha),

        // removed files have no 'after' — represent as empty string, NOT null.
        // Empty string = valid input to analyzers; null = "don't analyze".
        f.status === 'removed'
          ? Promise.resolve('')
          : fetchFileAt(octokit, owner, repo, afterPath, headSha),
      ])

      return { path: f.path, before, after }
    })
  ).then(results =>
    results
      .filter((r): r is PromiseFulfilledResult<FileVersion> => r.status === 'fulfilled')
      .map(r => r.value)
  )

  const removed  = versions.filter(v => v.after  === '').length
  const added    = versions.filter(v => v.before === null).length
  const modified = versions.length - removed - added
  log.info('File versions ready', { total: versions.length, added, modified, removed })

  return versions
}

// ─── Per-file analyzer dispatch ───────────────────────────────────────────────

/**
 * Dispatch rules:
 *   before=null, after=content  → new file, skip (nothing was removed)
 *   before=content, after=''   → file deleted: analyze as full removal
 *   before=content, after=content → normal diff
 *   before=null, after=''      → shouldn't happen; skip
 */
async function analyzeFileVersion(
  fv:     FileVersion,
  errors: AnalysisError[]
): Promise<Omit<Finding, 'evidence'>[]> {
  // Added file — no prior contract to break
  if (fv.before === null) return []

  // Both before and after present (including after='' for deleted files)
  const beforeContent = fv.before
  const afterContent  = fv.after ?? ''   // treat fetch-failure same as deletion

  if (shouldAnalyzeFile(fv.path)) {
    const result = analyzeTypeScriptFile(fv.path, beforeContent, afterContent)
    errors.push(...result.errors)
    return result.findings
  }

  if (isOpenAPIFile(fv.path)) {
    const result = await analyzeOpenAPIFile(fv.path, beforeContent, afterContent)
    errors.push(...result.errors)
    return result.findings
  }

  return []
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

export async function runAnalysisPipeline(
  octokit: Octokit,
  ctx:     PRContext
): Promise<AnalysisResult> {
  const start = Date.now()
  const log   = logger.child({
    trace_id:  ctx.traceId,
    repo:      ctx.repoFullName,
    pr_number: ctx.prNumber,
    phase:     'pipeline',
  })

  const errors: AnalysisError[] = []
  const empty = (): AnalysisResult => ({
    findings:     [],
    risk:         calculateRisk([]),
    filesAnalyzed: 0,
    durationMs:   Date.now() - start,
    errors,
  })

  // ── 1. Fetch changed file list ──────────────────────────────────────────
  let changedFiles: ChangedFile[]
  try {
    changedFiles = await getChangedFiles(octokit, ctx.owner, ctx.repo, ctx.prNumber)
    log.info('Changed files fetched', { count: changedFiles.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('Failed to fetch changed files', { error: msg })
    errors.push({ file: '', phase: 'unknown', message: msg })
    return empty()
  }

  // ── 2. Fetch before/after content for each relevant file ────────────────
  let fileVersions: FileVersion[]
  try {
    fileVersions = await buildFileVersions(
      octokit, ctx.owner, ctx.repo,
      changedFiles, ctx.baseSha, ctx.headSha,
      log
    )
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('Failed to build file versions', { error: msg })
    errors.push({ file: '', phase: 'unknown', message: msg })
    return empty()
  }

  // ── 3. Run analyzers (parallel across files) ────────────────────────────
  // analyzeFileVersion is CPU-bound (AST parse) but each runs in the same
  // Node.js thread, so concurrency here is fine — no I/O contention.
  const findingArrays = await Promise.allSettled(
    fileVersions.map(fv => analyzeFileVersion(fv, errors))
  )

  const allFindings: Omit<Finding, 'evidence'>[] = findingArrays
    .filter((r): r is PromiseFulfilledResult<Omit<Finding, 'evidence'>[]> =>
      r.status === 'fulfilled'
    )
    .flatMap(r => r.value)

  // Log rejected analyzer promises (shouldn't happen — analyzeFileVersion catches internally)
  findingArrays
    .filter(r => r.status === 'rejected')
    .forEach(r => {
      const reason = (r as PromiseRejectedResult).reason
      log.warn('Analyzer threw unexpectedly', { error: String(reason) })
      errors.push({ file: '', phase: 'diff', message: String(reason) })
    })

  log.info('Analysis complete', {
    raw_findings: allFindings.length,
    from_files:   fileVersions.length,
  })

  // ── 4. Enrich findings with consumer evidence ───────────────────────────
  let enriched: Finding[]
  try {
    enriched = await enrichWithEvidence(allFindings, {
      octokit,
      owner:        ctx.owner,
      repo:         ctx.repo,
      repoFullName: ctx.repoFullName,
      headSha:      ctx.headSha,
      traceId:      ctx.traceId,
    })
    log.info('Enrichment done', { enriched: enriched.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('Consumer enrichment failed, degrading gracefully', { error: msg })
    errors.push({ file: '', phase: 'consumer_search', message: msg })
    enriched = allFindings.map(f => ({ ...f, evidence: [] }))
  }

  // ── 5. Filter noise ─────────────────────────────────────────────────────
  const filtered = filterByConfidence(enriched)
  log.info('After noise filter', {
    before: enriched.length,
    after:  filtered.length,
  })

  // ── 6. Calculate risk ───────────────────────────────────────────────────
  const risk = calculateRisk(filtered)

  log.info('Pipeline complete', {
    findings:    filtered.length,
    risk:        risk.riskLevel,
    score:       risk.riskScore,
    consumers:   risk.totalConsumersAffected,
    duration_ms: Date.now() - start,
  })

  return {
    findings:      filtered,
    risk,
    filesAnalyzed: fileVersions.length,
    durationMs:    Date.now() - start,
    errors,
  }
}
