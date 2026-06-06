/**
 * lib/autofix/gemini.ts
 *
 * Multi-provider AI fix engine.
 * Supports Gemini, OpenAI, Anthropic, Groq, Perplexity — all models.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type AIProvider = 'gemini' | 'openai' | 'anthropic' | 'groq' | 'perplexity'

export interface ModelInfo {
  id:      string
  name:    string
  /** Approx context window in tokens */
  context: number
  /** true = available on free tier */
  free?:   boolean
}

/** All available models grouped by provider — updated June 2026 from official docs */
export const PROVIDER_MODELS: Record<AIProvider, ModelInfo[]> = {
  // Source: https://ai.google.dev/gemini-api/docs/models (June 2026)
  gemini: [
    // Gemini 3 series (latest)
    { id: 'gemini-3.5-flash',                    name: 'Gemini 3.5 Flash',        context: 1_000_000, free: true },
    { id: 'gemini-3.1-flash-lite',               name: 'Gemini 3.1 Flash-Lite',   context: 1_000_000, free: true },
    { id: 'gemini-3-flash-preview',              name: 'Gemini 3 Flash (preview)', context: 1_000_000, free: true },
    { id: 'gemini-3.1-pro-preview',              name: 'Gemini 3.1 Pro (preview)', context: 1_000_000 },
    // Gemini 2.5 series (stable)
    { id: 'gemini-2.5-pro',                      name: 'Gemini 2.5 Pro',           context: 1_000_000 },
    { id: 'gemini-2.5-flash',                    name: 'Gemini 2.5 Flash',         context: 1_000_000, free: true },
    { id: 'gemini-2.5-flash-lite',               name: 'Gemini 2.5 Flash-Lite',    context: 1_000_000, free: true },
  ],
  // Source: https://platform.openai.com/docs/models (June 2026)
  openai: [
    { id: 'gpt-5.5',      name: 'GPT-5.5',       context: 1_000_000 },
    { id: 'gpt-5.4',      name: 'GPT-5.4',        context: 1_000_000 },
    { id: 'gpt-5.4-mini', name: 'GPT-5.4 mini',   context: 400_000 },
    { id: 'gpt-5.4-nano', name: 'GPT-5.4 nano',   context: 400_000 },
    // Legacy (still available via API)
    { id: 'gpt-4o',       name: 'GPT-4o (legacy)', context: 128_000 },
    { id: 'gpt-4.1',      name: 'GPT-4.1 (legacy)', context: 1_047_576 },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 mini (legacy)', context: 1_047_576 },
    { id: 'o4-mini',      name: 'o4-mini (legacy)', context: 200_000 },
    { id: 'o3',           name: 'o3 (legacy)',     context: 200_000 },
  ],
  // Source: https://docs.anthropic.com/en/docs/about-claude/models/all-models (June 2026)
  anthropic: [
    { id: 'claude-opus-4-8',           name: 'Claude Opus 4.8',    context: 1_000_000 },
    { id: 'claude-sonnet-4-6',         name: 'Claude Sonnet 4.6',  context: 1_000_000 },
    { id: 'claude-haiku-4-5',          name: 'Claude Haiku 4.5',   context: 200_000 },
    // Previous gen (still supported)
    { id: 'claude-opus-4-5',           name: 'Claude Opus 4.5',    context: 200_000 },
    { id: 'claude-sonnet-4-5',         name: 'Claude Sonnet 4.5',  context: 200_000 },
    { id: 'claude-3-7-sonnet-20250219',name: 'Claude 3.7 Sonnet',  context: 200_000 },
    { id: 'claude-3-5-sonnet-20241022',name: 'Claude 3.5 Sonnet',  context: 200_000 },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku',   context: 200_000 },
  ],
  // Source: https://console.groq.com/docs/models (June 2026)
  groq: [
    // Production models
    { id: 'openai/gpt-oss-120b',                        name: 'OpenAI GPT-OSS 120B',  context: 131_072, free: true },
    { id: 'openai/gpt-oss-20b',                         name: 'OpenAI GPT-OSS 20B',   context: 131_072, free: true },
    { id: 'llama-3.3-70b-versatile',                    name: 'Llama 3.3 70B',         context: 131_072, free: true },
    { id: 'llama-3.1-8b-instant',                       name: 'Llama 3.1 8B Instant',  context: 131_072, free: true },
    // Preview models
    { id: 'meta-llama/llama-4-scout-17b-16e-instruct',  name: 'Llama 4 Scout 17B',    context: 131_072, free: true },
    { id: 'qwen/qwen3-32b',                             name: 'Qwen3 32B',             context: 131_072, free: true },
  ],
  // Source: https://docs.perplexity.ai/docs/sonar/models (June 2026)
  perplexity: [
    { id: 'sonar-deep-research', name: 'Sonar Deep Research', context: 128_000 },
    { id: 'sonar-pro',           name: 'Sonar Pro',           context: 200_000 },
    { id: 'sonar-reasoning-pro', name: 'Sonar Reasoning Pro', context: 128_000 },
    { id: 'sonar',               name: 'Sonar',               context: 128_000 },
  ],
}

