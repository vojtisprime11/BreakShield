/**
 * lib/analysis/openapi-analyzer.ts
 *
 * Schema-aware OpenAPI / Swagger diff engine.
 * Uses @apidevtools/swagger-parser to parse and dereference schemas.
 * Zero regex for structural analysis.
 *
 * Detects: removed endpoints, removed response fields, added required
 *          request fields, type changes, required changes.
 */

import SwaggerParser from '@apidevtools/swagger-parser'
import type { OpenAPI, OpenAPIV3, OpenAPIV2 } from 'openapi-types'
import type { ChangeType, Severity, Finding, AnalysisError } from './types'

// ─── File identification ──────────────────────────────────────────────────────

const OPENAPI_PATH_INDICATORS = [
  'openapi', 'swagger', 'api-spec', 'api-contract',
  'api-schema', 'openapi.', 'swagger.',
]

export function isOpenAPIFile(path: string): boolean {
  const lower = path.toLowerCase()
  const ext   = lower.split('.').pop()
  if (!['yaml', 'yml', 'json'].includes(ext ?? '')) return false
  return OPENAPI_PATH_INDICATORS.some(ind => lower.includes(ind))
}

// ─── Parsed schema types ──────────────────────────────────────────────────────

type Schema      = OpenAPIV3.SchemaObject
type PathItem    = OpenAPIV3.PathItemObject
type Operation   = OpenAPIV3.OperationObject
type Parameter   = OpenAPIV3.ParameterObject
type MediaType   = OpenAPIV3.MediaTypeObject
type RequestBody = OpenAPIV3.RequestBodyObject
type Response    = OpenAPIV3.ResponseObject

// ─── Main entry point ─────────────────────────────────────────────────────────

export interface OpenAPIAnalysisResult {
  findings: Omit<Finding, 'evidence'>[]
  errors:   AnalysisError[]
}

/**
 * Compare two OpenAPI spec versions (YAML or JSON, v2 or v3).
 * Returns findings without evidence.
 */
export async function analyzeOpenAPIFile(
  filePath:      string,
  beforeContent: string,
  afterContent:  string
): Promise<OpenAPIAnalysisResult> {
  const errors: AnalysisError[] = []

  let before: OpenAPIV3.Document | null = null
  let after:  OpenAPIV3.Document | null = null

  // ── Parse & dereference both versions ────────────────────────────────────
  try {
    before = await parseSpec(beforeContent, filePath) as OpenAPIV3.Document
  } catch (e: unknown) {
    errors.push({ file: filePath, phase: 'parse', message: `before: ${String(e)}` })
  }

  try {
    after = await parseSpec(afterContent, filePath) as OpenAPIV3.Document
  } catch (e: unknown) {
    errors.push({ file: filePath, phase: 'parse', message: `after: ${String(e)}` })
  }

  if (!before || !after) return { findings: [], errors }

  const findings: Omit<Finding, 'evidence'>[] = []

  try {
    findings.push(...diffPaths(before, after, filePath))
    findings.push(...diffComponents(before, after, filePath))
  } catch (e: unknown) {
    errors.push({ file: filePath, phase: 'diff', message: String(e) })
  }

  return { findings, errors }
}

// ─── Parse helper ─────────────────────────────────────────────────────────────

async function parseSpec(content: string, filePath: string): Promise<OpenAPI.Document> {
  // swagger-parser can parse from string via object — parse YAML/JSON first
  let raw: unknown
  if (filePath.endsWith('.json')) {
    raw = JSON.parse(content)
  } else {
    // Lazy import yaml only when needed
    const { parse: yamlParse } = await import('yaml')
    raw = yamlParse(content)
  }

  // Dereference resolves all $ref pointers so we never need to follow them
  return SwaggerParser.dereference(raw as OpenAPI.Document) as Promise<OpenAPI.Document>
}

// ─── Path / endpoint diffing ──────────────────────────────────────────────────

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'] as const
type HttpMethod = typeof HTTP_METHODS[number]

