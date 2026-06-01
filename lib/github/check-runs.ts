/**
 * lib/github/check-runs.ts
 *
 * Creates and updates GitHub Check Runs for BreakShield.
 * Check Runs appear as status checks in the PR — separate from the PR comment.
 *
 * Run lifecycle:
 *   1. createCheckRun()   — called immediately when webhook received (in_progress)
 *   2. completeCheckRun() — called after analysis finishes
 *   3. failCheckRun()     — called if analysis throws
 */

import { Octokit }       from '@octokit/rest'
import type { RiskAssessment, Finding, RiskLevel } from '../analysis/types'
import { isBreakingChange }                        from '../analysis/types'
import {
  RISK_LABELS,
  RISK_CHECK_CONCLUSION,
  RISK_DESCRIPTIONS,
  shouldBlockMerge,
} from '../analysis/risk-engine'
import { confidenceLabel } from '../analysis/confidence'

const APP_URL    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://breakshield.dev'
const CHECK_NAME = 'BreakShield'

// ─── Create in-progress check run ────────────────────────────────────────────

export async function createCheckRun(
  octokit:  Octokit,
  owner:    string,
  repo:     string,
  headSha:  string,
  prNumber: number,
): Promise<number> {
  const resp = await octokit.request('POST /repos/{owner}/{repo}/check-runs', {
    owner,
    repo,
    name:        CHECK_NAME,
    head_sha:    headSha,
    status:      'in_progress',
    started_at:  new Date().toISOString(),
    output: {
      title:   '🔍 Analyzing API contracts…',
      summary: 'BreakShield is scanning TypeScript interfaces and OpenAPI specs for breaking changes.',
    },
    details_url: `${APP_URL}/dashboard`,
  })

  return (resp.data as any).id as number
}

// ─── Complete check run with results ─────────────────────────────────────────

export async function completeCheckRun(
  octokit:    Octokit,
  owner:      string,
  repo:       string,
  checkRunId: number,
  risk:       RiskAssessment,
  findings:   Finding[],
  durationMs: number,
): Promise<void> {
  const breaking    = findings.filter(f => isBreakingChange(f.changeType))
  const conclusion  = RISK_CHECK_CONCLUSION[risk.riskLevel]
  const riskLabel   = RISK_LABELS[risk.riskLevel]

  const title = buildTitle(risk, breaking)
  const summary = buildSummary(risk, findings, durationMs)
  const text    = buildDetails(findings)

  await octokit.request('PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}', {
    owner,
    repo,
    check_run_id: checkRunId,
    status:       'completed',
    completed_at: new Date().toISOString(),
    conclusion:   conclusion as any,
    output: { title, summary, text },
    details_url:  `${APP_URL}/dashboard`,
  })
}

// ─── Fail check run ───────────────────────────────────────────────────────────

export async function failCheckRun(
  octokit:    Octokit,
  owner:      string,
  repo:       string,
  checkRunId: number,
  error:      string,
): Promise<void> {
  await octokit.request('PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}', {
    owner,
    repo,
    check_run_id: checkRunId,
    status:       'completed',
    completed_at: new Date().toISOString(),
    conclusion:   'action_required',
    output: {
      title:   '⚠️ Analysis failed',
      summary: `BreakShield encountered an error: ${error.slice(0, 200)}`,
      text:    'Please retry by pushing a new commit. If the problem persists, check the BreakShield dashboard for details.',
    },
  })
}

// ─── Title builder ────────────────────────────────────────────────────────────

function buildTitle(risk: RiskAssessment, breaking: Finding[]): string {
  const label = RISK_LABELS[risk.riskLevel]
  if (breaking.length === 0) return `${label} — No breaking changes`

  const parts: string[] = [
    `${breaking.length} breaking change${breaking.length > 1 ? 's' : ''}`,
  ]
  if (risk.totalConsumersAffected > 0) {
    parts.push(
      `${risk.totalConsumersAffected} consumer${risk.totalConsumersAffected > 1 ? 's' : ''} affected`,
    )
  }

  return `${label} — ${parts.join(', ')}`
}

// ─── Summary (shown in check run panel) ──────────────────────────────────────

function buildSummary(
  risk:       RiskAssessment,
  findings:   Finding[],
  durationMs: number,
): string {
  const breaking = findings.filter(f => isBreakingChange(f.changeType))
  const lines: string[] = []

  lines.push(`**Risk Level: ${RISK_LABELS[risk.riskLevel]}** (score: ${risk.riskScore}/100)`)
  lines.push('')
  lines.push(RISK_DESCRIPTIONS[risk.riskLevel])
  lines.push('')

  if (breaking.length === 0) {
    lines.push('✅ No breaking API changes detected in this PR.')
  } else {
    lines.push('| Metric | Value |')
    lines.push('|:--|:--|')
    lines.push(`| Breaking changes | **${risk.breakingCount}** |`)
    lines.push(`| Consumer files affected | **${risk.totalConsumersAffected}** |`)
    lines.push(`| Max confidence | **${risk.maxConfidence}%** |`)

    const { critical, high, medium, low } = risk.summary
    if (critical > 0) lines.push(`| Critical severity | ${critical} |`)
    if (high > 0)     lines.push(`| High severity | ${high} |`)
    if (medium > 0)   lines.push(`| Medium severity | ${medium} |`)
    if (low > 0)      lines.push(`| Low severity | ${low} |`)
  }

  lines.push('')
  lines.push(`_Analyzed in ${(durationMs / 1000).toFixed(1)}s · Powered by [BreakShield](${APP_URL})_`)

  if (shouldBlockMerge(risk.riskLevel)) {
    lines.push('')
    lines.push('> ⛔ **Merge blocked.** Resolve breaking changes or coordinate a versioned rollout before merging.')
  }

  return lines.join('\n')
}

// ─── Details (expandable full list of findings) ───────────────────────────────

function buildDetails(findings: Finding[]): string {
  const breaking = findings.filter(f => isBreakingChange(f.changeType))
  if (breaking.length === 0) return ''

  const lines: string[] = []
  lines.push('## Breaking Changes\n')

  for (const f of breaking) {
    lines.push(`### \`${f.affectedValue}\``)
    lines.push('')
    lines.push(`**Type:** ${f.changeType.replace(/_/g, ' ')}`)
    lines.push(`**File:** \`${f.sourceFile}\``)
    lines.push(`**Confidence:** ${confidenceLabel(f.confidence)}`)
    lines.push(`**Description:** ${f.description}`)

    if (f.beforeSchema || f.afterSchema) {
      lines.push('')
      if (f.beforeSchema) lines.push(`**Before:** \`${f.beforeSchema.slice(0, 150)}\``)
      if (f.afterSchema)  lines.push(`**After:**  \`${f.afterSchema.slice(0, 150)}\``)
    }

    if (f.evidence.length > 0) {
      lines.push('')
      lines.push('**Affected files:**')
      for (const ev of f.evidence.slice(0, 8)) {
        const loc = ev.lineNumber ? `:${ev.lineNumber}` : ''
        lines.push(`- \`${ev.repository}/${ev.filePath}${loc}\` (${ev.confidence}%)`)
      }
      if (f.evidence.length > 8) {
        lines.push(`- _…and ${f.evidence.length - 8} more_`)
      }
    } else {
      lines.push('')
      lines.push('_No consumer usages found in this repository._')
    }

    lines.push('')
    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}
