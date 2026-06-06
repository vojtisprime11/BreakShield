/**
 * app/api/autofix/route.ts
 *
 * Generates an AI fix for a breaking change and creates a GitHub PR.
 * Reads the user's saved AI provider + key from user_settings (BYOK).
 *
 * POST /api/autofix
 * Body: {
 *   owner, repo, baseBranch, prNumber,
 *   filePath, headSha,
 *   finding: { changeType, affectedValue, description, beforeSchema?, afterSchema? },
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { Octokit } from '@octokit/rest'
import { getSession } from '@/lib/auth'
import { getInstallationOctokit } from '@/lib/github/client'
import { generateFix, AIProvider } from '@/lib/autofix/gemini'
import { createFixPR } from '@/lib/autofix/pr-creator'
import { supabaseAdmin } from '@/lib/supabase'

// ─── Fetch file content at a specific ref ─────────────────────────────────────

async function fetchFile(octokit: Octokit, owner: string, repo: string, path: string, ref: string) {
  try {
    const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner, repo, path, ref,
    }) as any
    if (data.content && data.encoding === 'base64') {
      return {
        content: Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8'),
        sha: data.sha as string,
      }
    }
    return null
  } catch {
    return null
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession(req)
  if (!session) {
    return NextResponse.json({ error: 'Sign in to use auto-fix' }, { status: 401 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const {
    owner, repo, baseBranch, prNumber,
    filePath, headSha,
    finding,
    installationId,
  } = body

  if (!owner || !repo || !filePath || !finding) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // ── Load user's saved AI provider & key from settings ────────────────────
  const db = supabaseAdmin()
  const { data: settings } = await db
    .from('user_settings')
    .select('ai_provider, ai_api_key')
    .eq('github_login', session.login)
    .single()

  const savedApiKey   = (settings as any)?.ai_api_key  as string | null
  const savedProvider = (settings as any)?.ai_provider as AIProvider | null
  const savedModel    = (settings as any)?.ai_model    as string | null

  const resolvedApiKey: string | undefined = savedApiKey ?? undefined
  const resolvedProvider: AIProvider       = savedProvider ?? 'gemini'
  const resolvedModel: string | undefined  = savedModel ?? undefined

  // ── Get Octokit ──────────────────────────────────────────────────────────
  // For reading files, use installation token or user token
  // For creating PRs, prefer installation token > bot token > user token
  let octokit: Octokit
  let writeOctokit: Octokit

  if (installationId) {
    try {
      const installOctokit = await getInstallationOctokit(installationId) as unknown as Octokit
      octokit = installOctokit
      writeOctokit = installOctokit // installation token has write access if app permissions allow
    } catch {
      octokit = new Octokit({ auth: session.accessToken })
      const botToken = process.env.GITHUB_BOT_TOKEN
      writeOctokit = botToken ? new Octokit({ auth: botToken }) : octokit
    }
  } else {
    octokit = new Octokit({ auth: session.accessToken })
    const botToken = process.env.GITHUB_BOT_TOKEN
    writeOctokit = botToken ? new Octokit({ auth: botToken }) : octokit
  }

  // ── Fetch the file to fix ────────────────────────────────────────────────
  const ref = headSha || baseBranch || 'HEAD'
  const file = await fetchFile(octokit, owner, repo, filePath, ref)
  if (!file) {
    return NextResponse.json({ error: `Could not fetch file: ${filePath}` }, { status: 400 })
  }

  // ── Generate fix with selected AI provider ───────────────────────────────
  const providerNames: Record<AIProvider, string> = {
    gemini: 'Google Gemini',
    openai: 'OpenAI',
    anthropic: 'Anthropic Claude',
    groq: 'Groq',
    perplexity: 'Perplexity',
  }

  const fixResult = await generateFix({
    filePath,
    fileContent:   file.content,
    changeType:    finding.changeType,
    affectedValue: finding.affectedValue,
    description:   finding.description,
    beforeSchema:  finding.beforeSchema,
    afterSchema:   finding.afterSchema,
    userApiKey:    resolvedApiKey,
    provider:      resolvedProvider,
    model:         resolvedModel,
  })

  if (!fixResult.ok || !fixResult.fixedCode) {
    const providerLabel = providerNames[resolvedProvider] ?? 'AI'
    const upgradeHint = resolvedProvider === 'gemini'
      ? ' Try switching to a stronger model like Claude Sonnet 4.6 or GPT-5.4 in ⚙ AI Settings for better results.'
      : resolvedProvider === 'groq'
      ? ' Groq models are fast but may struggle with complex fixes. Try Claude Sonnet 4.6 or GPT-5.4 in ⚙ AI Settings.'
      : resolvedProvider === 'perplexity'
      ? ' Perplexity models are optimized for search, not code generation. Try Claude Sonnet 4.6 or GPT-5.4 in ⚙ AI Settings.'
      : resolvedProvider === 'openai'
      ? ' Try upgrading to GPT-5.5 or Claude Opus 4.8 in ⚙ AI Settings for more complex fixes.'
      : ' Try a more capable model in ⚙ AI Settings for better results.'
    return NextResponse.json({
      error: (fixResult.error ?? `${providerLabel} could not generate a fix.`) + upgradeHint,
    }, { status: 500 })
  }

  // Don't create PR if content is unchanged
  if (fixResult.fixedCode.trim() === file.content.trim()) {
    const upgradeMsg = resolvedProvider === 'gemini' || resolvedProvider === 'groq'
      ? 'This model couldn\'t determine a proper fix. For complex breaking changes, configure a stronger AI (Claude Sonnet 4.6 or GPT-5.4) in ⚙ AI Settings — they handle nuanced code rewrites much better.'
      : 'The AI could not determine a fix for this change. Try a more capable model (Claude Opus 4.8 or GPT-5.5) in ⚙ AI Settings, or fix manually.'
    return NextResponse.json({
      error: upgradeMsg,
    }, { status: 422 })
  }

  // ── Create PR with fix ───────────────────────────────────────────────────
  const providerLabelForPR = providerNames[resolvedProvider] ?? 'AI'

  const prBody = `## BreakShield CI — Auto-fix

This PR was automatically generated to fix a breaking API change detected in PR #${prNumber ?? '?'}.

### What was fixed
| | |
|:--|:--|
| **File** | \`${filePath}\` |
| **Change** | ${finding.changeType.replace(/_/g, ' ')} |
| **Affected** | \`${finding.affectedValue}\` |
| **Description** | ${finding.description} |
${finding.beforeSchema ? `| **Before** | \`${finding.beforeSchema}\` |` : ''}
${finding.afterSchema  ? `| **After** | \`${finding.afterSchema}\` |` : ''}

### How to use
1. Review the changes in this PR
2. If the fix looks correct, click **Merge**
3. If not, close this PR and fix manually

---
*Generated by [BreakShield CI](https://breakshield-ci.vercel.app) using ${providerLabelForPR}*`

  const prTitle = `fix: [BreakShield] auto-fix ${finding.changeType.replace(/_/g, ' ')} in ${filePath.split('/').pop()}`

  const prResult = await createFixPR({
    octokit: writeOctokit,
    owner, repo,
    baseBranch: baseBranch ?? 'main',
    filePath,
    originalSha: file.sha,
    fixedContent: fixResult.fixedCode,
    prTitle,
    prBody,
  })

  if (!prResult.ok) {
    const msg = prResult.error ?? 'PR creation failed'
    if (msg.includes('Resource not accessible') || msg.includes('Not Found') || msg.includes('403')) {
      return NextResponse.json({
        error: 'GitHub permission denied. Please log out and log back in to grant repo access.',
      }, { status: 403 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    prUrl: prResult.prUrl,
    prNumber: prResult.prNumber,
    branch: prResult.branch,
  })
}
