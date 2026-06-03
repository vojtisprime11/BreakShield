/**
 * app/api/analyze/route.ts
 *
 * Public analysis endpoint — no GitHub App auth required.
 * Works with any public GitHub repository via unauthenticated API.
 *
 * POST /api/analyze
 * Body: { prUrl: string } | { demo: true }
 */

import { NextRequest, NextResponse } from 'next/server'
import { Octokit } from '@octokit/rest'
import { analyzeTypeScriptFile, shouldAnalyzeFile } from '@/lib/analysis/typescript-analyzer'
import { analyzeOpenAPIFile, isOpenAPIFile } from '@/lib/analysis/openapi-analyzer'
import { filterByConfidence } from '@/lib/analysis/confidence'
import { calculateRisk } from '@/lib/analysis/risk-engine'
import type { Finding, AnalysisError, FileVersion } from '@/lib/analysis/types'

// Unauthenticated Octokit — 60 req/hour, enough for demo
const octokit = new Octokit()

// ─── Demo data — real PR from breakshield test repo ──────────────────────────

const DEMO_PR = {
  owner: 'vojtisprime11',
  repo: 'BreakShield-test',
  prNumber: 10,
  title: 'refactor: clean up UserResponse API, remove deprecated createdAt field',
}

// ─── Parse GitHub PR URL ──────────────────────────────────────────────────────

function parsePRUrl(url: string): { owner: string; repo: string; prNumber: number } | null {
  try {
    const u = new URL(url)
    if (!u.hostname.includes('github.com')) return null
    const parts = u.pathname.split('/').filter(Boolean)
    // Expected: ['owner', 'repo', 'pull', '123']
    if (parts.length < 4 || parts[2] !== 'pull') return null
    const prNumber = parseInt(parts[3]!, 10)
    if (isNaN(prNumber)) return null
    return { owner: parts[0]!, repo: parts[1]!, prNumber }
  } catch {
    return null
  }
}

// ─── Fetch file content without auth ─────────────────────────────────────────

async function fetchFileAt(owner: string, repo: string, path: string, ref: string): Promise<string | null> {
  try {
    const resp = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner, repo, path, ref,
    })
    const data = resp.data as { content?: string; encoding?: string; size?: number }
    if ((data.size ?? 0) > 100_000) return null
    if (data.content && data.encoding === 'base64') {
      return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8')
    }
    return null
  } catch {
    return null
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ── Resolve PR to analyze ──────────────────────────────────────────────
  let owner: string
  let repo: string
  let prNumber: number
  let prTitle: string

  if (body.demo) {
    owner = DEMO_PR.owner
    repo = DEMO_PR.repo
    prNumber = DEMO_PR.prNumber
    prTitle = DEMO_PR.title
  } else if (body.prUrl) {
    const parsed = parsePRUrl(body.prUrl)
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid GitHub PR URL. Expected format: https://github.com/owner/repo/pull/123' }, { status: 400 })
    }
    owner = parsed.owner
    repo = parsed.repo
    prNumber = parsed.prNumber
    prTitle = `PR #${prNumber}`
  } else {
    return NextResponse.json({ error: 'Provide prUrl or demo: true' }, { status: 400 })
  }

  const start = Date.now()

  try {
    // ── 1. Fetch PR metadata ───────────────────────────────────────────────
    let prData: any
    try {
      const prResp = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
        owner, repo, pull_number: prNumber,
      })
      prData = prResp.data
      prTitle = prData.title ?? prTitle
    } catch (e: any) {
      if (e.status === 404) {
        return NextResponse.json({ error: 'PR not found. Make sure the repository is public.' }, { status: 404 })
      }
      throw e
    }

    const baseSha = prData.base.sha as string
    const headSha = prData.head.sha as string
    const baseBranch = prData.base.ref as string
    const headBranch = prData.head.ref as string

    // ── 2. Fetch changed files ─────────────────────────────────────────────
    const filesResp = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/files', {
      owner, repo, pull_number: prNumber, per_page: 50,
    })
    const changedFiles = (filesResp.data as any[]).filter(f =>
      shouldAnalyzeFile(f.filename) || isOpenAPIFile(f.filename)
    )

    if (changedFiles.length === 0) {
      return NextResponse.json({
        ok: true,
        prTitle,
        prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
        baseBranch,
        headBranch,
        findings: [],
        risk: calculateRisk([]),
        filesAnalyzed: 0,
        durationMs: Date.now() - start,
        message: 'No TypeScript or OpenAPI files changed in this PR.',
      })
    }

    // ── 3. Fetch file versions ─────────────────────────────────────────────
    const fileVersions: FileVersion[] = await Promise.all(
      changedFiles.slice(0, 20).map(async (f): Promise<FileVersion> => {
        const [before, after] = await Promise.all([
          f.status === 'added' ? Promise.resolve(null) : fetchFileAt(owner, repo, f.filename, baseSha),
          f.status === 'removed' ? Promise.resolve('') : fetchFileAt(owner, repo, f.filename, headSha),
        ])
        return { path: f.filename, before, after }
      })
    )

    // ── 4. Run analyzers ───────────────────────────────────────────────────
    const errors: AnalysisError[] = []
    const allFindings: Omit<Finding, 'evidence'>[] = []

    for (const fv of fileVersions) {
      if (fv.before === null) continue
      const beforeContent = fv.before
      const afterContent = fv.after ?? ''

      if (shouldAnalyzeFile(fv.path)) {
        const result = analyzeTypeScriptFile(fv.path, beforeContent, afterContent)
        errors.push(...result.errors)
        allFindings.push(...result.findings)
      } else if (isOpenAPIFile(fv.path)) {
        const result = await analyzeOpenAPIFile(fv.path, beforeContent, afterContent)
        errors.push(...result.errors)
        allFindings.push(...result.findings)
      }
    }

    // ── 5. Add empty evidence, filter, score risk ──────────────────────────
    const withEvidence: Finding[] = allFindings.map(f => ({ ...f, evidence: [] }))
    const filtered = filterByConfidence(withEvidence)
    const risk = calculateRisk(filtered)

    return NextResponse.json({
      ok: true,
      prTitle,
      prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
      baseBranch,
      headBranch,
      findings: filtered,
      risk,
      filesAnalyzed: fileVersions.length,
      durationMs: Date.now() - start,
      errors: errors.length > 0 ? errors : undefined,
      note: 'Consumer evidence requires GitHub App installation. Install BreakShield CI for full analysis.',
    })

  } catch (e: any) {
    if (e.status === 403) {
      return NextResponse.json({
        error: 'GitHub API rate limit reached. Try again in a few minutes, or use a public PR with fewer files.',
      }, { status: 429 })
    }
    return NextResponse.json({
      error: 'Analysis failed. Make sure the repository is public.',
    }, { status: 500 })
  }
}
