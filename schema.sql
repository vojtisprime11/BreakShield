-- ================================================================
-- BreakShield v3 — Production Schema
-- Run in Supabase SQL Editor.
--
-- Migration from v2:
--   DROP TABLE IF EXISTS api_consumers, breaking_changes CASCADE;
--   (v2 tables are backward-compatible — no drops needed for v2→v3)
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- for fast text search on affected_value

-- ────────────────────────────────────────────────────────────────
-- ORGANIZATIONS
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  github_installation_id  bigint UNIQUE NOT NULL,
  github_account_login    text   NOT NULL,
  github_account_type     text   NOT NULL CHECK (github_account_type IN ('Organization','User')),
  plan                    text   NOT NULL DEFAULT 'free' CHECK (plan IN ('free','team','organization')),
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────
-- REPOSITORIES
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS repositories (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  github_repo_id   bigint UNIQUE NOT NULL DEFAULT 0,
  full_name        text NOT NULL UNIQUE,
  default_branch   text NOT NULL DEFAULT 'main',
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────
-- PULL REQUESTS
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pull_requests (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  repository_id        uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  github_pr_number     integer NOT NULL,
  github_pr_id         bigint  NOT NULL,
  title                text,
  author               text,
  base_branch          text,
  head_branch          text,
  base_sha             text,
  head_sha             text,
  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','queued','analyzing','analyzed','error')),
  check_run_id         bigint,
  comment_id           bigint,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  UNIQUE (repository_id, github_pr_number)
);

-- ────────────────────────────────────────────────────────────────
-- ANALYSIS RUNS
-- One row per execution attempt. Only the latest run counts.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analysis_runs (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pull_request_id uuid NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  trigger_event   text NOT NULL,   -- 'opened' | 'synchronize' | 'manual'
  status          text NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running','completed','failed')),
  error_message   text,
  duration_ms     integer,
  files_analyzed  integer DEFAULT 0,
  started_at      timestamptz DEFAULT now(),
  completed_at    timestamptz
);

-- ────────────────────────────────────────────────────────────────
-- FINDINGS
-- One row per distinct API contract change.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS findings (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  analysis_run_id uuid NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  pull_request_id uuid NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,

  change_type     text NOT NULL CHECK (change_type IN (
    'removed_field', 'changed_type', 'removed_endpoint',
    'added_required_field', 'changed_required', 'removed_parameter',
    'removed_interface', 'changed_return_type', 'added_optional_field'
  )),

  -- Computed column: true for all breaking change types
  is_breaking     boolean NOT NULL GENERATED ALWAYS AS (
    change_type IN (
      'removed_field', 'changed_type', 'removed_endpoint',
      'added_required_field', 'changed_required',
      'removed_parameter', 'removed_interface', 'changed_return_type'
    )
  ) STORED,

  severity        text NOT NULL CHECK (severity IN ('critical','high','medium','low','safe')),
  source_file     text NOT NULL,
  affected_value  text NOT NULL,
  description     text NOT NULL,
  before_schema   jsonb,
  after_schema    jsonb,

  -- Aggregate confidence across all evidence items (max)
  confidence      integer NOT NULL CHECK (confidence BETWEEN 0 AND 100),

  created_at      timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────
-- EVIDENCE ITEMS
-- One row per consumer location that uses the affected API surface.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evidence_items (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  finding_id   uuid NOT NULL REFERENCES findings(id) ON DELETE CASCADE,

  repository   text NOT NULL,    -- 'owner/repo'
  file_path    text NOT NULL,
  line_number  integer,
  col_number   integer,

  code_snippet text NOT NULL,
  usage_type   text NOT NULL CHECK (usage_type IN (
    'direct_access', 'destructuring', 'object_literal',
    'type_annotation', 'string_literal', 'search_heuristic'
  )),
  confidence   integer NOT NULL CHECK (confidence BETWEEN 0 AND 100),

  created_at   timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────
-- RISK ASSESSMENTS
-- One per PR, updated after each analysis run.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS risk_assessments (
  id                        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pull_request_id           uuid UNIQUE NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  analysis_run_id           uuid NOT NULL REFERENCES analysis_runs(id),
  risk_level                text NOT NULL CHECK (risk_level IN ('CRITICAL','HIGH','MEDIUM','LOW','SAFE')),
  risk_score                integer NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  breaking_count            integer NOT NULL DEFAULT 0,
  total_consumers_affected  integer NOT NULL DEFAULT 0,
  max_confidence            integer NOT NULL DEFAULT 0,
  summary                   jsonb,
  calculated_at             timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────
-- JOB QUEUE
-- Supabase-backed queue. No Redis required.
-- Processed via waitUntil() + cron retry fallback.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analysis_jobs (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  type            text NOT NULL DEFAULT 'analyze_pr',
  payload         jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','completed','failed')),
  attempts        integer NOT NULL DEFAULT 0,
  max_attempts    integer NOT NULL DEFAULT 3,
  error_message   text,
  idempotency_key text UNIQUE,
  scheduled_at    timestamptz DEFAULT now(),
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────
-- INDEXES — query performance
-- ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_repos_org              ON repositories(organization_id);
CREATE INDEX IF NOT EXISTS idx_prs_repo               ON pull_requests(repository_id);
CREATE INDEX IF NOT EXISTS idx_prs_status             ON pull_requests(status);
CREATE INDEX IF NOT EXISTS idx_prs_updated            ON pull_requests(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_pr                ON analysis_runs(pull_request_id);
CREATE INDEX IF NOT EXISTS idx_runs_status            ON analysis_runs(status);
CREATE INDEX IF NOT EXISTS idx_findings_run           ON findings(analysis_run_id);
CREATE INDEX IF NOT EXISTS idx_findings_pr            ON findings(pull_request_id);
CREATE INDEX IF NOT EXISTS idx_findings_breaking      ON findings(is_breaking) WHERE is_breaking = true;
CREATE INDEX IF NOT EXISTS idx_findings_affected_trgm ON findings USING gin(affected_value gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_evidence_finding       ON evidence_items(finding_id);
CREATE INDEX IF NOT EXISTS idx_evidence_repo_file     ON evidence_items(repository, file_path);
CREATE INDEX IF NOT EXISTS idx_risk_pr                ON risk_assessments(pull_request_id);
CREATE INDEX IF NOT EXISTS idx_risk_level             ON risk_assessments(risk_level);
CREATE INDEX IF NOT EXISTS idx_jobs_pending           ON analysis_jobs(status, scheduled_at)
  WHERE status IN ('pending','running');
CREATE INDEX IF NOT EXISTS idx_jobs_idempotency       ON analysis_jobs(idempotency_key);

-- ────────────────────────────────────────────────────────────────
-- UPDATED-AT TRIGGERS
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN new.updated_at = now(); RETURN new; END; $$;

DROP TRIGGER IF EXISTS trg_orgs_updated ON organizations;
CREATE TRIGGER trg_orgs_updated
  BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

DROP TRIGGER IF EXISTS trg_prs_updated ON pull_requests;
CREATE TRIGGER trg_prs_updated
  BEFORE UPDATE ON pull_requests FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- ────────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- Service role bypasses all RLS. Anon key respects these policies.
-- ────────────────────────────────────────────────────────────────

ALTER TABLE organizations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE repositories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pull_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_runs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE findings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_jobs    ENABLE ROW LEVEL SECURITY;

-- Public read-only dashboard (no auth required for read in free tier)
CREATE POLICY "public_read_orgs"
  ON organizations FOR SELECT USING (true);

CREATE POLICY "public_read_repos"
  ON repositories FOR SELECT USING (true);

CREATE POLICY "public_read_prs"
  ON pull_requests FOR SELECT USING (true);

CREATE POLICY "public_read_runs"
  ON analysis_runs FOR SELECT USING (true);

CREATE POLICY "public_read_findings"
  ON findings FOR SELECT USING (true);

CREATE POLICY "public_read_evidence"
  ON evidence_items FOR SELECT USING (true);

CREATE POLICY "public_read_risk"
  ON risk_assessments FOR SELECT USING (true);

-- Write access: service role only (bypasses RLS automatically)
-- No explicit INSERT/UPDATE/DELETE policies needed — service role is exempt.

-- Jobs: service role only
CREATE POLICY "no_anon_jobs"
  ON analysis_jobs FOR SELECT USING (false);

-- ────────────────────────────────────────────────────────────────
-- VIEWS — dashboard-ready aggregations
-- ────────────────────────────────────────────────────────────────

-- Latest analysis run per PR
CREATE OR REPLACE VIEW pr_latest_analysis AS
SELECT DISTINCT ON (pull_request_id)
  pull_request_id,
  id         AS run_id,
  status,
  duration_ms,
  files_analyzed,
  started_at,
  completed_at
FROM analysis_runs
ORDER BY pull_request_id, started_at DESC;

-- Full PR summary (for dashboard feed)
CREATE OR REPLACE VIEW pr_summary AS
SELECT
  pr.id,
  pr.github_pr_number,
  pr.title,
  pr.author,
  pr.status,
  r.full_name                 AS repo_full_name,
  o.github_account_login      AS org_login,
  ra.risk_level,
  ra.risk_score,
  ra.breaking_count,
  ra.total_consumers_affected,
  run.duration_ms,
  pr.created_at,
  pr.updated_at
FROM pull_requests    pr
JOIN repositories     r   ON r.id  = pr.repository_id
JOIN organizations    o   ON o.id  = r.organization_id
LEFT JOIN risk_assessments ra  ON ra.pull_request_id = pr.id
LEFT JOIN pr_latest_analysis run ON run.pull_request_id = pr.id;

-- 30-day risk trend per org (for analytics widget)
CREATE OR REPLACE VIEW org_risk_trend AS
SELECT
  o.id                      AS org_id,
  o.github_account_login,
  date_trunc('day', pr.created_at)                                        AS day,
  count(pr.id)                                                            AS total_prs,
  count(pr.id) FILTER (WHERE ra.risk_level IN ('HIGH','CRITICAL'))        AS high_risk_prs,
  coalesce(sum(ra.breaking_count), 0)                                     AS breaking_changes,
  coalesce(avg(ra.risk_score) FILTER (WHERE ra.risk_score IS NOT NULL), 0)::int AS avg_risk_score
FROM organizations    o
JOIN repositories     r   ON r.organization_id = o.id
JOIN pull_requests    pr  ON pr.repository_id  = r.id
LEFT JOIN risk_assessments ra ON ra.pull_request_id = pr.id
WHERE pr.created_at > now() - INTERVAL '30 days'
GROUP BY o.id, o.github_account_login, date_trunc('day', pr.created_at)
ORDER BY day;

-- Top breaking APIs (for "what's been breaking most" report)
CREATE OR REPLACE VIEW top_breaking_apis AS
SELECT
  f.affected_value,
  f.change_type,
  f.source_file,
  count(*)                      AS occurrences,
  max(f.confidence)             AS max_confidence,
  max(ra.total_consumers_affected) AS max_consumers,
  max(pr.updated_at)            AS last_seen
FROM findings           f
JOIN pull_requests      pr  ON pr.id = f.pull_request_id
LEFT JOIN risk_assessments ra ON ra.pull_request_id = pr.id
WHERE f.is_breaking = true
  AND pr.created_at > now() - INTERVAL '90 days'
GROUP BY f.affected_value, f.change_type, f.source_file
ORDER BY occurrences DESC, max_consumers DESC
LIMIT 50;

-- ────────────────────────────────────────────────────────────────
-- MAINTENANCE FUNCTION
-- Call periodically to clean up old completed/failed jobs.
-- Recommended: run via pg_cron every day.
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cleanup_old_jobs(older_than_days integer DEFAULT 7)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE deleted integer;
BEGIN
  DELETE FROM analysis_jobs
  WHERE status IN ('completed', 'failed')
    AND created_at < now() - (older_than_days || ' days')::interval;
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END; $$;

-- ── Example: run nightly via pg_cron ──
-- SELECT cron.schedule('cleanup-jobs', '0 3 * * *', $$ SELECT cleanup_old_jobs(7) $$);
