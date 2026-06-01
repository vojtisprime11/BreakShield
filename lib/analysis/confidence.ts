/**
 * lib/analysis/confidence.ts
 *
 * Evidence-based confidence scoring.
 * A finding with no evidence = confidence 0 = not shown to developer.
 * A finding with AST-verified direct access = confidence ~90–95.
 *
 * Confidence is NOT about whether the code is broken.
 * It's about how sure we are that this specific file/line uses the changed API.
 */

import type { EvidenceItem, UsageType, Finding } from './types'

// ─── Per-usage-type base confidence ──────────────────────────────────────────
// These are the starting points before context modifiers are applied.

const BASE_CONFIDENCE: Record<UsageType, number> = {
  direct_access:    90,   // obj.field — AST-verified, unambiguous
  destructuring:    80,   // const { field } = obj — strong signal
  type_annotation:  80,   // : UserResponse — clear type dependency
  object_literal:   65,   // { field: value } — could be different field same name
  string_literal:   55,   // fetch('/users/id') — correct path, probably right consumer
  search_heuristic: 35,   // GitHub Search only, not AST-verified
}

// ─── Context modifiers ────────────────────────────────────────────────────────

/**
 * Boost confidence if the surrounding code snippet contains additional
 * corroborating signals.
 */
function contextModifier(snippet: string, affectedValue: string): number {
  let boost = 0

  // Snippet contains the full qualified name (e.g. 'user.email')
  const parts = affectedValue.split('.')
  if (parts.length >= 2) {
    const objectHint = parts[parts.length - 2] ?? ''
    const fieldHint  = parts[parts.length - 1] ?? ''
    if (objectHint && fieldHint && snippet.includes(objectHint) && snippet.includes(fieldHint)) {
      boost += 8
    }
  }

  // Snippet is in a test file — reduce confidence (test may be outdated)
  if (snippet.includes('.test') || snippet.includes('.spec')) {
    boost -= 15
  }

  // Snippet is a comment — reduce confidence significantly
  if (snippet.trim().startsWith('//') || snippet.trim().startsWith('*')) {
    boost -= 25
  }

  // Snippet is in a type-casting context — slightly less certain about runtime
  if (snippet.includes(' as ') || snippet.includes('type ')) {
    boost -= 5
  }

  return boost
}

// ─── Score a single evidence item ────────────────────────────────────────────

export function scoreEvidence(
  item:          Omit<EvidenceItem, 'confidence'>,
  affectedValue: string
): number {
  const base    = BASE_CONFIDENCE[item.usageType]
  const ctx     = contextModifier(item.codeSnippet, affectedValue)
  const score   = Math.max(0, Math.min(100, base + ctx))
  return score
}

// ─── Aggregate confidence for a finding ──────────────────────────────────────

/**
 * The finding's confidence is the MAX of all its evidence items.
 * One high-confidence piece of evidence is sufficient —
 * we don't average down just because some matches are weaker.
 */
export function aggregateConfidence(items: Pick<EvidenceItem, 'confidence'>[]): number {
  if (items.length === 0) return 0
  return Math.max(...items.map(e => e.confidence))
}

// ─── Confidence thresholds ────────────────────────────────────────────────────

export const CONFIDENCE_THRESHOLDS = {
  /** Show in PR comment and Check Run as definite finding */
  HIGH:   80,
  /** Show with a note that this is a probable match */
  MEDIUM: 55,
  /** Include in summary only, don't highlight */
  LOW:    35,
  /** Filter out entirely — noise */
  NOISE:  0,
} as const

export type ConfidenceTier = 'HIGH' | 'MEDIUM' | 'LOW' | 'NOISE'

export function getConfidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= CONFIDENCE_THRESHOLDS.HIGH)   return 'HIGH'
  if (confidence >= CONFIDENCE_THRESHOLDS.MEDIUM) return 'MEDIUM'
  if (confidence >= CONFIDENCE_THRESHOLDS.LOW)    return 'LOW'
  return 'NOISE'
}

export function confidenceLabel(confidence: number): string {
  const tier = getConfidenceTier(confidence)
  const labels: Record<ConfidenceTier, string> = {
    HIGH:   `${confidence}% — AST-verified`,
    MEDIUM: `${confidence}% — probable match`,
    LOW:    `${confidence}% — weak signal`,
    NOISE:  `${confidence}% — unverified`,
  }
  return labels[tier]
}

// ─── Filter findings below noise floor ───────────────────────────────────────

/**
 * Remove evidence items that are below the noise threshold.
 * Also removes findings that have no remaining evidence for
 * breaking changes (non-breaking findings without evidence are
 * kept since they represent known-safe changes).
 */
export function filterByConfidence(findings: Finding[]): Finding[] {
  return findings
    .map(f => ({
      ...f,
      // Filter evidence items below the LOW confidence threshold (noise floor = 35)
      evidence: f.evidence.filter(e => e.confidence >= CONFIDENCE_THRESHOLDS.LOW),
    }))
    .filter(f => {
      // Keep non-breaking findings even without evidence
      // (they are informational and have high analyzer confidence)
      if (!['removed_field', 'changed_type', 'removed_endpoint',
             'added_required_field', 'changed_required',
             'removed_parameter', 'removed_interface',
             'changed_return_type'].includes(f.changeType)) {
        return true
      }
      // Breaking findings: keep if analyzer confidence >= 75
      // (even if no consumers found — the change itself is real)
      return f.confidence >= 75
    })
}
