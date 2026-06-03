/**
 * lib/auth.ts
 * GitHub OAuth session management using JWT cookies.
 * No database — session is stored client-side in a signed JWT.
 */

import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? process.env.GITHUB_WEBHOOK_SECRET ?? 'breakshield-dev-secret'
)

const COOKIE_NAME = 'bs_session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

export interface Session {
  userId: number
  login: string
  name: string
  avatarUrl: string
  accessToken: string
}

// ─── Create session cookie ────────────────────────────────────────────────────

export async function createSession(session: Session): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET)
}

// ─── Read session from request ────────────────────────────────────────────────

export async function getSession(req?: NextRequest): Promise<Session | null> {
  try {
    let token: string | undefined

    if (req) {
      token = req.cookies.get(COOKIE_NAME)?.value
    } else {
      const cookieStore = await cookies()
      token = cookieStore.get(COOKIE_NAME)?.value
    }

    if (!token) return null
    const { payload } = await jwtVerify(token, SECRET)
    return payload as unknown as Session
  } catch {
    return null
  }
}

// ─── Set session cookie on response ──────────────────────────────────────────

export function setSessionCookie(res: NextResponse, token: string): NextResponse {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  })
  return res
}

// ─── Clear session cookie ─────────────────────────────────────────────────────

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' })
  return res
}

// ─── GitHub OAuth helpers ─────────────────────────────────────────────────────

export function getGitHubAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`,
    scope: 'read:user read:org',
    state,
  })
  return `https://github.com/login/oauth/authorize?${params}`
}

export async function exchangeCodeForToken(code: string): Promise<string | null> {
  const resp = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  })
  const data = await resp.json() as any
  return data.access_token ?? null
}

export async function getGitHubUser(token: string): Promise<{ id: number; login: string; name: string; avatar_url: string } | null> {
  const resp = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  })
  if (!resp.ok) return null
  return resp.json()
}
