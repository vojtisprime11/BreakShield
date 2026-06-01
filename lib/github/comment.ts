/**
 * lib/github/comment.ts
 *
 * Evidence-first PR comment generator.
 *
 * Every breaking change shows:
 *   1. What changed (type, file, confidence)
 *   2. Where it's used (file:line with clickable GitHub link + code snippet)
 *   3. What to do (actionable advice for CRITICAL/HIGH)
 *
 * Design rules:
 *   - No finding reported without a clear description
 *   - Evidence sorted by confidence (highest first)
 *   - Non-breaking changes collapsed by default (ℹ️ summary)
 *   - Footer anchors to BreakShield dashboard for more detail
 */

import type { Finding, EvidenceItem, RiskAssessment, RiskLevel } from '../analysis/types'
import { isBreakingChange } from '../analysis/types'
import { RISK_LABELS, RISK_DESCRIPTIONS, shouldBlockMerge } from '../analysis/risk-engine'
import { getConfidenceTier, confidenceLabel } from '../analysis/confidence'
import { Octokit } from '@octokit/rest'

const APP_URL             = process.env.NEXT_PUBLIC_APP_URL ?? 'https://breakshield.dev'
const BREAKSHIELD_MARKER  = '<!-- breakshield-v2 -->'

// ─── Post / update PR comment ─────────────────────────────────────────────────

export async function upsertPRComment(
  octokit:    Octokit,
  owner:      string,
  repo:       string,
  prNumber:   number,
  body:       string,
  existingId?: number | null,
): Promise<number> {
  if (existingId) {
    await octokit.request('PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}', {
      owner, repo, comment_id: existingId, body,
    })
    return existingId
  }

  const resp = await octokit.request(
    'POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
    { owner, repo, issue_number: prNumber, body },
  )
  return (resp.data as any).id as number
}

// ─── Main comment generator ───────────────────────────────────────────────────

