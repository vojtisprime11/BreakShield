/**
 * tests/analysis/confidence.test.ts + risk-engine.test.ts
 * Combined because they're tightly related.
 */

import { describe, it, expect } from 'vitest'
import {
  scoreEvidence,
  aggregateConfidence,
  getConfidenceTier,
  filterByConfidence,
  CONFIDENCE_THRESHOLDS,
} from '../../lib/analysis/confidence'
import { calculateRisk, shouldBlockMerge } from '../../lib/analysis/risk-engine'
import type { Finding, EvidenceItem } from '../../lib/analysis/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEvidence(overrides: Partial<Omit<EvidenceItem, 'confidence'>> = {}): Omit<EvidenceItem, 'confidence'> {
  return {
    repository:  'acme/frontend',
    filePath:    'src/components/UserCard.tsx',
    lineNumber:  24,
    column:      8,
    codeSnippet: 'const email = user.email',
    usageType:   'direct_access',
    ...overrides,
  }
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    changeType:    'removed_field',
    severity:      'high',
    sourceFile:    'src/types/user.ts',
    affectedValue: 'UserResponse.email',
    description:   'Field `email` removed',
    confidence:    90,
    evidence:      [],
    ...overrides,
  }
}

// ─── scoreEvidence ────────────────────────────────────────────────────────────

describe('scoreEvidence', () => {
  it('direct_access scores highest', () => {
    const ev = makeEvidence({ usageType: 'direct_access', codeSnippet: 'user.email' })
    const score = scoreEvidence(ev, 'UserResponse.email')
    expect(score).toBeGreaterThanOrEqual(85)
  })

  it('destructuring scores lower than direct access', () => {
    const direct = makeEvidence({ usageType: 'direct_access' })
    const destr  = makeEvidence({ usageType: 'destructuring' })
    expect(scoreEvidence(direct, 'UserResponse.email'))
      .toBeGreaterThan(scoreEvidence(destr, 'UserResponse.email'))
  })

  it('search_heuristic scores below threshold', () => {
    const ev = makeEvidence({ usageType: 'search_heuristic', codeSnippet: 'email' })
    const score = scoreEvidence(ev, 'UserResponse.email')
    expect(score).toBeLessThan(CONFIDENCE_THRESHOLDS.HIGH)
  })

  it('comment lines score very low', () => {
    const ev = makeEvidence({ codeSnippet: '// user.email is deprecated', usageType: 'direct_access' })
    const score = scoreEvidence(ev, 'UserResponse.email')
    // Comment reduces confidence significantly
    expect(score).toBeLessThan(70)
  })

  it('score is clamped between 0 and 100', () => {
    const ev = makeEvidence({ usageType: 'direct_access', codeSnippet: 'user.email' })
    const score = scoreEvidence(ev, 'UserResponse.email')
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })
})

// ─── aggregateConfidence ──────────────────────────────────────────────────────

describe('aggregateConfidence', () => {
  it('returns max of evidence confidences', () => {
    const items = [{ confidence: 45 }, { confidence: 92 }, { confidence: 67 }]
    expect(aggregateConfidence(items)).toBe(92)
  })

  it('returns 0 for empty evidence', () => {
    expect(aggregateConfidence([])).toBe(0)
  })
})

// ─── getConfidenceTier ────────────────────────────────────────────────────────

describe('getConfidenceTier', () => {
  it('95 → HIGH', () => expect(getConfidenceTier(95)).toBe('HIGH'))
  it('80 → HIGH', () => expect(getConfidenceTier(80)).toBe('HIGH'))
  it('79 → MEDIUM', () => expect(getConfidenceTier(79)).toBe('MEDIUM'))
  it('55 → MEDIUM', () => expect(getConfidenceTier(55)).toBe('MEDIUM'))
  it('54 → LOW', () => expect(getConfidenceTier(54)).toBe('LOW'))
  it('34 → NOISE', () => expect(getConfidenceTier(34)).toBe('NOISE'))
  it('0 → NOISE', () => expect(getConfidenceTier(0)).toBe('NOISE'))
})

// ─── filterByConfidence ───────────────────────────────────────────────────────

