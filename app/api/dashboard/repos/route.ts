/**
 * app/api/dashboard/repos/route.ts
 * Returns list of repositories where BreakShield CI is installed
 * for the authenticated user.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { Octokit } from '@octokit/rest'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const octokit = new Octokit({ auth: session.accessToken })

    // Get installations accessible to this user
    const { data } = await octokit.request('GET /user/installations', {
      headers: { accept: 'application/vnd.github+json' },
    })

    // For each installation get repos
    const repoResults = await Promise.allSettled(
      (data.installations as any[]).map(async (inst: any) => {
        const reposResp = await octokit.request(
          'GET /user/installations/{installation_id}/repositories',
          { installation_id: inst.id, per_page: 30 }
        )
        return (reposResp.data.repositories as any[]).map((r: any) => ({
          id: r.id,
          fullName: r.full_name,
          name: r.name,
          owner: r.owner.login,
          private: r.private,
          defaultBranch: r.default_branch,
          updatedAt: r.updated_at,
          installationId: inst.id,
        }))
      })
    )

    const repos = repoResults
      .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
      .flatMap(r => r.value)

    return NextResponse.json({ repos })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
