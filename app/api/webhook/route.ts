/**
 * app/api/webhook/route.ts
 *
 * GitHub webhook receiver.
 * Responsibilities: verify → enqueue → respond 200.
 * Analysis runs via waitUntil() in the background.
 * No business logic here.
 */

import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'  // Next.js 15 waitUntil equivalent
import { verifyWebhookSignature, getInstallationOctokit } from '@/lib/github/client'
import { enqueueAnalysis }           from '@/lib/queue/index'
import { processAnalysisJob }        from '@/lib/queue/worker'
import { supabaseAdmin }             from '@/lib/supabase'
import { logger }                    from '@/lib/logger'
import { randomUUID }                from 'crypto'
import { generateFix }               from '@/lib/autofix/gemini'
import { createFixPR }               from '@/lib/autofix/pr-creator'
import { Octokit }                   from '@octokit/rest'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody  = await req.text()
  const sig      = req.headers.get('x-hub-signature-256') ?? ''
  const event    = req.headers.get('x-github-event') ?? ''
  const delivery = req.headers.get('x-github-delivery') ?? randomUUID()

  const log = logger.child({ delivery, event })

  // ── 1. Verify signature ──────────────────────────────────────────────────
  if (!verifyWebhookSignature(rawBody, sig)) {
    log.warn('Webhook signature invalid')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ── 2. Route by event type ───────────────────────────────────────────────

  if (event === 'installation') {
    await handleInstallation(payload, log)
    return NextResponse.json({ ok: true })
  }

  // Handle /fix command in PR comments
  if (event === 'issue_comment') {
    if (payload.action === 'created' && payload.issue?.pull_request && payload.comment?.body) {
      const body: string = payload.comment.body.trim()
      if (body.startsWith('/fix')) {
        after(async () => {
          try {
            await handleFixCommand(payload, log)
          } catch (err: unknown) {
            logger.error('/fix command failed', { error: err instanceof Error ? err.message : String(err) })
          }
        })
        return NextResponse.json({ ok: true, action: 'fix_command' })
      }
    }
    return NextResponse.json({ ok: true })
  }

  if (event === 'pull_request') {
    const action: string = payload.action
    if (action !== 'opened' && action !== 'synchronize') {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const traceId = delivery

    // ── Enqueue job (fast, synchronous) ───────────────────────────────────
    let jobId: string
    let isNew: boolean

    try {
      const result = await enqueueAnalysis(
        {
          installationId: payload.installation.id,
          owner:          payload.repository.owner.login,
          repo:           payload.repository.name,
          repoFullName:   payload.repository.full_name,
          prNumber:       payload.pull_request.number,
          prId:           payload.pull_request.id,
          prTitle:        payload.pull_request.title ?? '',
          author:         payload.pull_request.user?.login ?? '',
          baseBranch:     payload.pull_request.base.ref,
          headBranch:     payload.pull_request.head.ref,
          baseSha:        payload.pull_request.base.sha,
          headSha:        payload.pull_request.head.sha,
          triggerEvent:   action as 'opened' | 'synchronize',
        },
        traceId
      )
      jobId = result.jobId
      isNew = result.isNew
    } catch (err: unknown) {
      log.error('Failed to enqueue job', { error: String(err) })
      // Respond 200 so GitHub doesn't retry — error is logged
      return NextResponse.json({ ok: false, error: 'enqueue_failed' })
    }

    if (!isNew) {
      // Duplicate event, already processing
      return NextResponse.json({ ok: true, deduplicated: true })
    }

    log.info('Job enqueued, starting background processing', { job_id: jobId })

    // ── Process in background via after() ────────────────────────────────
    // after() is Next.js 15's waitUntil — keeps the process alive after response
    after(async () => {
      try {
        await processAnalysisJob(jobId, {
          installationId: payload.installation.id,
          owner:          payload.repository.owner.login,
          repo:           payload.repository.name,
          repoFullName:   payload.repository.full_name,
          prNumber:       payload.pull_request.number,
          prId:           payload.pull_request.id,
          prTitle:        payload.pull_request.title ?? '',
          author:         payload.pull_request.user?.login ?? '',
          baseBranch:     payload.pull_request.base.ref,
          headBranch:     payload.pull_request.head.ref,
          baseSha:        payload.pull_request.base.sha,
          headSha:        payload.pull_request.head.sha,
          triggerEvent:   action as 'opened' | 'synchronize',
        })
      } catch (err: unknown) {
        logger.error('Background job failed', {
          job_id: jobId,
          delivery,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })

    // ── Respond immediately (within GitHub's 10s timeout) ────────────────
    return NextResponse.json({ ok: true, jobId, trace_id: traceId })
  }

  return NextResponse.json({ ok: true })
}

// ─── Installation handler ─────────────────────────────────────────────────────

async function handleInstallation(
  payload: any,
  log:     ReturnType<typeof logger.child>
): Promise<void> {
  const db     = supabaseAdmin()
  const action = payload.action as string

  if (action === 'created') {
    const { error } = await db.from('organizations').upsert(
      {
        github_installation_id: payload.installation.id,
        github_account_login:   payload.installation.account.login,
        github_account_type:    payload.installation.account.type,
      },
      { onConflict: 'github_installation_id' }
    )
    if (error) log.error('Installation upsert failed', { error: error.message })
    else log.info('Installation created', { login: payload.installation.account.login })
  }

  if (action === 'deleted') {
    const { error } = await db
      .from('organizations')
      .delete()
      .eq('github_installation_id', payload.installation.id)
    if (error) log.error('Installation delete failed', { error: error.message })
    else log.info('Installation deleted', { login: payload.installation.account.login })
  }
}


// ─── /fix command handler ─────────────────────────────────────────────────────

async function handleFixCommand(
  payload: any,
  log: ReturnType<typeof logger.child>
): Promise<void> {
  const installationId = payload.installation?.id
  const owner    = payload.repository.owner.login
  const repo     = payload.repository.name
  const prNumber = payload.issue.number
  const commentBody: string = payload.comment.body.trim()

  // Parse: /fix [filePath]
  const parts = commentBody.split(/\s+/)
  const targetFile = parts[1] || null // optional file filter

  if (!installationId) {
    log.warn('/fix: no installation ID')
    return
  }

  // Get octokit
  let octokit: Octokit
  try {
    octokit = await getInstallationOctokit(installationId) as unknown as Octokit
  } catch {
    const botToken = process.env.GITHUB_BOT_TOKEN
    if (!botToken) { log.error('/fix: no token available'); return }
    octokit = new Octokit({ auth: botToken })
  }

  // Get PR details
  const { data: pr } = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner, repo, pull_number: prNumber,
  })

  const baseBranch = pr.base.ref
  const headSha    = pr.head.sha

  // Find the breaking changes from DB
  const db = supabaseAdmin()
  const { data: prRow } = await db
    .from('pull_requests')
    .select('id')
    .eq('github_pr_number', prNumber)
    .limit(1)
    .single()

  if (!prRow) {
    await reactToComment(octokit, owner, repo, payload.comment.id, 'confused')
    return
  }

  const { data: findings } = await db
    .from('findings')
    .select('*')
    .eq('pull_request_id', (prRow as any).id)
    .eq('is_breaking', true)

  if (!findings || findings.length === 0) {
    await reactToComment(octokit, owner, repo, payload.comment.id, 'confused')
    return
  }

  // Filter by target file if specified
  const toFix = targetFile
    ? findings.filter((f: any) => f.source_file === targetFile || f.source_file.endsWith(targetFile))
    : findings

  if (toFix.length === 0) {
    await reactToComment(octokit, owner, repo, payload.comment.id, 'confused')
    return
  }

  // React with eyes to acknowledge
  await reactToComment(octokit, owner, repo, payload.comment.id, 'eyes')

  // Load user AI settings (use repo owner's settings)
  const { data: settings } = await db
    .from('user_settings')
    .select('ai_provider, ai_api_key, ai_model')
    .eq('github_login', owner)
    .single()

  const aiProvider = (settings as any)?.ai_provider ?? 'gemini'
  const aiApiKey   = (settings as any)?.ai_api_key  ?? undefined
  const aiModel    = (settings as any)?.ai_model    ?? undefined

  // Process each finding
  let fixedCount = 0
  for (const finding of toFix) {
    const f = finding as any
    try {
      // Fetch file
      const { data: fileData } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner, repo, path: f.source_file, ref: headSha,
      }) as any

      if (!fileData?.content) continue
      const fileContent = Buffer.from(fileData.content.replace(/\n/g, ''), 'base64').toString('utf-8')

      // Generate fix
      const fixResult = await generateFix({
        filePath:      f.source_file,
        fileContent,
        changeType:    f.change_type,
        affectedValue: f.affected_value,
        description:   f.description,
        beforeSchema:  f.before_schema?.text,
        afterSchema:   f.after_schema?.text,
        userApiKey:    aiApiKey,
        provider:      aiProvider,
        model:         aiModel,
      })

      if (!fixResult.ok || !fixResult.fixedCode) continue
      if (fixResult.fixedCode.trim() === fileContent.trim()) continue

      // Create PR
      const prTitle = `fix: [BreakShield] auto-fix ${f.change_type.replace(/_/g, ' ')} in ${f.source_file.split('/').pop()}`
      const prBody = `## BreakShield CI — Auto-fix\n\nTriggered by \`/fix\` command in PR #${prNumber}.\n\n| | |\n|:--|:--|\n| **File** | \`${f.source_file}\` |\n| **Change** | ${f.change_type.replace(/_/g, ' ')} |\n| **Affected** | \`${f.affected_value}\` |\n\n---\n*Generated by [BreakShield CI](https://breakshield-ci.vercel.app)*`

      const prResult = await createFixPR({
        octokit,
        owner, repo,
        baseBranch,
        filePath: f.source_file,
        originalSha: fileData.sha,
        fixedContent: fixResult.fixedCode,
        prTitle,
        prBody,
      })

      if (prResult.ok) fixedCount++
    } catch (err) {
      log.error('/fix: failed for finding', { file: f.source_file, error: String(err) })
    }
  }

  // React with result
  if (fixedCount > 0) {
    await reactToComment(octokit, owner, repo, payload.comment.id, 'rocket')
  } else {
    await reactToComment(octokit, owner, repo, payload.comment.id, '-1')
  }
}

async function reactToComment(octokit: Octokit, owner: string, repo: string, commentId: number, reaction: string) {
  try {
    await octokit.request('POST /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions', {
      owner, repo, comment_id: commentId, content: reaction as any,
    })
  } catch { /* ignore */ }
}
