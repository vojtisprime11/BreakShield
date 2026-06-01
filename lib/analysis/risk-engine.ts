/**
 * lib/analysis/risk-engine.ts
 *
 * Deterministic risk scoring.
 * Input: findings with evidence.
 * Output: RiskLevel + composite score.
 *
 * Design principle: risk escalates with blast radius and certainty.
 * A CRITICAL finding with 0 consumers is HIGH.
 * A MEDIUM finding with 5 certain consumers can be CRITICAL.
 */

import type { Finding, RiskLevel, RiskAssessment, ChangeType, Severity } from './types'
import { isBreakingChange } from './types'
import { CONFIDENCE_THRESHOLDS } from './confidence'

// ─── Base impact scores per change type ──────────────────────────────────────
// These represent the inherent severity of the API contract violation
// before consumer blast radius is factored in.

const BASE_IMPACT: Record<ChangeType, number> = {
  removed_endpoint:      90,  // Every caller of this endpoint breaks
  removed_interface:     80,  // Every consumer of this type breaks
  removed_field:         75,  // Consumers reading this field break
  changed_type:          70,  // Consumers with type assumptions break
  removed_parameter:     70,  // Every caller must update their call
  changed_required:      65,  // Callers that omitted this field break
  added_required_field:  60,  // Callers constructing this type break
  changed_return_type:   60,  // Callers using the return value break
  added_optional_field:   5,  // Non-breaking, informational
}

// ─── Consumer multiplier ──────────────────────────────────────────────────────
// More consumers = higher blast radius = higher risk.
// Uses log scale to avoid a single file with 100 hits dominating.

function consumerMultiplier(consumerCount: number): number {
  if (consumerCount === 0) return 0.6   // change is real but impact unknown
  if (consumerCount === 1) return 1.0
  if (consumerCount <= 3)  return 1.2
  if (consumerCount <= 7)  return 1.4
  if (consumerCount <= 15) return 1.6
  return 1.8
}

// ─── Confidence modifier ──────────────────────────────────────────────────────
// Low-confidence findings get downweighted so uncertain heuristics don't
// trigger merge blocks.

function confidenceModifier(confidence: number): number {
  if (confidence >= CONFIDENCE_THRESHOLDS.HIGH)   return 1.0
  if (confidence >= CONFIDENCE_THRESHOLDS.MEDIUM) return 0.8
  if (confidence >= CONFIDENCE_THRESHOLDS.LOW)    return 0.55
  return 0.3
}

// ─── Per-finding score ────────────────────────────────────────────────────────

function scoreFinding(finding: Finding): number {
  if (!isBreakingChange(finding.changeType)) return 0

  const baseImpact   = BASE_IMPACT[finding.changeType]
  const consumers    = uniqueConsumerCount(finding)
  const consumerMult = consumerMultiplier(consumers)
  const confMod      = confidenceModifier(finding.confidence)

  return baseImpact * consumerMult * confMod
}

function uniqueConsumerCount(finding: Finding): number {
  const files = new Set(finding.evidence.map(e => `${e.repository}:${e.filePath}`))
  return files.size
}

// ─── Aggregate risk across all findings ──────────────────────────────────────

/**
 * Calculate overall PR risk from all findings.
 *
 * Algorithm:
 * 1. Score each breaking finding independently.
 * 2. Use the 90th-percentile score (not the max) to avoid
 *    a single noisy finding distorting the result.
 * 3. Apply a count penalty for PRs with many breaking changes.
 * 4. Map the numeric score to a risk level.
 */
export function calculateRisk(findings: Finding[]): RiskAssessment {
  const breaking = findings.filter(f => isBreakingChange(f.changeType))

  if (breaking.length === 0) {
    return buildAssessment('SAFE', 0, findings)
  }

  // Score each finding
  const scores = breaking.map(scoreFinding).filter(s => s > 0).sort((a, b) => b - a)

  if (scores.length === 0) {
    return buildAssessment('SAFE', 0, findings)
  }

  // P90 score (or max if few findings)
  const p90Index   = Math.floor(scores.length * 0.1)
  const p90Score   = scores[p90Index] ?? scores[0] ?? 0

  // Count penalty: lots of breaking changes = higher risk
  const countPenalty = Math.min(20, (breaking.length - 1) * 3)

  const composite = Math.min(100, Math.round(p90Score + countPenalty))
  const level     = scoreToLevel(composite, breaking)

  return buildAssessment(level, composite, findings)
}

