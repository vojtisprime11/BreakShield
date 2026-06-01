/**
 * lib/supabase.ts
 * Type-safe Supabase client for v2 schema.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

const URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY!

// ─── Singleton clients ────────────────────────────────────────────────────────

let _admin:   SupabaseClient | null = null
let _browser: SupabaseClient | null = null

/** Server-only. Uses service_role key — bypasses Row Level Security. */
export function supabaseAdmin(): SupabaseClient {
  if (!_admin) _admin = createClient(URL, SVC, { auth: { persistSession: false } })
  return _admin
}

/** Browser/RSC safe. Uses anon key — respects RLS. */
export function supabaseBrowser(): SupabaseClient {
  if (!_browser) _browser = createClient(URL, ANON)
  return _browser
}

// ─── Row types (mirrors schema.sql) ──────────────────────────────────────────

export interface OrgRow {
  id:                     string
  github_installation_id: number
  github_account_login:   string
  github_account_type:    string
  plan:                   'free' | 'team' | 'organization'
  created_at:             string
  updated_at:             string
}

export interface RepoRow {
  id:              string
  organization_id: string
  github_repo_id:  number
  full_name:       string
  default_branch:  string
  is_active:       boolean
  created_at:      string
}

export interface PRRow {
  id:               string
  repository_id:    string
  github_pr_number: number
  github_pr_id:     number
  title:            string | null
  author:           string | null
  base_branch:      string | null
  head_branch:      string | null
  base_sha:         string | null
  head_sha:         string | null
  status:           'pending' | 'queued' | 'analyzing' | 'analyzed' | 'error'
  check_run_id:     number | null
  comment_id:       number | null
  created_at:       string
  updated_at:       string
}

export interface AnalysisRunRow {
  id:              string
  pull_request_id: string
  trigger_event:   string
  status:          'running' | 'completed' | 'failed'
  error_message:   string | null
  duration_ms:     number | null
  files_analyzed:  number
  started_at:      string
  completed_at:    string | null
}

export interface FindingRow {
  id:              string
  analysis_run_id: string
  pull_request_id: string
  change_type:     string
  is_breaking:     boolean
  severity:        string
  source_file:     string
  affected_value:  string
  description:     string
  before_schema:   { text: string } | null
  after_schema:    { text: string } | null
  confidence:      number
  created_at:      string
}

export interface EvidenceItemRow {
  id:           string
  finding_id:   string
  repository:   string
  file_path:    string
  line_number:  number | null
  col_number:   number | null
  code_snippet: string
  usage_type:   string
  confidence:   number
  created_at:   string
}

export interface RiskAssessmentRow {
  id:                       string
  pull_request_id:          string
  analysis_run_id:          string
  risk_level:               'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'SAFE'
  risk_score:               number
  breaking_count:           number
  total_consumers_affected: number
  max_confidence:           number
  summary:                  Record<string, number>
  calculated_at:            string
}

export interface JobRow {
  id:              string
  type:            string
  payload:         Record<string, unknown>
  status:          'pending' | 'running' | 'completed' | 'failed'
  attempts:        number
  max_attempts:    number
  error_message:   string | null
  idempotency_key: string | null
  scheduled_at:    string
  started_at:      string | null
  completed_at:    string | null
  created_at:      string
}

// ─── PR summary view type ─────────────────────────────────────────────────────

export interface PRSummaryRow {
  id:                      string
  github_pr_number:        number
  title:                   string | null
  author:                  string | null
  status:                  string
  repo_full_name:          string
  org_login:               string
  risk_level:              string | null
  risk_score:              number | null
  breaking_count:          number | null
  total_consumers_affected: number | null
  duration_ms:             number | null
  created_at:              string
  updated_at:              string
}
