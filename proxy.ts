import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

const PROTECTED = ['/dashboard']

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PROTECTED.some(p => pathname.startsWith(p))) {
    const session = await getSession(req)
    if (!session) {
      return NextResponse.redirect(new URL('/api/auth/login', req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
