/**
 * lib/queue/index.ts
 *
 * Zero-Redis job queue backed by Supabase.
 * On Vercel: jobs are processed immediately via waitUntil().
 * Retry logic lives in the DB — a Vercel Cron can pick up failed jobs.
 *
 * Idempotency key prevents double-processing the same PR event.
 */

import { supabaseAdmin } from '../supabase'
import { logger } from '../logger'

// ─── Job types ────────────────────────────────────────────────────────────────

export interface AnalyzePRPayload {
  installationId: number
  owner:          string
  repo:           string
  repoFullName:   string
  prNumber:       number
  prId:           number
  prTitle:        string
  author:         string
  baseBranch:     string
  headBranch:     string
  baseSha:        string
  headSha:        string
  triggerEvent:   'opened' | 'synchronize'
}

export interface JobRecord {
  id:              string
  type:            string
  payload:         AnalyzePRPayload
  status:          'pending' | 'running' | 'completed' | 'failed'
  attempts:        number
  idempotencyKey:  string
  createdAt:       string
}

// ─── Enqueue ──────────────────────────────────────────────────────────────────

export async function enqueueAnalysis(
  payload:   AnalyzePRPayload,
  traceId:   string
): Promise<{ jobId: string; isNew: boolean }> {
  const db  = supabaseAdmin()
  const log = logger.child({ trace_id: traceId, repo: payload.repoFullName, pr_number: payload.prNumber })

  // Idempotency key: re-runs on same headSha are deduplicated
  const idempotencyKey = `analyze_pr:${payload.repoFullName}:${payload.prNumber}:${payload.headSha}`

  // Check if job already exists (handles GitHub webhook retries)
  const { data: existing } = await db
    .from('analysis_jobs')
    .select('id, status')
    .eq('idempotency_key', idempotencyKey)
    .single()

  if (existing) {
    log.info('Duplicate job skipped', { job_id: existing.id, status: existing.status })
    return { jobId: existing.id, isNew: false }
  }

  const { data: job, error } = await db
    .from('analysis_jobs')
    .insert({
      type:            'analyze_pr',
      payload,
      idempotency_key: idempotencyKey,
    })
    .select('id')
    .single()

  if (error || !job) {
    log.error('Failed to enqueue job', { error: error?.message })
    throw new Error(`Queue insert failed: ${error?.message}`)
  }

  log.info('Job enqueued', { job_id: job.id })
  return { jobId: job.id, isNew: true }
}

// ─── Mark job state transitions ───────────────────────────────────────────────

export async function markJobRunning(jobId: string): Promise<boolean> {
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('analysis_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('status', 'pending')  // Only transition from pending → running
    .select('id')
    .single()

  if (error || !data) {
    // Another worker picked it up (shouldn't happen on Vercel, but safe)
    return false
  }
  return true
}

export async function markJobCompleted(jobId: string): Promise<void> {
  const db = supabaseAdmin()
  await db
    .from('analysis_jobs')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', jobId)
}

export async function markJobFailed(jobId: string, error: string): Promise<void> {
  const db = supabaseAdmin()

  // Increment attempts and check if we should retry
  const { data: job } = await db
    .from('analysis_jobs')
    .select('attempts, max_attempts')
    .eq('id', jobId)
    .single()

  if (!job) return

  const attempts   = (job.attempts ?? 0) + 1
  const shouldRetry = attempts < (job.max_attempts ?? 3)

  await db
    .from('analysis_jobs')
    .update({
      status:        shouldRetry ? 'pending' : 'failed',
      attempts,
      error_message: error.substring(0, 500),
      // Back off: retry after 2^attempts minutes
      scheduled_at:  shouldRetry
        ? new Date(Date.now() + Math.pow(2, attempts) * 60_000).toISOString()
        : undefined,
    })
    .eq('id', jobId)
}

// ─── Fetch pending jobs (for cron-based retry fallback) ───────────────────────

export async function fetchPendingJobs(limit = 5): Promise<JobRecord[]> {
  const db = supabaseAdmin()
  const { data } = await db
    .from('analysis_jobs')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(limit)

  return (data ?? []).map(row => ({
    id:             row.id,
    type:           row.type,
    payload:        row.payload as AnalyzePRPayload,
    status:         row.status,
    attempts:       row.attempts,
    idempotencyKey: row.idempotency_key,
    createdAt:      row.created_at,
  }))
}
