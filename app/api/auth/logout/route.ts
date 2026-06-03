import { NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/auth'

export async function GET(): Promise<NextResponse> {
  const res = NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_APP_URL!))
  clearSessionCookie(res)
  return res
}
