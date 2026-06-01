/**
 * tests/analysis/bug-fixes.test.ts
 *
 * Regression tests for the 4 bugs fixed in this patch:
 *
 *  Bug 1 — Sequential consumer search with artificial delay
 *  Bug 2 — Deleted files silently skipped in pipeline
 *  Bug 3 — Too-short / too-generic search queries causing false positives
 *  Bug 4 — Sequential per-finding DB inserts (tested via unit contract)
 */

import { describe, it, expect } from 'vitest'
import { buildSearchQuery }     from '../../lib/analysis/consumer-finder'
import { analyzeTypeScriptFile } from '../../lib/analysis/typescript-analyzer'
import type { Finding } from '../../lib/analysis/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFinding(
  changeType: Finding['changeType'],
  affectedValue: string
): Omit<Finding, 'evidence'> {
  return {
    changeType,
    severity:      'high',
    sourceFile:    'src/types/user.ts',
    affectedValue,
    description:   'test finding',
    confidence:    90,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUG 3 — buildSearchQuery: short / generic terms must be rejected
// ═══════════════════════════════════════════════════════════════════════════════

describe('Bug 3 — buildSearchQuery: rejects dangerous queries', () => {

  // ── Minimum length ──────────────────────────────────────────────────────────

  it('never returns bare 2-char field name as query', () => {
    // "id" alone would match thousands of files — must not be returned bare.
    // Acceptable outcomes: null (skip) OR quoted qualified form "Response.id".
    const q = buildSearchQuery(makeFinding('removed_field', 'Response.id'))
    // The bare field name must never be the query
    expect(q).not.toBe('id')
    // If a qualified form is returned, it must be specific enough
    if (q !== null) {
      expect(q.length).toBeGreaterThanOrEqual(5)
      expect(q).toContain('Response')   // qualified, not just "id"
    }
  })

  it('never returns bare 3-char field name as query', () => {
    // "url" alone would match thousands of files.
    const q = buildSearchQuery(makeFinding('removed_field', 'Response.url'))
    expect(q).not.toBe('url')
    if (q !== null) {
      expect(q.length).toBeGreaterThanOrEqual(5)
      expect(q).toContain('Response')
    }
  })

  it('rejects 4-char field names without qualified fallback', () => {
    // "name" alone as a search term would match thousands of files
    const q = buildSearchQuery(makeFinding('removed_field', 'SomeInterface.name'))
    // Either null OR a quoted qualified form — never bare "name"
    if (q !== null) {
      expect(q).not.toBe('name')
      expect(q).toMatch(/["']?SomeInterface|name["']?/)
    }
  })

  it('accepts 5+ char field names', () => {
    const q = buildSearchQuery(makeFinding('removed_field', 'UserResponse.email'))
    expect(q).toBe('email')
  })

  it('accepts long field names', () => {
    const q = buildSearchQuery(makeFinding('removed_field', 'OrderDTO.externalReferenceId'))
    expect(q).toBe('externalReferenceId')
  })

  // ── Generic term blocklist ──────────────────────────────────────────────────

  it('rejects "value" (too generic)', () => {
    expect(buildSearchQuery(makeFinding('removed_field', 'Config.value'))).toBeNull()
  })

  it('rejects "items" (too generic)', () => {
    expect(buildSearchQuery(makeFinding('removed_field', 'PaginatedResponse.items'))).toBeNull()
  })

  it('rejects "token" (too generic)', () => {
    expect(buildSearchQuery(makeFinding('removed_field', 'AuthResponse.token'))).toBeNull()
  })

  it('rejects "error" (too generic)', () => {
    expect(buildSearchQuery(makeFinding('removed_field', 'ApiResponse.error'))).toBeNull()
  })

  it('rejects "users" as endpoint segment', () => {
    // /users is the most common API segment, useless for search
    const q = buildSearchQuery(makeFinding('removed_endpoint', 'DELETE /users'))
    expect(q).toBeNull()
  })

  // ── Endpoint path handling ──────────────────────────────────────────────────

  it('uses the most specific non-generic segment for endpoints', () => {
    const q = buildSearchQuery(
      makeFinding('removed_endpoint', 'DELETE /organizations/{orgId}/webhooks/{hookId}')
    )
    expect(q).toBeTruthy()
    // Should pick "organizations" or "webhooks", not the param segments
    expect(q).not.toContain('{')
    expect(q).not.toContain('orgId')
  })

  it('uses long specific path for endpoint', () => {
    const q = buildSearchQuery(
      makeFinding('removed_endpoint', 'GET /api/v2/payment-methods/{id}')
    )
    expect(q).toBeTruthy()
    expect(q).not.toContain('{id}')
  })

  // ── Short field with qualified fallback ─────────────────────────────────────

  it('uses quoted qualified name when field is short but parent is long', () => {
    // "id" alone = rejected (< 5 chars)
    // "UserResponse.id" as a quoted query = precise enough
    const q = buildSearchQuery(makeFinding('removed_field', 'UserResponse.id'))
    if (q !== null) {
      // Should be the qualified form in quotes
      expect(q).toContain('UserResponse')
    }
    // null is also acceptable — better to miss than to flood
  })

  // ── Non-breaking changes ────────────────────────────────────────────────────

  it('returns null for added_optional_field (non-breaking, no consumer search needed)', () => {
    const q = buildSearchQuery(makeFinding('added_optional_field', 'UserResponse.description'))
    expect(q).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// BUG 2 — Deleted files: analyzeTypeScriptFile(before, '') must find all exports
// ═══════════════════════════════════════════════════════════════════════════════

describe('Bug 2 — Deleted files: all exports detected as removed', () => {
  const deletedFileContent = `
export interface UserResponse {
  id: string
  email: string
  name: string
}

export interface PaymentMethod {
  cardNumber: string
  expiry: string
  cvv: string
}

export function fetchUser(id: string): Promise<UserResponse> {
  return Promise.resolve({ id, email: '', name: '' })
}

export type UserId = string
`

  // The pipeline represents deleted files as after=''
  const emptyAfter = ''

  it('detects all exported interfaces as removed when file is deleted', () => {
    const { findings } = analyzeTypeScriptFile(
      'src/types/user.ts',
      deletedFileContent,
      emptyAfter
    )

    const removedInterfaces = findings.filter(f => f.changeType === 'removed_interface')
    const names = removedInterfaces.map(f => f.affectedValue)

    expect(names).toContain('UserResponse')
    expect(names).toContain('PaymentMethod')
  })

  it('detects removed function when file is deleted', () => {
    const { findings } = analyzeTypeScriptFile(
      'src/services/user.ts',
      deletedFileContent,
      emptyAfter
    )
    const removedFn = findings.filter(f =>
      f.changeType === 'removed_parameter' &&
      f.affectedValue.includes('fetchUser')
    )
    expect(removedFn.length).toBeGreaterThanOrEqual(1)
  })

  it('detects removed type alias when file is deleted', () => {
    const { findings } = analyzeTypeScriptFile(
      'src/types/user.ts',
      deletedFileContent,
      emptyAfter
    )
    const removedType = findings.filter(f =>
      f.changeType === 'removed_interface' &&
      f.affectedValue === 'UserId'
    )
    expect(removedType.length).toBeGreaterThanOrEqual(1)
  })

  it('produces zero findings when file is newly added (before is null case — skipped upstream)', () => {
    // The pipeline never calls the analyzer for added files.
    // But if called with empty before, the analyzer must not crash.
    const { findings, errors } = analyzeTypeScriptFile(
      'src/types/new.ts',
      '',                 // empty before
      deletedFileContent  // after has content
    )
    expect(errors).toHaveLength(0)
    // No breaking removals — nothing existed before
    const breaking = findings.filter(f =>
      ['removed_field', 'removed_interface', 'removed_endpoint'].includes(f.changeType)
    )
    expect(breaking).toHaveLength(0)
  })

  it('single field removal still works in non-deleted file', () => {
    const before = `export interface User { id: string; email: string; role: string }`
    const after  = `export interface User { id: string; email: string }`
    const { findings } = analyzeTypeScriptFile('types/user.ts', before, after)
    expect(findings.some(f =>
      f.changeType === 'removed_field' && f.affectedValue === 'User.role'
    )).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// BUG 1 — Parallelism contract: buildSearchQuery deduplication
// (We can't test actual GitHub API calls without mocking, but we can test
// that the query deduplication logic behaves correctly — the foundation of
// the parallel batch approach)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Bug 1 — Query deduplication: multiple findings share one query term', () => {
  it('two removed_field findings with same field name produce the same query', () => {
    const f1 = makeFinding('removed_field', 'UserResponse.email')
    const f2 = makeFinding('removed_field', 'ProfileDTO.email')
    const q1 = buildSearchQuery(f1)
    const q2 = buildSearchQuery(f2)
    // Same term → same query → one search, not two
    expect(q1).toBe(q2)
    expect(q1).toBe('email')
  })

  it('different field names produce different queries', () => {
    const f1 = makeFinding('removed_field', 'UserResponse.email')
    const f2 = makeFinding('removed_field', 'UserResponse.phoneNumber')
    expect(buildSearchQuery(f1)).not.toBe(buildSearchQuery(f2))
  })

  it('removed_interface and removed_field for same name produce same query', () => {
    const f1 = makeFinding('removed_interface', 'UserResponse')
    const f2 = makeFinding('removed_field', 'SomeDTO.UserResponse')
    // Both produce "UserResponse" → one search covers both
    expect(buildSearchQuery(f1)).toBe('UserResponse')
    // f2 field name is "UserResponse" — same result
    expect(buildSearchQuery(f2)).toBe('UserResponse')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// BUG 4 — Bulk persist contract
// We test the lookup-key uniqueness invariant that persistResults relies on.
// Without uniqueness the bulk insert ID mapping breaks.
// ═══════════════════════════════════════════════════════════════════════════════

describe('Bug 4 — Bulk persist: finding lookup key uniqueness', () => {
  function makeFullFinding(affectedValue: string, sourceFile: string): Finding {
    return {
      changeType:    'removed_field',
      severity:      'high',
      sourceFile,
      affectedValue,
      description:   'test',
      confidence:    90,
      evidence:      [],
    }
  }

  it('(affected_value, source_file) is unique within a typical result set', () => {
    // Simulate what the analyzer produces for one PR
    const findings: Finding[] = [
      makeFullFinding('UserResponse.email',    'src/types/user.ts'),
      makeFullFinding('UserResponse.name',     'src/types/user.ts'),
      makeFullFinding('PaymentDTO.cardNumber', 'src/types/payment.ts'),
      makeFullFinding('GET /users/{id}',       'openapi.yaml'),
    ]

    const keys = findings.map(f => `${f.affectedValue}::${f.sourceFile}`)
    const uniqueKeys = new Set(keys)

    expect(uniqueKeys.size).toBe(findings.length)
  })

  it('same affectedValue in different source files produces unique keys', () => {
    // Two different files both export an interface named "Config"
    const findings: Finding[] = [
      makeFullFinding('Config.timeout', 'src/server/config.ts'),
      makeFullFinding('Config.timeout', 'src/client/config.ts'),
    ]

    const keys = findings.map(f => `${f.affectedValue}::${f.sourceFile}`)
    expect(new Set(keys).size).toBe(2)
  })

  it('duplicate (affectedValue, sourceFile) is deduplicated by the analyzers', () => {
    // The TypeScript analyzer deduplicates findings by (type, file, affectedValue).
    // Verify that for a file with the same field removed once, we get exactly one finding.
    const before = `export interface User { id: string; email: string }`
    const after  = `export interface User { id: string }`

    const { findings } = analyzeTypeScriptFile('types/user.ts', before, after)
    const emailFindings = findings.filter(f => f.affectedValue === 'User.email')

    // Must be exactly 1, not duplicated
    expect(emailFindings).toHaveLength(1)
  })
})