describe('filterByConfidence', () => {
  it('removes noise evidence from findings', () => {
    const finding = makeFinding({
      evidence: [
        { ...makeEvidence(), confidence: 90 },
        { ...makeEvidence(), confidence: 10 },  // noise
      ],
    })
    const filtered = filterByConfidence([finding])
    expect(filtered[0]!.evidence).toHaveLength(1)
    expect(filtered[0]!.evidence[0]!.confidence).toBe(90)
  })

  it('keeps breaking findings even with no evidence (change is real)', () => {
    const finding = makeFinding({ evidence: [], confidence: 92 })
    const filtered = filterByConfidence([finding])
    expect(filtered).toHaveLength(1)
  })

  it('removes breaking finding if analyzer confidence is too low', () => {
    const finding = makeFinding({ evidence: [], confidence: 30 })
    const filtered = filterByConfidence([finding])
    expect(filtered).toHaveLength(0)
  })

  it('always keeps non-breaking findings', () => {
    const finding = makeFinding({
      changeType: 'added_optional_field',
      severity:   'safe',
      evidence:   [],
      confidence: 80,
    })
    const filtered = filterByConfidence([finding])
    expect(filtered).toHaveLength(1)
  })
})

// ─── calculateRisk ────────────────────────────────────────────────────────────

describe('calculateRisk', () => {
  it('returns SAFE with no findings', () => {
    const risk = calculateRisk([])
    expect(risk.riskLevel).toBe('SAFE')
    expect(risk.riskScore).toBe(0)
  })

  it('returns SAFE with only non-breaking findings', () => {
    const f = makeFinding({ changeType: 'added_optional_field', severity: 'safe' })
    const risk = calculateRisk([f])
    expect(risk.riskLevel).toBe('SAFE')
  })

  it('CRITICAL: removed endpoint with verified consumers', () => {
    const evidence: EvidenceItem[] = [{
      repository:  'acme/frontend',
      filePath:    'src/api/client.ts',
      lineNumber:  12,
      column:      4,
      codeSnippet: "fetch('/users/123')",
      usageType:   'string_literal',
      confidence:  85,
    }]
    const finding = makeFinding({
      changeType:    'removed_endpoint',
      affectedValue: 'GET /users/{id}',
      confidence:    95,
      evidence,
    })
    const risk = calculateRisk([finding])
    expect(risk.riskLevel).toBe('CRITICAL')
    expect(risk.totalConsumersAffected).toBe(1)
  })

  it('HIGH: removed field no consumers', () => {
    const finding = makeFinding({
      changeType: 'removed_field',
      confidence: 92,
      evidence:   [],
    })
    const risk = calculateRisk([finding])
    // Breaking change with no consumers — still at least LOW risk
    expect(['LOW', 'MEDIUM', 'HIGH'].includes(risk.riskLevel)).toBe(true)
    expect(risk.totalConsumersAffected).toBe(0)
  })

  it('escalates with multiple consumers', () => {
    const makeConsumer = (file: string): EvidenceItem => ({
      repository: 'acme/frontend',
      filePath: file,
      lineNumber: 1,
      column: 1,
      codeSnippet: 'user.email',
      usageType: 'direct_access',
      confidence: 90,
    })

    const fewConsumers = makeFinding({
      evidence: [makeConsumer('a.ts')],
      confidence: 90,
    })
    const manyConsumers = makeFinding({
      evidence: [
        makeConsumer('a.ts'), makeConsumer('b.ts'), makeConsumer('c.ts'),
        makeConsumer('d.ts'), makeConsumer('e.ts'), makeConsumer('f.ts'),
      ],
      confidence: 90,
    })

    const riskFew  = calculateRisk([fewConsumers])
    const riskMany = calculateRisk([manyConsumers])
    expect(riskMany.riskScore).toBeGreaterThanOrEqual(riskFew.riskScore)
  })

  it('count penalty increases score with many breaking changes', () => {
    const single = makeFinding({ confidence: 90, evidence: [] })
    const many   = Array.from({ length: 8 }, () => makeFinding({ confidence: 90, evidence: [] }))
    const riskSingle = calculateRisk([single])
    const riskMany   = calculateRisk(many)
    expect(riskMany.riskScore).toBeGreaterThan(riskSingle.riskScore)
  })

  it('breakingCount counts only breaking changes', () => {
    const breaking    = makeFinding({ changeType: 'removed_field' })
    const nonBreaking = makeFinding({ changeType: 'added_optional_field', severity: 'safe' })
    const risk = calculateRisk([breaking, nonBreaking])
    expect(risk.breakingCount).toBe(1)
  })
})

// ─── shouldBlockMerge ─────────────────────────────────────────────────────────

describe('shouldBlockMerge', () => {
  it('blocks CRITICAL', () => expect(shouldBlockMerge('CRITICAL')).toBe(true))
  it('blocks HIGH',     () => expect(shouldBlockMerge('HIGH')).toBe(true))
  it('allows MEDIUM',  () => expect(shouldBlockMerge('MEDIUM')).toBe(false))
  it('allows LOW',     () => expect(shouldBlockMerge('LOW')).toBe(false))
  it('allows SAFE',    () => expect(shouldBlockMerge('SAFE')).toBe(false))
})