function diffPaths(
  before: OpenAPIV3.Document,
  after:  OpenAPIV3.Document,
  path:   string
): Omit<Finding, 'evidence'>[] {
  const findings: Omit<Finding, 'evidence'>[] = []
  const bPaths  = before.paths ?? {}
  const aPaths  = after.paths  ?? {}

  // Check every path that existed before
  for (const [route, bItem] of Object.entries(bPaths)) {
    const aItem = aPaths[route]

    // ── Entire path removed ──────────────────────────────────────────────
    if (!aItem) {
      for (const method of HTTP_METHODS) {
        if (!(bItem as any)[method]) continue
        findings.push(makeEndpointRemoved(method.toUpperCase(), route, path))
      }
      continue
    }

    // ── Compare operations for this path ─────────────────────────────────
    for (const method of HTTP_METHODS) {
      const bOp = (bItem as any)[method] as Operation | undefined
      const aOp = (aItem as any)[method] as Operation | undefined

      if (bOp && !aOp) {
        findings.push(makeEndpointRemoved(method.toUpperCase(), route, path))
        continue
      }

      if (bOp && aOp) {
        findings.push(...diffOperation(
          bOp, aOp,
          method.toUpperCase(), route,
          path
        ))
      }
    }
  }

  return findings
}

// ─── Operation diffing ────────────────────────────────────────────────────────

function diffOperation(
  before:   Operation,
  after:    Operation,
  method:   string,
  route:    string,
  filePath: string
): Omit<Finding, 'evidence'>[] {
  const findings: Omit<Finding, 'evidence'>[] = []
  const endpoint = `${method} ${route}`

  // ── Parameters ──────────────────────────────────────────────────────────
  const bParams = (before.parameters ?? []) as Parameter[]
  const aParams = (after.parameters  ?? []) as Parameter[]
  findings.push(...diffParameters(bParams, aParams, endpoint, filePath))

  // ── Request body ────────────────────────────────────────────────────────
  if (before.requestBody && after.requestBody) {
    const bBody = before.requestBody as RequestBody
    const aBody = after.requestBody  as RequestBody
    findings.push(...diffSchemas(
      extractJsonSchema(bBody),
      extractJsonSchema(aBody),
      `${endpoint} request body`,
      filePath,
      'request'
    ))
  } else if (before.requestBody && !after.requestBody) {
    findings.push(make({
      changeType:    'removed_field',
      severity:      'high',
      sourceFile:    filePath,
      affectedValue: endpoint,
      description:   `Request body removed from \`${endpoint}\``,
      confidence:    90,
    }))
  }

  // ── Responses ────────────────────────────────────────────────────────────
  const bResponses = before.responses ?? {}
  const aResponses = after.responses  ?? {}

  for (const [status, bResp] of Object.entries(bResponses)) {
    if (!['200', '201', '202', '204'].includes(status)) continue  // only success responses
    const aResp = aResponses[status]
    if (!aResp) {
      findings.push(make({
        changeType:    'removed_field',
        severity:      'medium',
        sourceFile:    filePath,
        affectedValue: `${endpoint} response ${status}`,
        description:   `Response status \`${status}\` removed from \`${endpoint}\``,
        confidence:    85,
      }))
      continue
    }

    const bSchema = extractResponseSchema(bResp as Response)
    const aSchema = extractResponseSchema(aResp as Response)
    findings.push(...diffSchemas(bSchema, aSchema, `${endpoint} ${status}`, filePath, 'response'))
  }

  return findings
}

// ─── Parameter diffing ────────────────────────────────────────────────────────

function diffParameters(
  before:   Parameter[],
  after:    Parameter[],
  endpoint: string,
  filePath: string
): Omit<Finding, 'evidence'>[] {
  const findings: Omit<Finding, 'evidence'>[] = []
  const afterMap  = new Map(after.map(p => [`${p.in}:${p.name}`, p]))

  for (const bParam of before) {
    const key    = `${bParam.in}:${bParam.name}`
    const aParam = afterMap.get(key)

    if (!aParam) {
      findings.push(make({
        changeType:    'removed_parameter',
        severity:      bParam.required ? 'high' : 'medium',
        sourceFile:    filePath,
        affectedValue: `${endpoint} param \`${bParam.name}\` (${bParam.in})`,
        description:   `Parameter \`${bParam.name}\` (${bParam.in}) removed from \`${endpoint}\``,
        beforeSchema:  JSON.stringify(bParam.schema ?? {}, null, 2),
        confidence:    92,
      }))
      continue
    }

    // Required added
    if (!bParam.required && aParam.required) {
      findings.push(make({
        changeType:    'changed_required',
        severity:      'high',
        sourceFile:    filePath,
        affectedValue: `${endpoint} param \`${bParam.name}\``,
        description:   `Parameter \`${bParam.name}\` became required on \`${endpoint}\``,
        confidence:    93,
      }))
    }

    // Type changed
    if (bParam.schema && aParam.schema) {
      const bType = getSchemaType(bParam.schema as Schema)
      const aType = getSchemaType(aParam.schema as Schema)
      if (bType !== aType) {
        findings.push(make({
          changeType:    'changed_type',
          severity:      'high',
          sourceFile:    filePath,
          affectedValue: `${endpoint} param \`${bParam.name}\``,
          description:   `Type of parameter \`${bParam.name}\` changed: \`${bType}\` → \`${aType}\``,
          beforeSchema:  bType,
          afterSchema:   aType,
          confidence:    90,
        }))
      }
    }
  }

  // New required parameters
  const beforeNames = new Set(before.map(p => `${p.in}:${p.name}`))
  for (const aParam of after) {
    if (beforeNames.has(`${aParam.in}:${aParam.name}`)) continue
    if (aParam.required) {
      findings.push(make({
        changeType:    'added_required_field',
        severity:      'high',
        sourceFile:    filePath,
        affectedValue: `${endpoint} param \`${aParam.name}\` (${aParam.in})`,
        description:   `New required parameter \`${aParam.name}\` (${aParam.in}) added to \`${endpoint}\``,
        afterSchema:   JSON.stringify(aParam.schema ?? {}, null, 2),
        confidence:    90,
      }))
    }
  }

  return findings
}