export function generateComment(
  findings:     Finding[],
  risk:         RiskAssessment,
  prNumber:     number,
  repoFullName: string,
  durationMs?:  number,
): string {
  const breaking    = findings.filter(f => isBreakingChange(f.changeType))
  const nonBreaking = findings.filter(f => !isBreakingChange(f.changeType))

  const lines: string[] = [BREAKSHIELD_MARKER, '']

  // ── Header ────────────────────────────────────────────────────────────────
  lines.push(`## ⚡ BreakShield — API Contract Analysis`)
  lines.push('')

  // ── Risk badge ────────────────────────────────────────────────────────────
  lines.push(...renderRiskBadge(breaking, risk))
  lines.push('')

  // ── Breaking changes ──────────────────────────────────────────────────────
  if (breaking.length > 0) {
    lines.push('---')
    lines.push('')
    lines.push('### 🔴 Breaking Changes')
    lines.push('')

    for (const finding of breaking) {
      lines.push(...renderFinding(finding, repoFullName))
    }
  }

  // ── Non-breaking changes (collapsed) ─────────────────────────────────────
  if (nonBreaking.length > 0) {
    lines.push('<details>')
    lines.push(
      `<summary>ℹ️ ${nonBreaking.length} additive change${nonBreaking.length > 1 ? 's' : ''} ` +
      `(non-breaking — safe to merge)</summary>`,
    )
    lines.push('')
    for (const f of nonBreaking) {
      lines.push(`- \`${f.affectedValue}\` — ${f.description}`)
    }
    lines.push('')
    lines.push('</details>')
    lines.push('')
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  lines.push('---')
  const dur = durationMs ? ` · ${(durationMs / 1000).toFixed(1)}s` : ''
  lines.push(
    `<sub>🛡️ [BreakShield](${APP_URL}) · AST-verified${dur} · ` +
    `PR #${prNumber} in \`${repoFullName}\`</sub>`,
  )

  return lines.join('\n')
}

// ─── Risk badge ───────────────────────────────────────────────────────────────

function renderRiskBadge(breaking: Finding[], risk: RiskAssessment): string[] {
  const lines: string[] = []

  if (breaking.length === 0) {
    lines.push('> ✅ **No breaking API changes detected** in this PR.')
    return lines
  }

  const label      = RISK_LABELS[risk.riskLevel]
  const consumers  = risk.totalConsumersAffected
  const consumerTxt = consumers > 0
    ? ` · **${consumers} file${consumers !== 1 ? 's' : ''}** with verified usages`
    : ''
  const changeTxt   = `${breaking.length} breaking change${breaking.length > 1 ? 's' : ''}`

  lines.push(`> **${label}** — ${changeTxt}${consumerTxt}`)

  if (shouldBlockMerge(risk.riskLevel)) {
    lines.push(`>`)
    lines.push(`> ⛔ ${RISK_DESCRIPTIONS[risk.riskLevel]}`)
    lines.push(`>`)
    lines.push(`> **What to do:**`)
    lines.push(actionAdvice(risk.riskLevel))
  }

  return lines
}

function actionAdvice(level: RiskLevel): string {
  if (level === 'CRITICAL') {
    return (
      '> 1. Notify all consumer teams listed below before merging.\n' +
      '> 2. Either revert the breaking change, or version the API (v2 endpoint/type).\n' +
      '> 3. Merge only after all consumers are updated or have explicitly acknowledged the change.'
    )
  }
  return (
    '> 1. Review the consumers listed below.\n' +
    '> 2. Coordinate deployment or ensure backward compatibility.\n' +
    '> 3. Consider a deprecation notice before removal.'
  )
}

// ─── Single finding renderer ──────────────────────────────────────────────────

function renderFinding(finding: Finding, repoFullName: string): string[] {
  const lines: string[] = []

  // Title
  lines.push(`#### \`${finding.affectedValue}\``)
  lines.push('')

  // Metadata table
  lines.push('| | |')
  lines.push('|:--|:--|')
  lines.push(`| **Change** | ${finding.changeType.replace(/_/g, ' ')} |`)
  lines.push(`| **File** | \`${esc(finding.sourceFile)}\` |`)
  lines.push(`| **Description** | ${esc(finding.description)} |`)
  lines.push(`| **Confidence** | ${confidenceLabel(finding.confidence)} |`)

  if (finding.beforeSchema && finding.afterSchema) {
    lines.push(`| **Before** | \`${esc(finding.beforeSchema)}\` |`)
    lines.push(`| **After** | \`${esc(finding.afterSchema)}\` |`)
  } else if (finding.beforeSchema) {
    lines.push(`| **Was** | \`${esc(finding.beforeSchema)}\` |`)
  } else if (finding.afterSchema) {
    lines.push(`| **Now** | \`${esc(finding.afterSchema)}\` |`)
  }
  lines.push('')

  // Evidence
  if (finding.evidence.length === 0) {
    lines.push('> ℹ️ _No consumer usages found in this repository._')
    lines.push('> _The API change is still breaking — external clients or other repositories may be affected._')
    lines.push('')
  } else {
    const highConf = finding.evidence.filter(e => e.confidence >= 80)
    const lowConf  = finding.evidence.filter(e => e.confidence < 80)

    if (highConf.length > 0) {
      lines.push(
        `**${highConf.length} verified consumer${highConf.length !== 1 ? 's' : ''}:**`,
      )
      lines.push('')
      for (const ev of highConf.slice(0, 6)) {
        lines.push(...renderEvidence(ev))
      }
      if (highConf.length > 6) {
        lines.push(`> _…and ${highConf.length - 6} more verified usage${highConf.length - 6 > 1 ? 's' : ''}_`)
        lines.push('')
      }
    }

    if (lowConf.length > 0) {
      lines.push('<details>')
      lines.push(
        `<summary>${lowConf.length} additional possible consumer${lowConf.length > 1 ? 's' : ''} ` +
        `(lower confidence — not AST-verified)</summary>`,
      )
      lines.push('')
      for (const ev of lowConf.slice(0, 4)) {
        lines.push(...renderEvidence(ev))
      }
      lines.push('</details>')
      lines.push('')
    }
  }

  lines.push('---')
  lines.push('')

  return lines
}

// ─── Single evidence item renderer ───────────────────────────────────────────

function renderEvidence(ev: EvidenceItem): string[] {
  const lines: string[] = []
  const loc      = ev.lineNumber ? `:${ev.lineNumber}` : ''
  const linkHref = buildGitHubLink(ev)
  const linkText = linkHref ? ` · [view ↗](${linkHref})` : ''
  const tier     = getConfidenceTier(ev.confidence)

  // File line (compact: repo/file:line)
  lines.push(`**\`${ev.repository}/${ev.filePath}${loc}\`**${linkText}`)

  // Code snippet
  if (ev.codeSnippet && ev.codeSnippet.trim()) {
    const ext = ev.filePath.split('.').pop() ?? 'ts'
    const lang = EXT_TO_LANG[ext] ?? ext
    lines.push(`\`\`\`${lang}`)
    lines.push(ev.codeSnippet.trim().slice(0, 300))
    lines.push('```')
  }

  // Confidence + usage type (compact single line)
  const usageLabel = ev.usageType.replace(/_/g, ' ')
  const confTierLabel = tier === 'HIGH' ? 'AST-verified' :
                        tier === 'MEDIUM' ? 'probable match' : 'weak signal'
  lines.push(`<sub>${ev.confidence}% · ${confTierLabel} · ${usageLabel}</sub>`)
  lines.push('')

  return lines
}

// ─── GitHub blob URL builder ──────────────────────────────────────────────────

function buildGitHubLink(ev: EvidenceItem): string | null {
  if (!ev.lineNumber || !ev.repository || !ev.filePath) return null
  return `https://github.com/${ev.repository}/blob/HEAD/${ev.filePath}#L${ev.lineNumber}`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  py: 'python', go: 'go', java: 'java', rb: 'ruby', rs: 'rust',
  yaml: 'yaml', yml: 'yaml', json: 'json', md: 'markdown',
}

/** Escape pipe and backtick for use inside markdown table cells */
function esc(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/`/g, "'").replace(/\n/g, ' ').slice(0, 200)
}
