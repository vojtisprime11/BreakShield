/**
 * app/api/dashboard/findings/route.ts
 * Returns findings for a specific PR.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const repo = searchParams.get('repo')
  const prNumber = parseInt(searchParams.get('pr') ?? '0', 10)
  if (!repo || !prNumber) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  try {
    const db = supabaseAdmin()

    const { data: repoData } = await db
      .from('repositories')
      .select('id')
      .eq('full_name', repo)
      .single()

    if (!repoData) return NextResponse.json({ findings: [], risk: null })

    const { data: pr } = await db
      .from('pull_requests')
      .select('id')
      .eq('repository_id', repoData.id)
      .eq('github_pr_number', prNumber)
      .single()

    if (!pr) return NextResponse.json({ findings: [], risk: null })

    const [{ data: findings }, { data: risk }] = await Promise.all([
      db.from('findings')
        .select('change_type, severity, source_file, affected_value, description, before_schema, after_schema, confidence, is_breaking')
        .eq('pull_request_id', pr.id)
        .order('confidence', { ascending: false }),
      db.from('risk_assessments')
        .select('*')
        .eq('pull_request_id', pr.id)
        .single(),
    ])

    return NextResponse.json({ findings: findings ?? [], risk })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