/** Default model per provider */
export const DEFAULT_MODEL: Record<AIProvider, string> = {
  gemini:     'gemini-2.5-flash',
  openai:     'gpt-5.4-mini',
  anthropic:  'claude-haiku-4-5',
  groq:       'llama-3.3-70b-versatile',
  perplexity: 'sonar',
}

export interface FixRequest {
  filePath:      string
  fileContent:   string
  changeType:    string
  affectedValue: string
  description:   string
  beforeSchema?: string
  afterSchema?:  string
  /** User's saved API key (BYOK) */
  userApiKey?:   string
  /** Which AI provider to use */
  provider?:     AIProvider
  /** Specific model ID — falls back to DEFAULT_MODEL[provider] */
  model?:        string
}

export interface FixResult {
  ok:           boolean
  fixedCode?:   string
  explanation?: string
  error?:       string
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildPrompt(req: FixRequest): string {
  return `You are BreakShield CI's auto-fix engine. Your job is to fix a breaking API change in TypeScript code.

## Breaking change detected
- **File:** ${req.filePath}
- **Change type:** ${req.changeType}
- **Affected:** ${req.affectedValue}
- **Description:** ${req.description}
${req.beforeSchema ? `- **Before:** \`${req.beforeSchema}\`` : ''}
${req.afterSchema  ? `- **After:**  \`${req.afterSchema}\`` : ''}

## Current file content
\`\`\`typescript
${req.fileContent.slice(0, 8000)}
\`\`\`

## Your task
Fix the breaking change in the code above. Rules:
1. Return ONLY the complete fixed file content — no explanations, no markdown code blocks, no \`\`\`typescript wrapper
2. Preserve all existing logic, imports, and formatting
3. Only change what is necessary to fix the breaking change
4. If the fix requires adding an import, add it
5. If you cannot determine the correct fix with certainty, return the original code unchanged

Return the fixed file content now:`
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:typescript|ts|javascript|js)?\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim()
}

// ─── Provider implementations ─────────────────────────────────────────────────

async function fixWithGemini(req: FixRequest, apiKey: string, model: string): Promise<FixResult> {
  const { GoogleGenAI } = await import('@google/genai')
  try {
    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model,
      contents: buildPrompt(req),
      config: { temperature: 0.1, maxOutputTokens: 4096 },
    })
    const text = response.text?.trim()
    if (!text) return { ok: false, error: 'Gemini returned an empty response.' }
    return { ok: true, fixedCode: stripCodeFences(text), explanation: `Auto-fixed by BreakShield CI: ${req.description}` }
  } catch (e: any) {
    if (e.message?.includes('API_KEY_INVALID') || e.message?.includes('INVALID_ARGUMENT'))
      return { ok: false, error: 'Invalid Gemini API key. Check your key in Settings.' }
    if (e.message?.includes('RESOURCE_EXHAUSTED') || e.message?.includes('quota'))
      return { ok: false, error: 'Gemini API quota exceeded. Try again later or use your own key.' }
    return { ok: false, error: `Gemini error: ${e.message ?? String(e)}` }
  }
}