// ─── Schema diffing (recursive) ───────────────────────────────────────────────

function diffSchemas(
  before:   Schema | null,
  after:    Schema | null,
  context:  string,
  filePath: string,
  direction: 'request' | 'response'
): Omit<Finding, 'evidence'>[] {
  if (!before || !after) return []
  const findings: Omit<Finding, 'evidence'>[] = []

  walkSchemaProperties(before, after, context, filePath, direction, findings)

  return findings
}

function walkSchemaProperties(
  before:    Schema,
  after:     Schema,
  context:   string,
  filePath:  string,
  direction: 'request' | 'response',
  findings:  Omit<Finding, 'evidence'>[]
): void {
  const bProps     = before.properties ?? {}
  const aProps     = after.properties  ?? {}
  const bRequired  = new Set(before.required ?? [])
  const aRequired  = new Set(after.required  ?? [])

  // ── Fields removed ───────────────────────────────────────────────────────
  for (const [fieldName, bSchema] of Object.entries(bProps)) {
    const aSchema = aProps[fieldName]
    const qual    = `${context}.${fieldName}`

    if (!aSchema) {
      // Response fields: ALWAYS high severity when removed.
      // The spec's required[] indicates server-guaranteed delivery, but consumers
      // read optional response fields too — removing either breaks them.
      const severity: Severity = direction === 'response'
        ? 'high'
        : (bRequired.has(fieldName) ? 'medium' : 'safe')

      if (direction === 'response' || bRequired.has(fieldName)) {
        findings.push(make({
          changeType:    'removed_field',
          severity,
          sourceFile:    filePath,
          affectedValue: qual,
          description:   `Field \`${fieldName}\` removed from \`${context}\``,
          beforeSchema:  getSchemaType(bSchema as Schema),
          confidence:    92,
        }))
      }
      continue
    }

    // ── Type changed ─────────────────────────────────────────────────────
    const bType = getSchemaType(bSchema as Schema)
    const aType = getSchemaType(aSchema as Schema)
    if (bType !== aType) {
      findings.push(make({
        changeType:    'changed_type',
        severity:      'high',
        sourceFile:    filePath,
        affectedValue: qual,
        description:   `Type of \`${fieldName}\` changed in \`${context}\`: \`${bType}\` → \`${aType}\``,
        beforeSchema:  bType,
        afterSchema:   aType,
        confidence:    93,
      }))
    }

    // ── Nullable removed (string|null → string is narrowing) ─────────────
    const bNullable = isNullable(bSchema as Schema)
    const aNullable = isNullable(aSchema as Schema)
    if (bNullable && !aNullable) {
      findings.push(make({
        changeType:    'changed_type',
        severity:      'medium',
        sourceFile:    filePath,
        affectedValue: qual,
        description:   `Field \`${fieldName}\` in \`${context}\` is no longer nullable`,
        beforeSchema:  `${bType} | null`,
        afterSchema:   aType,
        confidence:    88,
      }))
    }

    // ── Required change ───────────────────────────────────────────────────
    if (!bRequired.has(fieldName) && aRequired.has(fieldName)) {
      findings.push(make({
        changeType:    direction === 'request' ? 'changed_required' : 'added_required_field',
        severity:      'high',
        sourceFile:    filePath,
        affectedValue: qual,
        description:   `Field \`${fieldName}\` became required in \`${context}\``,
        confidence:    92,
      }))
    }

    // ── Recurse into nested objects ──────────────────────────────────────
    if ((bSchema as Schema).properties && (aSchema as Schema).properties) {
      walkSchemaProperties(
        bSchema as Schema,
        aSchema as Schema,
        qual,
        filePath,
        direction,
        findings
      )
    }
  }

  // ── New required fields ───────────────────────────────────────────────────
  for (const [fieldName] of Object.entries(aProps)) {
    if (bProps[fieldName]) continue  // already handled above
    if (!aRequired.has(fieldName)) continue
    findings.push(make({
      changeType:    direction === 'request' ? 'added_required_field' : 'added_required_field',
      severity:      direction === 'request' ? 'high' : 'medium',
      sourceFile:    filePath,
      affectedValue: `${context}.${fieldName}`,
      description:   `New required field \`${fieldName}\` added to \`${context}\``,
      afterSchema:   getSchemaType((aProps[fieldName] as Schema)),
      confidence:    88,
    }))
  }
}

