/**
 * lib/autofix/gemini.ts
 *
 * Uses Google Gemini Flash to generate code fixes for breaking changes.
 * Sends only the affected file + finding context — minimal token usage.
 */

import { GoogleGenAI } from '@google/genai'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FixRequest {
  filePath:    string
  fileContent: string
  changeType:  string
  affectedValue: string
  description: string
  beforeSchema?: string
  afterSchema?:  string
  /** Optional: user's own Gemini API key (BYOK) */
  userApiKey?: string
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

// ─── Main fix function ────────────────────────────────────────────────────────

export async function generateFix(req: FixRequest): Promise<FixResult> {
  const apiKey = req.userApiKey ?? process.env.GEMINI_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'No Gemini API key available. Add your key in Settings.' }
  }

  try {
    const ai = new GoogleGenAI({ apiKey })

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: buildPrompt(req),
      config: {
        temperature: 0.1,  // Low temperature for deterministic code output
        maxOutputTokens: 4096,
      },
    })

    const fixedCode = response.text?.trim()
    if (!fixedCode) {
      return { ok: false, error: 'Gemini returned empty response' }
    }

    // Strip markdown code blocks if model added them despite instructions
    const cleaned = fixedCode
      .replace(/^```(?:typescript|ts|javascript|js)?\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim()

    return {
      ok: true,
      fixedCode: cleaned,
      explanation: `Auto-fixed by BreakShield CI: ${req.description}`,
    }
  } catch (e: any) {
    if (e.message?.includes('API_KEY_INVALID') || e.message?.includes('INVALID_ARGUMENT')) {
      return { ok: false, error: 'Invalid Gemini API key. Check your key in Settings.' }
    }
    if (e.message?.includes('RESOURCE_EXHAUSTED') || e.message?.includes('quota')) {
      return { ok: false, error: 'Gemini API quota exceeded. Try again later or add your own API key.' }
    }
    return { ok: false, error: `Gemini error: ${e.message ?? String(e)}` }
  }
}
