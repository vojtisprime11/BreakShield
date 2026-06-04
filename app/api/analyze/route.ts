/**
 * app/api/analyze/route.ts
 *
 * Analysis endpoint — works three ways:
 *   1. Authenticated user (GitHub OAuth session) — private + public repos
 *   2. Public PR URL — unauthenticated, public repos only
 *   3. Demo mode — hardcoded real PR
 *
 * POST /api/analyze
 * Body: { prUrl: string } | { demo: true } | { owner, repo, prNumber, installationId? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { Octokit } from '@octokit/rest'
import { getSession } from '@/lib/auth'
import { getInstallationOctokit } from '@/lib/github/client'
import { analyzeTypeScriptFile, shouldAnalyzeFile } from '@/lib/analysis/typescript-analyzer'
import { analyzeOpenAPIFile, isOpenAPIFile } from '@/lib/analysis/openapi-analyzer'
import { filterByConfidence } from '@/lib/analysis/confidence'
import { calculateRisk } from '@/lib/analysis/risk-engine'
import { enrichWithEvidence } from '@/lib/analysis/consumer-finder'
import type { Finding, AnalysisError, FileVersion } from '@/lib/analysis/types'
import { randomUUID } from 'crypto'

const DEMO_PR = {
  owner: 'vojtisprime11', repo: 'BreakShield-test', prNumber: 10,
  title: 'refactor: clean up UserResponse API, remove deprecated createdAt field',
}

// ─── Parse GitHub PR URL ──────────────────────────────────────────────────────

function parsePRUrl(url: string): { owner: string; repo: string; prNumber: number } | null {
  try {
    // Handle both http and https, with or without www
    const normalized = url.trim().replace(/^(?!https?:\/\/)/, 'https://')
    const u = new URL(normalized)
    if (!u.hostname.includes('github.com')) return null
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length < 4 || parts[2] !== 'pull') return null
    const prNumber = parseInt(parts[3]!, 10)
    if (isNaN(prNumber)) return null
    return { owner: parts[0]!, repo: parts[1]!, prNumber }
  } catch {
    return null
  }
}

// ─── Fetch file at ref ────────────────────────────────────────────────────────

async function fetchFileAt(
  octokit: Octokit,
  owner: string, repo: string, path: string, ref: string
): Promise<string | null> {
  try {
    const resp = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner, repo, path, ref,
    })
    const data = resp.data as { content?: string; encoding?: string; size?: number }
    if ((data.size ?? 0) > 150_000) return null
    if (data.content && data.encoding === 'base64') {
      return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8')
    }
    return null
  } catch {
    return null
  }
}

// ─── Core analysis ────────────────────────────────────────────────────────────

async function runAnalysis(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  withEvidence: boolean,
  traceId: string,
) {
  const start = Date.now()

  // 1. PR metadata
  const prResp = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner, repo, pull_number: prNumber,
  })
  const prData = prResp.data as any
  const baseSha    = prData.base.sha as string
  const headSha    = prData.head.sha as string
  const baseBranch = prData.base.ref as string
  const headBranch = prData.head.ref as string
  const prTitle    = prData.title as string
  const prUrl      = prData.html_url as string
  const prState    = prData.state as string
  const prAuthor   = prData.user?.login as string

  // 2. Changed files
  const filesResp = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/files', {
    owner, repo, pull_number: prNumber, per_page: 100,
  })
  const allFiles = filesResp.data as any[]
  const analyzableFiles = allFiles.filter(f =>
    shouldAnalyzeFile(f.filename) || isOpenAPIFile(f.filename)
  )

  if (analyzableFiles.length === 0) {
    return {
      ok: true, prTitle, prUrl, prState, prAuthor, baseBranch, headBranch,
      findings: [], risk: calculateRisk([]),
      filesAnalyzed: 0, totalFiles: allFiles.length,
      durationMs: Date.now() - start,
      message: `No TypeScript or OpenAPI files changed. ${allFiles.length} other file${allFiles.length !== 1 ? 's' : ''} changed.`,
    }
  }

  // 3. Fetch before/after content in parallel
  const fileVersions: FileVersion[] = await Promise.all(
    analyzableFiles.slice(0, 25).map(async (f): Promise<FileVersion> => {
      const [before, after] = await Promise.all([
        f.status === 'added'   ? Promise.resolve(null) : fetchFileAt(octokit, owner, repo, f.filename, baseSha),
        f.status === 'removed' ? Promise.resolve('')   : fetchFileAt(octokit, owner, repo, f.filename, headSha),
      ])
      return { path: f.filename, before, after }
    })
  )

  // 4. Run AST analyzers
  const errors: AnalysisError[] = []
  const rawFindings: Omit<Finding, 'evidence'>[] = []

  await Promise.all(fileVersions.map(async fv => {
    if (fv.before === null) return
    const beforeContent = fv.before
    const afterContent  = fv.after ?? ''

    if (shouldAnalyzeFile(fv.path)) {
      const r = analyzeTypeScriptFile(fv.path, beforeContent, afterContent)
      errors.push(...r.errors)
      rawFindings.push(...r.findings)
    } else if (isOpenAPIFile(fv.path)) {
      const r = await analyzeOpenAPIFile(fv.path, beforeContent, afterContent)
      errors.push(...r.errors)
      rawFindings.push(...r.findings)
    }
  }))

  // 5. Enrich with consumer evidence (only for authenticated users)
  let findings: Finding[]
  if (withEvidence && rawFindings.length > 0) {
    try {
      findings = await enrichWithEvidence(rawFindings, {
        octokit, owner, repo,
        repoFullName: `${owner}/${repo}`,
        headSha, traceId,
      })
    } catch {
      findings = rawFindings.map(f => ({ ...f, evidence: [] }))
    }
  } else {
    findings = rawFindings.map(f => ({ ...f, evidence: [] }))
  }

  // 6. Filter noise + calculate risk
  const filtered = filterByConfidence(findings)
  const risk     = calculateRisk(filtered)

  return {
    ok: true,
    prTitle, prUrl, prState, prAuthor,
    baseBranch, headBranch,
    findings: filtered,
    risk,
    filesAnalyzed:  fileVersions.length,
    totalFiles:     allFiles.length,
    durationMs:     Date.now() - start,
    withEvidence,
    errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const session = await getSession(req)
  const traceId = randomUUID()

  try {
    // ── Demo mode ──────────────────────────────────────────────────────────
    if (body.demo) {
      const oct = session
        ? new Octokit({ auth: session.accessToken })
        : new Octokit()
      const result = await runAnalysis(oct, DEMO_PR.owner, DEMO_PR.repo, DEMO_PR.prNumber, !!session, traceId)
      return NextResponse.json({ ...result, isDemo: true })
    }

    // ── Direct params (from dashboard "Analyze now") ───────────────────────
    if (body.owner && body.repo && body.prNumber) {
      if (!session) return NextResponse.json({ error: 'Sign in to analyze private repositories' }, { status: 401 })

      let oct: Octokit
      if (body.installationId) {
        try {
          oct = await getInstallationOctokit(body.installationId) as unknown as Octokit
        } catch {
          oct = new Octokit({ auth: session.accessToken })
        }
      } else {
        oct = new Octokit({ auth: session.accessToken })
      }

      const result = await runAnalysis(oct, body.owner, body.repo, body.prNumber, true, traceId)
      return NextResponse.json(result)
    }

    // ── PR URL (public or authenticated) ──────────────────────────────────
    if (body.prUrl) {
      const parsed = parsePRUrl(body.prUrl)
      if (!parsed) {
        return NextResponse.json({
          error: 'Invalid GitHub PR URL. Expected: https://github.com/owner/repo/pull/123',
        }, { status: 400 })
      }

      const oct = session
        ? new Octokit({ auth: session.accessToken })
        : new Octokit()

      try {
        const result = await runAnalysis(oct, parsed.owner, parsed.repo, parsed.prNumber, !!session, traceId)
        if (!session) {
          return NextResponse.json({
            ...result,
            note: 'Sign in with GitHub to analyze private repos and get consumer evidence.',
          })
        }
        return NextResponse.json(result)
      } catch (e: any) {
        if (e.status === 404) {
          return NextResponse.json({
            error: session
              ? 'PR not found. Check that you have access to this repository.'
              : 'PR not found. This may be a private repository — sign in to analyze it.',
          }, { status: 404 })
        }
        throw e
      }
    }

    return NextResponse.json({ error: 'Provide prUrl, demo: true, or owner/repo/prNumber' }, { status: 400 })

  } catch (e: any) {
    if (e.status === 403 || e.status === 429) {
      return NextResponse.json({ error: 'GitHub API rate limit reached. Try again in a minute.' }, { status: 429 })
    }
    if (e.status === 401) {
      return NextResponse.json({ error: 'GitHub authentication failed. Sign in again.' }, { status: 401 })
    }
    return NextResponse.json({
      error: `Analysis failed: ${e.message ?? 'Unknown error'}`,
    }, { status: 500 })
  }
}
