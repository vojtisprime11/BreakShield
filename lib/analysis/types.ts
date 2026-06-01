/**
 * lib/analysis/types.ts
 * Canonical types for the BreakShield analysis pipeline.
 * Every module speaks this language.
 */

// ─── Change classification ────────────────────────────────────────────────────

export type ChangeType =
  | 'removed_field'           // breaking: field deleted from type/response
  | 'changed_type'            // breaking: field type changed incompatibly
  | 'removed_endpoint'        // breaking: HTTP path+method removed
  | 'added_required_field'    // breaking: consumers must now provide it
  | 'changed_required'        // breaking: optional → required
  | 'removed_parameter'       // breaking: function param removed
  | 'removed_interface'       // breaking: exported type removed
  | 'changed_return_type'     // breaking: function return type changed
  | 'added_optional_field'    // safe: additive change

export const BREAKING_CHANGE_TYPES = new Set<ChangeType>([
  'removed_field',
  'changed_type',
  'removed_endpoint',
  'added_required_field',
  'changed_required',
  'removed_parameter',
  'removed_interface',
  'changed_return_type',
])

export function isBreakingChange(type: ChangeType): boolean {
  return BREAKING_CHANGE_TYPES.has(type)
}

// ─── Severity ─────────────────────────────────────────────────────────────────

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'safe'

// ─── Evidence ─────────────────────────────────────────────────────────────────
// Every warning must have proof. No evidence = no finding.

export type UsageType =
  | 'direct_access'      // obj.field             — highest confidence
  | 'destructuring'      // const { field } = obj
  | 'object_literal'     // { field: value }
  | 'type_annotation'    // param: UserResponse   — interface usage
  | 'string_literal'     // fetch('/users/:id')   — endpoint usage
  | 'search_heuristic'   // GitHub Search hit, not verified by AST

export interface EvidenceItem {
  /** owner/repo */
  repository: string
  filePath:   string
  lineNumber: number | null
  column:     number | null
  /** The exact line of code at that location */
  codeSnippet: string
  usageType:   UsageType
  confidence:  number   // 0–100
}

// ─── Finding ──────────────────────────────────────────────────────────────────
// One finding = one distinct API contract change, with evidence of who uses it.

export interface Finding {
  changeType:    ChangeType
  severity:      Severity
  sourceFile:    string
  affectedValue: string   // e.g. 'UserResponse.email' or 'GET /users/{id}'
  description:   string
  beforeSchema?: string   // human-readable representation
  afterSchema?:  string
  confidence:    number   // aggregate confidence (max of evidence items)
  evidence:      EvidenceItem[]
}

// ─── Risk ─────────────────────────────────────────────────────────────────────

export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'SAFE'

export interface RiskAssessment {
  riskLevel:              RiskLevel
  riskScore:              number    // 0–100 composite score
  breakingCount:          number
  totalConsumersAffected: number
  maxConfidence:          number
  summary: {
    critical: number
    high:     number
    medium:   number
    low:      number
    safe:     number
  }
}

// ─── Analysis result ──────────────────────────────────────────────────────────

export interface AnalysisResult {
  findings:       Finding[]
  risk:           RiskAssessment
  filesAnalyzed:  number
  durationMs:     number
  errors:         AnalysisError[]
}

export interface AnalysisError {
  file:    string
  phase:   'parse' | 'diff' | 'consumer_search' | 'unknown'
  message: string
}

// ─── Pipeline input ───────────────────────────────────────────────────────────

export interface PRContext {
  owner:          string
  repo:           string
  repoFullName:   string
  prNumber:       number
  baseSha:        string
  headSha:        string
  installationId: number
  traceId:        string
}

// ─── GitHub file content ──────────────────────────────────────────────────────

export interface FileVersion {
  path:    string
  before:  string | null   // null = file didn't exist
  after:   string | null   // null = file was deleted
}