async function fixWithOpenAI(req: FixRequest, apiKey: string, model: string): Promise<FixResult> {
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: buildPrompt(req) }],
        temperature: 0.1,
        max_tokens: 4096,
      }),
    })
    if (resp.status === 401) return { ok: false, error: 'Invalid OpenAI API key. Check your key in Settings.' }
    if (resp.status === 429) return { ok: false, error: 'OpenAI rate limit reached. Try again later.' }
    const data = await resp.json() as any
    const text = data.choices?.[0]?.message?.content?.trim()
    if (!text) return { ok: false, error: 'OpenAI returned an empty response.' }
    return { ok: true, fixedCode: stripCodeFences(text), explanation: `Auto-fixed by BreakShield CI: ${req.description}` }
  } catch (e: any) {
    return { ok: false, error: `OpenAI error: ${e.message ?? String(e)}` }
  }
}

async function fixWithAnthropic(req: FixRequest, apiKey: string, model: string): Promise<FixResult> {
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: buildPrompt(req) }],
      }),
    })
    if (resp.status === 401) return { ok: false, error: 'Invalid Anthropic API key. Check your key in Settings.' }
    if (resp.status === 429) return { ok: false, error: 'Anthropic rate limit reached. Try again later.' }
    const data = await resp.json() as any
    const text = data.content?.[0]?.text?.trim()
    if (!text) return { ok: false, error: 'Anthropic returned an empty response.' }
    return { ok: true, fixedCode: stripCodeFences(text), explanation: `Auto-fixed by BreakShield CI: ${req.description}` }
  } catch (e: any) {
    return { ok: false, error: `Anthropic error: ${e.message ?? String(e)}` }
  }
}

async function fixWithGroq(req: FixRequest, apiKey: string, model: string): Promise<FixResult> {
  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: buildPrompt(req) }],
        temperature: 0.1,
        max_tokens: 4096,
      }),
    })
    if (resp.status === 401) return { ok: false, error: 'Invalid Groq API key. Check your key in Settings.' }
    if (resp.status === 429) return { ok: false, error: 'Groq rate limit reached. Try again later.' }
    const data = await resp.json() as any
    const text = data.choices?.[0]?.message?.content?.trim()
    if (!text) return { ok: false, error: 'Groq returned an empty response.' }
    return { ok: true, fixedCode: stripCodeFences(text), explanation: `Auto-fixed by BreakShield CI: ${req.description}` }
  } catch (e: any) {
    return { ok: false, error: `Groq error: ${e.message ?? String(e)}` }
  }
}

async function fixWithPerplexity(req: FixRequest, apiKey: string, model: string): Promise<FixResult> {
  try {
    const resp = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: buildPrompt(req) }],
        temperature: 0.1,
        max_tokens: 4096,
      }),
    })
    if (resp.status === 401) return { ok: false, error: 'Invalid Perplexity API key. Check your key in Settings.' }
    if (resp.status === 429) return { ok: false, error: 'Perplexity rate limit reached. Try again later.' }
    const data = await resp.json() as any
    const text = data.choices?.[0]?.message?.content?.trim()
    if (!text) return { ok: false, error: 'Perplexity returned an empty response.' }
    return { ok: true, fixedCode: stripCodeFences(text), explanation: `Auto-fixed by BreakShield CI: ${req.description}` }
  } catch (e: any) {
    return { ok: false, error: `Perplexity error: ${e.message ?? String(e)}` }
  }
}

// ─── Main fix function ────────────────────────────────────────────────────────

export async function generateFix(req: FixRequest): Promise<FixResult> {
  const provider = req.provider ?? 'gemini'
  const model    = req.model    ?? DEFAULT_MODEL[provider]
  const apiKey   = req.userApiKey ?? process.env.GEMINI_API_KEY

  if (!apiKey) {
    return { ok: false, error: 'No API key available. Add your key in Settings.' }
  }

  switch (provider) {
    case 'gemini':     return fixWithGemini(req, apiKey, model)
    case 'openai':     return fixWithOpenAI(req, apiKey, model)
    case 'anthropic':  return fixWithAnthropic(req, apiKey, model)
    case 'groq':       return fixWithGroq(req, apiKey, model)
    case 'perplexity': return fixWithPerplexity(req, apiKey, model)
    default:           return fixWithGemini(req, apiKey, model)
  }
}
