import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ user: null })
  return NextResponse.json({
    user: {
      login: session.login,
      name: session.name,
      avatarUrl: session.avatarUrl,
    }
  })
}
