/**
 * app/api/settings/route.ts
 * Save/get user AI provider + model settings (BYOK — Bring Your Own Key)
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

const VALID_PROVIDERS = ['gemini', 'openai', 'anthropic', 'groq', 'perplexity']

/** Try to auto-create user_settings table if missing */
async function ensureTable() {
  const db = supabaseAdmin()
  // Check if table exists by querying it
  const { error } = await db.from('user_settings').select('id').limit(0)
  if (!error) return // table exists

  // Table doesn't exist — create it via raw SQL
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!
  await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({}),
  }).catch(() => {})

  // Fallback: use SQL via the pg endpoint
  try {
    await fetch(`${supabaseUrl}/pg`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        query: `CREATE TABLE IF NOT EXISTS public.user_settings (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          github_login text UNIQUE NOT NULL,
          ai_provider text,
          ai_api_key text,
          ai_model text,
          created_at timestamptz DEFAULT now(),
          updated_at timestamptz DEFAULT now()
        );`,
      }),
    })
  } catch {
    // silently fail — user will need to create table manually
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = supabaseAdmin()
  const { data, error } = await db
    .from('user_settings')
    .select('ai_provider, ai_api_key, ai_model')
    .eq('github_login', session.login)
    .single()

  // If table doesn't exist, return empty
  if (error?.code === '42P01' || error?.message?.includes('user_settings')) {
    await ensureTable()
    return NextResponse.json({ aiProvider: null, aiModel: null, hasApiKey: false })
  }

  return NextResponse.json({
    aiProvider: (data as any)?.ai_provider ?? null,
    aiModel:    (data as any)?.ai_model    ?? null,
    hasApiKey:  !!((data as any)?.ai_api_key),
  })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { aiProvider, aiApiKey, aiModel } = await req.json()

  if (!aiProvider || !VALID_PROVIDERS.includes(aiProvider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
  }

  const db = supabaseAdmin()

  const { error } = await db
    .from('user_settings')
    .upsert(
      {
        github_login: session.login,
        ai_provider:  aiProvider,
        ai_api_key:   aiApiKey !== undefined ? (aiApiKey || null) : undefined,
        ai_model:     aiModel || null,
      },
      { onConflict: 'github_login' }
    )

  if (error) {
    // Table doesn't exist — try to create it and retry once
    if (error.message?.includes('user_settings') || error.code === '42P01' || error.message?.includes('schema cache')) {
      await ensureTable()
      // Retry
      const { error: e2 } = await db
        .from('user_settings')
        .upsert(
          {
            github_login: session.login,
            ai_provider:  aiProvider,
            ai_api_key:   aiApiKey !== undefined ? (aiApiKey || null) : undefined,
            ai_model:     aiModel || null,
          },
          { onConflict: 'github_login' }
        )
      if (e2) {
        return NextResponse.json({
          error: 'Table user_settings not found. Please create it in Supabase SQL Editor:\n\nCREATE TABLE IF NOT EXISTS user_settings (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  github_login text UNIQUE NOT NULL,\n  ai_provider text,\n  ai_api_key text,\n  ai_model text,\n  created_at timestamptz DEFAULT now(),\n  updated_at timestamptz DEFAULT now()\n);',
        }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    // Column ai_model might not exist yet — retry without it
    if (error.message?.includes('ai_model')) {
      const { error: e2 } = await db
        .from('user_settings')
        .upsert(
          {
            github_login: session.login,
            ai_provider:  aiProvider,
            ai_api_key:   aiApiKey !== undefined ? (aiApiKey || null) : undefined,
          },
          { onConflict: 'github_login' }
        )
      if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
      return NextResponse.json({ ok: true, modelSaved: false })
    }

    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, modelSaved: true })
}