// ─── Component schema diffing ─────────────────────────────────────────────────

function diffComponents(
  before: OpenAPIV3.Document,
  after:  OpenAPIV3.Document,
  path:   string
): Omit<Finding, 'evidence'>[] {
  const findings: Omit<Finding, 'evidence'>[] = []

  const bSchemas = (before.components?.schemas ?? {}) as Record<string, Schema>
  const aSchemas = (after.components?.schemas  ?? {}) as Record<string, Schema>

  for (const [name, bSchema] of Object.entries(bSchemas)) {
    const aSchema = aSchemas[name]
    if (!aSchema) {
      findings.push(make({
        changeType:    'removed_interface',
        severity:      'high',
        sourceFile:    path,
        affectedValue: `#/components/schemas/${name}`,
        description:   `Schema component \`${name}\` was removed`,
        beforeSchema:  JSON.stringify(bSchema, null, 2).substring(0, 200),
        confidence:    90,
      }))
      continue
    }

    findings.push(...diffSchemas(bSchema, aSchema, `#/components/schemas/${name}`, path, 'response'))
  }

  return findings
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function make(f: {
  changeType:    ChangeType
  severity:      Severity
  sourceFile:    string
  affectedValue: string
  description:   string
  beforeSchema?: string
  afterSchema?:  string
  confidence:    number
}): Omit<Finding, 'evidence'> {
  return {
    changeType:    f.changeType,
    severity:      f.severity,
    sourceFile:    f.sourceFile,
    affectedValue: f.affectedValue,
    description:   f.description,
    beforeSchema:  f.beforeSchema,
    afterSchema:   f.afterSchema,
    confidence:    f.confidence,
  }
}

function makeEndpointRemoved(
  method:   string,
  route:    string,
  filePath: string
): Omit<Finding, 'evidence'> {
  return make({
    changeType:    'removed_endpoint',
    severity:      'high',
    sourceFile:    filePath,
    affectedValue: `${method} ${route}`,
    description:   `Endpoint \`${method} ${route}\` was removed`,
    confidence:    95,
  })
}

function getSchemaType(schema: Schema): string {
  if (!schema) return 'unknown'
  if (schema.type === 'array' && schema.items) {
    return `${getSchemaType(schema.items as Schema)}[]`
  }
  if (schema.type) return schema.type
  if (schema.oneOf) return schema.oneOf.map(s => getSchemaType(s as Schema)).join(' | ')
  if (schema.anyOf) return schema.anyOf.map(s => getSchemaType(s as Schema)).join(' | ')
  if (schema.allOf) return 'object (allOf)'
  if (schema.properties) return 'object'
  return 'unknown'
}

function isNullable(schema: Schema): boolean {
  if ((schema as any).nullable) return true
  if (schema.anyOf) return (schema.anyOf as Schema[]).some(s => (s as any).type === 'null')
  if (schema.oneOf) return (schema.oneOf as Schema[]).some(s => (s as any).type === 'null')
  return false
}

function extractJsonSchema(body: RequestBody): Schema | null {
  const content = body.content?.['application/json']
  return (content as MediaType)?.schema as Schema ?? null
}

function extractResponseSchema(resp: Response): Schema | null {
  const content = resp.content?.['application/json']
  return (content as MediaType)?.schema as Schema ?? null
}