function scoreToLevel(score: number, breaking: Finding[]): RiskLevel {
  // Hard overrides first
  const hasRemovedEndpoint  = breaking.some(f => f.changeType === 'removed_endpoint'
    && f.confidence >= CONFIDENCE_THRESHOLDS.HIGH)
  const hasRemovedInterface = breaking.some(f => f.changeType === 'removed_interface'
    && f.confidence >= CONFIDENCE_THRESHOLDS.HIGH)

  // Removing public endpoint/type with verified consumers = always CRITICAL
  if ((hasRemovedEndpoint || hasRemovedInterface)) {
    const hasVerifiedConsumers = breaking
      .filter(f => ['removed_endpoint', 'removed_interface'].includes(f.changeType))
      .some(f => f.evidence.some(e => e.confidence >= CONFIDENCE_THRESHOLDS.HIGH))
    if (hasVerifiedConsumers) return 'CRITICAL'
  }

  // Score-based levels
  if (score >= 85) return 'CRITICAL'
  if (score >= 65) return 'HIGH'
  if (score >= 40) return 'MEDIUM'
  if (score >= 15) return 'LOW'
  return 'SAFE'
}

function buildAssessment(
  level:    RiskLevel,
  score:    number,
  findings: Finding[]
): RiskAssessment {
  const allConsumers = new Set(
    findings.flatMap(f => f.evidence.map(e => `${e.repository}:${e.filePath}`))
  )

  const summary = {
    critical: findings.filter(f => f.severity === 'critical').length,
    high:     findings.filter(f => f.severity === 'high').length,
    medium:   findings.filter(f => f.severity === 'medium').length,
    low:      findings.filter(f => f.severity === 'low').length,
    safe:     findings.filter(f => f.severity === 'safe').length,
  }

  return {
    riskLevel:              level,
    riskScore:              score,
    breakingCount:          findings.filter(f => isBreakingChange(f.changeType)).length,
    totalConsumersAffected: allConsumers.size,
    maxConfidence:          findings.length > 0
      ? Math.max(...findings.map(f => f.confidence))
      : 0,
    summary,
  }
}

// ─── Risk level helpers ───────────────────────────────────────────────────────

export const RISK_LABELS: Record<RiskLevel, string> = {
  CRITICAL: '🔴 CRITICAL',
  HIGH:     '🟠 HIGH',
  MEDIUM:   '🟡 MEDIUM',
  LOW:      '🟢 LOW',
  SAFE:     '✅ SAFE',
}

export const RISK_CHECK_STATUS: Record<RiskLevel, 'success' | 'failure' | 'neutral'> = {
  CRITICAL: 'failure',
  HIGH:     'failure',
  MEDIUM:   'neutral',
  LOW:      'success',
  SAFE:     'success',
}

export const RISK_CHECK_CONCLUSION: Record<RiskLevel, 'success' | 'failure' | 'neutral'> = {
  CRITICAL: 'failure',
  HIGH:     'failure',
  MEDIUM:   'neutral',
  LOW:      'success',
  SAFE:     'success',
}

/** Returns true if this risk level should block merge */
export function shouldBlockMerge(level: RiskLevel): boolean {
  return level === 'CRITICAL' || level === 'HIGH'
}

export const RISK_DESCRIPTIONS: Record<RiskLevel, string> = {
  CRITICAL: 'This PR will break deployed consumers. Do not merge without coordination.',
  HIGH:     'Breaking changes detected with high confidence. Review required before merge.',
  MEDIUM:   'Possible breaking changes. Verify consumers before deploying.',
  LOW:      'Minor concerns detected. Review recommended.',
  SAFE:     'No breaking API changes detected.',
}
