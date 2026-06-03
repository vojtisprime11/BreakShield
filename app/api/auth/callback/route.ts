import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForToken, getGitHubUser, createSession, setSessionCookie } from '@/lib/auth'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const storedState = req.cookies.get('bs_oauth_state')?.value

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(new URL('/dashboard?error=auth_failed', req.url))
  }

  const token = await exchangeCodeForToken(code)
  if (!token) {
    return NextResponse.redirect(new URL('/dashboard?error=token_failed', req.url))
  }

  const user = await getGitHubUser(token)
  if (!user) {
    return NextResponse.redirect(new URL('/dashboard?error=user_failed', req.url))
  }

  const sessionToken = await createSession({
    userId: user.id,
    login: user.login,
    name: user.name ?? user.login,
    avatarUrl: user.avatar_url,
    accessToken: token,
  })

  const res = NextResponse.redirect(new URL('/dashboard', req.url))
  setSessionCookie(res, sessionToken)
  res.cookies.set('bs_oauth_state', '', { maxAge: 0, path: '/' })
  return res
}
