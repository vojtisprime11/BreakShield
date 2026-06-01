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
import { verifyWebhookSignature }    from '@/lib/github/client'
import { enqueueAnalysis }           from '@/lib/queue/index'
import { processAnalysisJob }        from '@/lib/queue/worker'
import { supabaseAdmin }             from '@/lib/supabase'
import { logger }                    from '@/lib/logger'
import { randomUUID }                from 'crypto'

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
