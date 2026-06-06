import { NextRequest, NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/auth'

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Build absolute URL from the request
  const origin = req.headers.get('host') ?? 'breakshield-ci.vercel.app'
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const redirectUrl = `${proto}://${origin}/`

  const res = NextResponse.redirect(redirectUrl)
  clearSessionCookie(res)
  return res
}
