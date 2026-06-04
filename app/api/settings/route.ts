/**
 * app/api/settings/route.ts
 * Save/get user settings (Gemini API key for BYOK)
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = supabaseAdmin()
  const { data } = await db
    .from('organizations')
    .select('gemini_api_key')
    .eq('github_account_login', session.login)
    .single()

  return NextResponse.json({
    hasGeminiKey: !!(data as any)?.gemini_api_key,
  })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { geminiApiKey } = await req.json()

  const db = supabaseAdmin()
  await db
    .from('organizations')
    .update({ gemini_api_key: geminiApiKey || null } as any)
    .eq('github_account_login', session.login)

  return NextResponse.json({ ok: true })
}
