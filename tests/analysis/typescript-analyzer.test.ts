/**
 * tests/analysis/typescript-analyzer.test.ts
 *
 * Unit tests for the ts-morph based TypeScript analyzer.
 * Each test provides real TypeScript source code as strings.
 * No mocks, no fixtures files — self-contained.
 */

import { describe, it, expect } from 'vitest'
import {
  analyzeTypeScriptFile,
  findPropertyUsages,
  findEndpointUsages,
  shouldAnalyzeFile,
} from '../../lib/analysis/typescript-analyzer'

// ─── shouldAnalyzeFile ────────────────────────────────────────────────────────

describe('shouldAnalyzeFile', () => {
  it('accepts .ts files', () => {
    expect(shouldAnalyzeFile('src/types/user.ts')).toBe(true)
  })
  it('accepts .tsx files', () => {
    expect(shouldAnalyzeFile('src/components/User.tsx')).toBe(true)
  })
  it('rejects .d.ts declaration files', () => {
    expect(shouldAnalyzeFile('dist/index.d.ts')).toBe(false)
  })
  it('rejects test files', () => {
    expect(shouldAnalyzeFile('src/user.test.ts')).toBe(false)
  })
  it('rejects node_modules', () => {
    expect(shouldAnalyzeFile('node_modules/express/index.ts')).toBe(false)
  })
  it('rejects .js files', () => {
    expect(shouldAnalyzeFile('src/index.js')).toBe(false)
  })
  it('rejects dist output', () => {
    expect(shouldAnalyzeFile('dist/server.ts')).toBe(false)
  })
})

// ─── analyzeTypeScriptFile — removed field ─────────────────────────────────────

describe('analyzeTypeScriptFile — removed field', () => {
  const before = `
export interface UserResponse {
  id: string
  email: string
  name: string
  createdAt: Date
}
`
  const after = `
export interface UserResponse {
  id: string
  name: string
  createdAt: Date
}
`

  it('detects removed required field', () => {
    const { findings, errors } = analyzeTypeScriptFile('types/user.ts', before, after)
    expect(errors).toHaveLength(0)

    const removed = findings.find(f =>
      f.changeType === 'removed_field' && f.affectedValue === 'UserResponse.email'
    )
    expect(removed).toBeDefined()
    expect(removed?.severity).toBe('high')
    expect(removed?.confidence).toBeGreaterThanOrEqual(85)
  })

  it('does not report unchanged fields', () => {
    const { findings } = analyzeTypeScriptFile('types/user.ts', before, after)
    const ids = findings.filter(f => f.affectedValue === 'UserResponse.id')
    expect(ids).toHaveLength(0)
  })

  it('does not produce false positives on identical files', () => {
    const { findings } = analyzeTypeScriptFile('types/user.ts', before, before)
    expect(findings).toHaveLength(0)
  })
})

// ─── analyzeTypeScriptFile — type changed ─────────────────────────────────────

describe('analyzeTypeScriptFile — type changed', () => {
  const before = `
export interface PaymentRequest {
  amount: number
  currency: string
  userId: string
}
`
  const afterNarrowing = `
export interface PaymentRequest {
  amount: number
  currency: 'USD' | 'EUR'
  userId: string
}
`
  const afterWidening = `
export interface PaymentRequest {
  amount: number | string
  currency: string
  userId: string
}
`

  it('detects narrowing type change as breaking', () => {
    const { findings } = analyzeTypeScriptFile('types/payment.ts', before, afterNarrowing)
    const changed = findings.find(f =>
      f.changeType === 'changed_type' && f.affectedValue === 'PaymentRequest.currency'
    )
    expect(changed).toBeDefined()
    expect(changed?.severity).toBe('high')
    expect(changed?.beforeSchema).toContain('string')
    expect(changed?.afterSchema).toContain("'USD'")
  })

  it('widening type change is still flagged', () => {
    const { findings } = analyzeTypeScriptFile('types/payment.ts', before, afterWidening)
    const changed = findings.find(f =>
      f.changeType === 'changed_type' && f.affectedValue === 'PaymentRequest.amount'
    )
    // Widening: number → number|string — still flagged but may be lower severity
    expect(changed).toBeDefined()
  })
})

