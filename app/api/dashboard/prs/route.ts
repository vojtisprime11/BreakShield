/**
 * app/api/dashboard/prs/route.ts
 * Returns pull requests with analysis results for a given repo.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { Octokit } from '@octokit/rest'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const repoFullName = searchParams.get('repo')
  if (!repoFullName) return NextResponse.json({ error: 'Missing repo param' }, { status: 400 })

  try {
    const octokit = new Octokit({ auth: session.accessToken })
    const [owner, repo] = repoFullName.split('/')

    // Get open PRs from GitHub
    const { data: prs } = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
      owner: owner!, repo: repo!, state: 'all', per_page: 20,
    })

    // Get analysis results from Supabase
    const db = supabaseAdmin()
    const { data: dbPrs } = await db
      .from('pull_requests')
      .select(`
        github_pr_number, status, head_sha,
        risk_assessments (risk_level, risk_score, breaking_count, total_consumers_affected),
        analysis_runs (status, duration_ms, files_analyzed, completed_at)
      `)
      .eq('head_branch', 'any')
      .order('created_at', { ascending: false })
      .limit(20)

    // Also get by repo full_name
    const { data: repoData } = await db
      .from('repositories')
      .select('id')
      .eq('full_name', repoFullName)
      .single()

    let prResults: any[] = []
    if (repoData) {
      const { data: repoPrs } = await db
        .from('pull_requests')
        .select(`
          github_pr_number, status, head_sha, title, author, base_branch, head_branch, created_at, updated_at,
          risk_assessments (risk_level, risk_score, breaking_count, total_consumers_affected),
          analysis_runs (status, duration_ms, files_analyzed, completed_at)
        `)
        .eq('repository_id', repoData.id)
        .order('created_at', { ascending: false })
        .limit(20)
      prResults = repoPrs ?? []
    }

    // Merge GitHub PR data with analysis results
    const merged = prs.map((pr: any) => {
      const analysis = prResults.find((p: any) => p.github_pr_number === pr.number)
      const risk = analysis?.risk_assessments?.[0] ?? analysis?.risk_assessments
      const run = Array.isArray(analysis?.analysis_runs)
        ? analysis.analysis_runs[0]
        : analysis?.analysis_runs

      return {
        number: pr.number,
        title: pr.title,
        state: pr.state,
        author: pr.user?.login,
        authorAvatar: pr.user?.avatar_url,
        baseBranch: pr.base?.ref,
        headBranch: pr.head?.ref,
        url: pr.html_url,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        // Analysis results
        analyzed: !!analysis,
        riskLevel: risk?.risk_level ?? null,
        riskScore: risk?.risk_score ?? null,
        breakingCount: risk?.breaking_count ?? null,
        consumersAffected: risk?.total_consumers_affected ?? null,
        analysisStatus: run?.status ?? null,
        durationMs: run?.duration_ms ?? null,
        filesAnalyzed: run?.files_analyzed ?? null,
      }
    })

    return NextResponse.json({ prs: merged })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
