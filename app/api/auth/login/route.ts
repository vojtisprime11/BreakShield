import { NextResponse } from 'next/server'
import { getGitHubAuthUrl } from '@/lib/auth'
import { randomBytes } from 'crypto'

export async function GET(): Promise<NextResponse> {
  const state = randomBytes(16).toString('hex')
  const url = getGitHubAuthUrl(state)
  const res = NextResponse.redirect(url)
  res.cookies.set('bs_oauth_state', state, { httpOnly: true, maxAge: 600, path: '/' })
  return res
}