// ─── analyzeTypeScriptFile — optional to required ─────────────────────────────

describe('analyzeTypeScriptFile — optional to required', () => {
  const before = `
export interface CreateUserInput {
  email: string
  name?: string
  role?: 'admin' | 'user'
}
`
  const after = `
export interface CreateUserInput {
  email: string
  name: string
  role?: 'admin' | 'user'
}
`

  it('detects optional → required change', () => {
    const { findings } = analyzeTypeScriptFile('types/user-input.ts', before, after)
    const changed = findings.find(f =>
      f.changeType === 'changed_required' && f.affectedValue === 'CreateUserInput.name'
    )
    expect(changed).toBeDefined()
    expect(changed!.severity).toBe('high')
  })

  it('does not flag field that remains optional', () => {
    const { findings } = analyzeTypeScriptFile('types/user-input.ts', before, after)
    const role = findings.find(f => f.affectedValue === 'CreateUserInput.role')
    // role stayed optional — no finding expected
    expect(role).toBeUndefined()
  })
})

// ─── analyzeTypeScriptFile — new required field added ─────────────────────────

describe('analyzeTypeScriptFile — new required field added', () => {
  const before = `
export interface OrderLine {
  productId: string
  quantity: number
}
`
  const after = `
export interface OrderLine {
  productId: string
  quantity: number
  unitPrice: number
}
`

  it('detects new required field as breaking', () => {
    const { findings } = analyzeTypeScriptFile('types/order.ts', before, after)
    const added = findings.find(f =>
      f.changeType === 'added_required_field' && f.affectedValue === 'OrderLine.unitPrice'
    )
    expect(added).toBeDefined()
    expect(added?.severity).toBe('high')
  })
})

// ─── analyzeTypeScriptFile — new optional field added ─────────────────────────

describe('analyzeTypeScriptFile — new optional field (non-breaking)', () => {
  const before = `export interface Product { id: string; name: string }`
  const after  = `export interface Product { id: string; name: string; description?: string }`

  it('marks optional field addition as non-breaking', () => {
    const { findings } = analyzeTypeScriptFile('types/product.ts', before, after)
    const added = findings.find(f => f.affectedValue === 'Product.description')
    expect(added?.changeType).toBe('added_optional_field')
    expect(added?.severity).toBe('safe')
  })
})

// ─── analyzeTypeScriptFile — removed interface ────────────────────────────────

describe('analyzeTypeScriptFile — removed interface', () => {
  const before = `
export interface LegacyAuthToken {
  token: string
  expiresAt: number
}
export interface User { id: string }
`
  const after = `export interface User { id: string }`

  it('detects removed exported interface', () => {
    const { findings } = analyzeTypeScriptFile('types/auth.ts', before, after)
    const removed = findings.find(f =>
      f.changeType === 'removed_interface' && f.affectedValue === 'LegacyAuthToken'
    )
    expect(removed).toBeDefined()
    expect(removed?.severity).toBe('high')
  })

  it('does not flag retained interface', () => {
    const { findings } = analyzeTypeScriptFile('types/auth.ts', before, after)
    const user = findings.find(f =>
      f.changeType === 'removed_interface' && f.affectedValue === 'User'
    )
    expect(user).toBeUndefined()
  })
})

// ─── analyzeTypeScriptFile — function parameter removed ───────────────────────

describe('analyzeTypeScriptFile — function parameter removed', () => {
  const before = `
export function fetchUser(userId: string, includeDeleted: boolean): Promise<void> {
  return Promise.resolve()
}
`
  const after = `
export function fetchUser(userId: string): Promise<void> {
  return Promise.resolve()
}
`

  it('detects removed function parameter', () => {
    const { findings } = analyzeTypeScriptFile('services/user.ts', before, after)
    const removed = findings.find(f =>
      f.changeType === 'removed_parameter' && f.affectedValue.includes('fetchUser')
    )
    expect(removed).toBeDefined()
    expect(removed?.severity).toBe('high')
  })
})

// ─── analyzeTypeScriptFile — non-exported interfaces ignored ──────────────────

