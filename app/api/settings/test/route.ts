/**
 * app/api/settings/test/route.ts
 * Tests whether a given API key is valid for the selected provider
 * by making a minimal real API call.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const { provider, apiKey } = await req.json()
  if (!provider || !apiKey) {
    return NextResponse.json({ ok: false, error: 'Missing provider or apiKey' }, { status: 400 })
  }

  try {
    switch (provider) {

      case 'gemini': {
        const { GoogleGenAI } = await import('@google/genai')
        const ai = new GoogleGenAI({ apiKey })
        try {
          const r = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: 'Say "ok" in one word.',
            config: { maxOutputTokens: 5 },
          })
          if (!r.text) return NextResponse.json({ ok: false, error: 'Empty response from Gemini' })
          return NextResponse.json({ ok: true })
        } catch (e: any) {
          const msg: string = e?.message ?? String(e)
          if (msg.includes('API_KEY_INVALID') || msg.includes('INVALID_ARGUMENT'))
            return NextResponse.json({ ok: false, error: 'Invalid API key' })
          if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('credits') || msg.includes('billing'))
            return NextResponse.json({ ok: false, error: msg, warning: true })
          throw e
        }
      }

      case 'openai': {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'gpt-4.1-nano',
            messages: [{ role: 'user', content: 'Say ok' }],
            max_tokens: 5,
          }),
        })
        if (r.status === 401) return NextResponse.json({ ok: false, error: 'Invalid API key' })
        if (r.status === 429) return NextResponse.json({ ok: false, error: 'Rate limit — but key is valid', warning: true })
        if (!r.ok) {
          const d = await r.json().catch(() => ({})) as any
          return NextResponse.json({ ok: false, error: d.error?.message ?? `HTTP ${r.status}` })
        }
        return NextResponse.json({ ok: true })
      }

      case 'anthropic': {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 5,
            messages: [{ role: 'user', content: 'Say ok' }],
          }),
        })
        if (r.status === 401) return NextResponse.json({ ok: false, error: 'Invalid API key' })
        if (r.status === 429) return NextResponse.json({ ok: false, error: 'Rate limit — but key is valid', warning: true })
        if (!r.ok) {
          const d = await r.json().catch(() => ({})) as any
          return NextResponse.json({ ok: false, error: d.error?.message ?? `HTTP ${r.status}` })
        }
        return NextResponse.json({ ok: true })
      }

      case 'groq': {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: 'Say ok' }],
            max_tokens: 5,
          }),
        })
        if (r.status === 401) return NextResponse.json({ ok: false, error: 'Invalid API key' })
        if (r.status === 429) return NextResponse.json({ ok: false, error: 'Rate limit — but key is valid', warning: true })
        if (!r.ok) {
          const d = await r.json().catch(() => ({})) as any
          return NextResponse.json({ ok: false, error: d.error?.message ?? `HTTP ${r.status}` })
        }
        return NextResponse.json({ ok: true })
      }

      case 'perplexity': {
        const r = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'sonar',
            messages: [{ role: 'user', content: 'Say ok' }],
            max_tokens: 5,
          }),
        })
        if (r.status === 401) return NextResponse.json({ ok: false, error: 'Invalid API key' })
        if (r.status === 429) return NextResponse.json({ ok: false, error: 'Rate limit — but key is valid', warning: true })
        if (!r.ok) {
          const d = await r.json().catch(() => ({})) as any
          return NextResponse.json({ ok: false, error: d.error?.message ?? `HTTP ${r.status}` })
        }
        return NextResponse.json({ ok: true })
      }

      default:
        return NextResponse.json({ ok: false, error: 'Unknown provider' }, { status: 400 })
    }
  } catch (e: any) {
    const msg = e?.message ?? String(e)
    if (msg.includes('API_KEY_INVALID') || msg.includes('INVALID_ARGUMENT')) {
      return NextResponse.json({ ok: false, error: 'Invalid API key' })
    }
    return NextResponse.json({ ok: false, error: msg })
  }
}
