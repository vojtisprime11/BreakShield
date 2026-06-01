/**
 * tests/analysis/openapi-analyzer.test.ts
 *
 * Unit tests for the swagger-parser based OpenAPI analyzer.
 * Uses inline YAML strings to avoid fixture files.
 */

import { describe, it, expect } from 'vitest'
import { analyzeOpenAPIFile, isOpenAPIFile } from '../../lib/analysis/openapi-analyzer'

// ─── isOpenAPIFile ────────────────────────────────────────────────────────────

describe('isOpenAPIFile', () => {
  it('accepts openapi.yaml', ()  => expect(isOpenAPIFile('openapi.yaml')).toBe(true))
  it('accepts swagger.json', ()  => expect(isOpenAPIFile('swagger.json')).toBe(true))
  it('accepts api-spec.yaml', () => expect(isOpenAPIFile('docs/api-spec.yaml')).toBe(true))
  it('accepts api-contract.yml', () => expect(isOpenAPIFile('api-contract.yml')).toBe(true))
  it('rejects config.yaml', ()   => expect(isOpenAPIFile('config.yaml')).toBe(false))
  it('rejects schema.prisma', () => expect(isOpenAPIFile('schema.prisma')).toBe(false))
  it('rejects tsconfig.json', () => expect(isOpenAPIFile('tsconfig.json')).toBe(false))
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE_SPEC = (paths: string, components = '') => `
openapi: "3.0.0"
info:
  title: Test API
  version: "1.0.0"
paths:
${paths}
${components ? `components:\n  schemas:\n${components}` : ''}
`.trim()

const USER_RESPONSE_SCHEMA = `
  /users/{id}:
    get:
      operationId: getUser
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: Success
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                  email:
                    type: string
                  name:
                    type: string
`

// ─── Removed endpoint ─────────────────────────────────────────────────────────

describe('analyzeOpenAPIFile — removed endpoint', () => {
  const before = BASE_SPEC(`
  /users/{id}:
    get:
      operationId: getUser
      responses:
        "200":
          description: Success
  /users:
    get:
      operationId: listUsers
      responses:
        "200":
          description: Success
`)

  const after = BASE_SPEC(`
  /users:
    get:
      operationId: listUsers
      responses:
        "200":
          description: Success
`)

  it('detects removed endpoint', async () => {
    const { findings, errors } = await analyzeOpenAPIFile('openapi.yaml', before, after)
    expect(errors).toHaveLength(0)

    const removed = findings.find(f =>
      f.changeType === 'removed_endpoint' &&
      f.affectedValue.includes('/users/{id}')
    )
    expect(removed).toBeDefined()
    expect(removed?.severity).toBe('high')
    expect(removed?.confidence).toBeGreaterThanOrEqual(90)
  })

  it('does not flag retained endpoint', async () => {
    const { findings } = await analyzeOpenAPIFile('openapi.yaml', before, after)
    const listUsers = findings.filter(f =>
      f.affectedValue.includes('/users') &&
      !f.affectedValue.includes('{id}') &&
      f.changeType === 'removed_endpoint'
    )
    expect(listUsers).toHaveLength(0)
  })

  it('returns no findings for identical specs', async () => {
    const { findings } = await analyzeOpenAPIFile('openapi.yaml', before, before)
    const breaking = findings.filter(f =>
      ['removed_endpoint', 'removed_field', 'changed_type'].includes(f.changeType)
    )
    expect(breaking).toHaveLength(0)
  })
})

// ─── Removed HTTP method ──────────────────────────────────────────────────────

describe('analyzeOpenAPIFile — removed HTTP method', () => {
  const before = BASE_SPEC(`
  /articles:
    get:
      operationId: listArticles
      responses:
        "200":
          description: Success
    post:
      operationId: createArticle
      responses:
        "201":
          description: Created
`)

  const after = BASE_SPEC(`
  /articles:
    get:
      operationId: listArticles
      responses:
        "200":
          description: Success
`)

  it('detects removed POST method as removed endpoint', async () => {
    const { findings } = await analyzeOpenAPIFile('openapi.yaml', before, after)
    const removed = findings.find(f =>
      f.changeType === 'removed_endpoint' &&
      f.affectedValue.includes('POST') &&
      f.affectedValue.includes('/articles')
    )
    expect(removed).toBeDefined()
  })
})

// ─── Removed response field ───────────────────────────────────────────────────

describe('analyzeOpenAPIFile — removed response field', () => {
  const before = BASE_SPEC(`
  /users/{id}:
    get:
      operationId: getUser
      responses:
        "200":
          description: Success
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                  email:
                    type: string
                  phone:
                    type: string
`)

  const after = BASE_SPEC(`
  /users/{id}:
    get:
      operationId: getUser
      responses:
        "200":
          description: Success
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                  email:
                    type: string
`)

  it('detects removed response field', async () => {
    const { findings } = await analyzeOpenAPIFile('openapi.yaml', before, after)
    const removed = findings.find(f =>
      f.changeType === 'removed_field' &&
      f.affectedValue.includes('phone')
    )
    expect(removed).toBeDefined()
    expect(removed?.severity).toBe('high')
  })

  it('does not flag retained fields', async () => {
    const { findings } = await analyzeOpenAPIFile('openapi.yaml', before, after)
    const email = findings.filter(f =>
      f.changeType === 'removed_field' && f.affectedValue.includes('email')
    )
    expect(email).toHaveLength(0)
  })
})

// ─── New required request field ───────────────────────────────────────────────

describe('analyzeOpenAPIFile — new required request field', () => {
  const before = BASE_SPEC(`
  /orders:
    post:
      operationId: createOrder
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - productId
              properties:
                productId:
                  type: string
                quantity:
                  type: integer
`)

  const after = BASE_SPEC(`
  /orders:
    post:
      operationId: createOrder
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - productId
                - quantity
              properties:
                productId:
                  type: string
                quantity:
                  type: integer
`)

  it('detects field becoming required in request body', async () => {
    const { findings } = await analyzeOpenAPIFile('openapi.yaml', before, after)
    const changed = findings.find(f =>
      f.changeType === 'changed_required' &&
      f.affectedValue.includes('quantity')
    )
    expect(changed).toBeDefined()
    expect(changed?.severity).toBe('high')
  })
})

// ─── Field type changed ───────────────────────────────────────────────────────

describe('analyzeOpenAPIFile — field type changed', () => {
  const before = BASE_SPEC(`
  /products/{id}:
    get:
      operationId: getProduct
      responses:
        "200":
          description: Success
          content:
            application/json:
              schema:
                type: object
                properties:
                  price:
                    type: number
                  stock:
                    type: integer
`)

  const after = BASE_SPEC(`
  /products/{id}:
    get:
      operationId: getProduct
      responses:
        "200":
          description: Success
          content:
            application/json:
              schema:
                type: object
                properties:
                  price:
                    type: string
                  stock:
                    type: integer
`)

  it('detects response field type change', async () => {
    const { findings } = await analyzeOpenAPIFile('openapi.yaml', before, after)
    const changed = findings.find(f =>
      f.changeType === 'changed_type' &&
      f.affectedValue.includes('price')
    )
    expect(changed).toBeDefined()
    expect(changed?.beforeSchema).toBe('number')
    expect(changed?.afterSchema).toBe('string')
  })
})

// ─── Removed required parameter ───────────────────────────────────────────────

describe('analyzeOpenAPIFile — removed parameter', () => {
  const before = BASE_SPEC(`
  /search:
    get:
      operationId: search
      parameters:
        - name: q
          in: query
          required: true
          schema:
            type: string
        - name: limit
          in: query
          required: false
          schema:
            type: integer
`)

  const after = BASE_SPEC(`
  /search:
    get:
      operationId: search
      parameters:
        - name: q
          in: query
          required: true
          schema:
            type: string
`)

  it('detects removed optional parameter as medium severity', async () => {
    const { findings } = await analyzeOpenAPIFile('openapi.yaml', before, after)
    const removed = findings.find(f =>
      f.changeType === 'removed_parameter' &&
      f.affectedValue.includes('limit')
    )
    expect(removed).toBeDefined()
    expect(removed?.severity).toBe('medium')  // was optional
  })
})

// ─── New required parameter added ────────────────────────────────────────────

describe('analyzeOpenAPIFile — new required parameter', () => {
  const before = BASE_SPEC(`
  /reports:
    get:
      operationId: getReport
      parameters:
        - name: format
          in: query
          required: false
          schema:
            type: string
`)

  const after = BASE_SPEC(`
  /reports:
    get:
      operationId: getReport
      parameters:
        - name: format
          in: query
          required: false
          schema:
            type: string
        - name: orgId
          in: query
          required: true
          schema:
            type: string
`)

  it('detects new required parameter as breaking', async () => {
    const { findings } = await analyzeOpenAPIFile('openapi.yaml', before, after)
    const added = findings.find(f =>
      f.changeType === 'added_required_field' &&
      f.affectedValue.includes('orgId')
    )
    expect(added).toBeDefined()
    expect(added?.severity).toBe('high')
  })
})

// ─── Component schema removal ─────────────────────────────────────────────────

describe('analyzeOpenAPIFile — removed component schema', () => {
  const before = `
openapi: "3.0.0"
info:
  title: Test API
  version: "1.0.0"
paths: {}
components:
  schemas:
    UserDTO:
      type: object
      properties:
        id:
          type: string
        email:
          type: string
    LegacyTokenDTO:
      type: object
      properties:
        token:
          type: string
`

  const after = `
openapi: "3.0.0"
info:
  title: Test API
  version: "1.0.0"
paths: {}
components:
  schemas:
    UserDTO:
      type: object
      properties:
        id:
          type: string
        email:
          type: string
`

  it('detects removed component schema', async () => {
    const { findings } = await analyzeOpenAPIFile('openapi.yaml', before, after)
    const removed = findings.find(f =>
      f.changeType === 'removed_interface' &&
      f.affectedValue.includes('LegacyTokenDTO')
    )
    expect(removed).toBeDefined()
    expect(removed?.severity).toBe('high')
  })

  it('does not flag retained schema', async () => {
    const { findings } = await analyzeOpenAPIFile('openapi.yaml', before, after)
    const userDTO = findings.filter(f =>
      f.changeType === 'removed_interface' && f.affectedValue.includes('UserDTO')
    )
    expect(userDTO).toHaveLength(0)
  })
})

// ─── Parse error handling ─────────────────────────────────────────────────────

describe('analyzeOpenAPIFile — error handling', () => {
  it('returns error gracefully on invalid YAML', async () => {
    const invalid = `this is: [not: valid: yaml`
    const { findings, errors } = await analyzeOpenAPIFile('openapi.yaml', invalid, invalid)
    expect(errors.length).toBeGreaterThan(0)
    expect(findings).toHaveLength(0)
  })
})