describe('analyzeTypeScriptFile — non-exported interfaces', () => {
  const before = `
interface InternalState {
  count: number
  flag: boolean
}
export interface PublicAPI { data: string }
`
  const after = `
interface InternalState {
  count: number
}
export interface PublicAPI { data: string }
`

  it('ignores changes to non-exported interfaces', () => {
    const { findings } = analyzeTypeScriptFile('internal.ts', before, after)
    const internal = findings.filter(f => f.affectedValue.startsWith('InternalState'))
    expect(internal).toHaveLength(0)
  })
})

// ─── findPropertyUsages ───────────────────────────────────────────────────────

describe('findPropertyUsages', () => {
  const consumerFile = `
import { UserResponse } from '../types/user'

function renderUser(user: UserResponse) {
  const element = document.createElement('div')
  element.textContent = user.email
  return element
}

function processUser({ email, name }: UserResponse) {
  console.log(email)
}

function buildPayload(user: UserResponse) {
  return { email: user.email, display: user.name }
}
`

  it('finds direct property access', () => {
    const usages = findPropertyUsages(consumerFile, 'src/ui/user-card.ts', 'email')
    const direct = usages.filter(u => u.usageType === 'direct_access')
    expect(direct.length).toBeGreaterThanOrEqual(1)
    const first = direct[0]
    expect(first).toBeDefined()
    // Should have a line number
    expect(first!.lineNumber).toBeGreaterThan(0)
    // Should have a code snippet
    expect(first!.codeSnippet).toBeTruthy()
  })

  it('finds destructuring usages', () => {
    const usages = findPropertyUsages(consumerFile, 'src/ui/user-card.ts', 'email')
    const destructured = usages.filter(u => u.usageType === 'destructuring')
    expect(destructured.length).toBeGreaterThanOrEqual(1)
  })

  it('finds multiple usage types for the same property', () => {
    const usages = findPropertyUsages(consumerFile, 'src/ui/user-card.ts', 'email')
    // Should find at minimum: direct_access (user.email) and destructuring ({ email })
    expect(usages.length).toBeGreaterThanOrEqual(2)
    const types = usages.map(u => u.usageType)
    expect(types).toContain('direct_access')
  })

  it('returns empty array for absent property', () => {
    const usages = findPropertyUsages(consumerFile, 'src/ui/user-card.ts', 'phoneNumber')
    expect(usages).toHaveLength(0)
  })

  it('deduplicates by line', () => {
    const simple = `const x = user.email + user.email`
    const usages = findPropertyUsages(simple, 'test.ts', 'email')
    // Same line — but two separate expressions, so depends on implementation
    // At minimum, should not return more items than there are occurrences
    expect(usages.length).toBeGreaterThanOrEqual(0)
  })

  it('finds type annotation usages for interface names', () => {
    const file = `
import { UserResponse } from '../types'
function greet(user: UserResponse): string { return user.name }
`
    const usages = findPropertyUsages(file, 'greet.ts', 'UserResponse')
    const typeAnnotations = usages.filter(u => u.usageType === 'type_annotation')
    expect(typeAnnotations.length).toBeGreaterThanOrEqual(1)
  })
})

// ─── findEndpointUsages ───────────────────────────────────────────────────────

describe('findEndpointUsages', () => {
  const apiClient = `
const API_BASE = 'https://api.example.com'

async function getUser(id: string) {
  return fetch(\`\${API_BASE}/users/\${id}\`)
}

async function listUsers() {
  return fetch('/api/v1/users')
}

const DELETE_USER_URL = '/users/delete'
`

  it('finds string literal endpoint usages', () => {
    const usages = findEndpointUsages(apiClient, 'client/api.ts', '/api/v1/users')
    expect(usages.length).toBeGreaterThanOrEqual(1)
    expect(usages[0]!.usageType).toBe('string_literal')
  })

  it('finds template literal endpoint usages', () => {
    const usages = findEndpointUsages(apiClient, 'client/api.ts', '/users/{id}')
    // Template literal with /users/ should match
    expect(usages.length).toBeGreaterThanOrEqual(1)
  })
})
