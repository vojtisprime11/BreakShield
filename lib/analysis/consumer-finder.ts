/**
 * lib/analysis/consumer-finder.ts
 *
 * Evidence-based API consumer discovery.
 *
 * Two-phase approach:
 *  Phase 1: GitHub Code Search → candidate file list
 *  Phase 2: Fetch file content → ts-morph AST → exact line + snippet
 *
 * Design decisions:
 *  - Queries are deduplicated before hitting the API: N findings sharing
 *    the same term → 1 search, results fanned back to all findings.
 *  - Searches run in parallel batches respecting GitHub's rate limit
 *    (30 req/min authenticated). Conservative limit: 8 concurrent,
 *    2s minimum gap between batch starts.
 *  - Overly generic terms are rejected before searching to prevent
 *    hundreds of false-positive hits polluting evidence.
 *  - File fetches within a batch also run concurrently (no rate limit).
 */

import { Octokit } from '@octokit/rest'
import type { Finding, EvidenceItem, ChangeType } from './types'
import {
  findPropertyUsages,
  findEndpointUsages,
  shouldAnalyzeFile,
} from './typescript-analyzer'
import { scoreEvidence } from './confidence'
import { logger } from '../logger'

// ─── Rate-limit constants ─────────────────────────────────────────────────────
// GitHub Code Search: 30 req/min for authenticated apps.
// We use 8 concurrent with a 2.5s batch gap → ~19 req/min, well within limit.

const BATCH_SIZE          = 8
const BATCH_GAP_MS        = 2500
const MAX_SEARCH_RESULTS  = 30
const MAX_FILES_PER_QUERY = 10

// ─── Query quality constants ──────────────────────────────────────────────────

/**
 * Minimum character length for a search term.
 * Anything shorter than 5 characters is almost guaranteed to produce
 * hundreds of irrelevant hits across a typical codebase.
 * Examples blocked: id, url, key, tag, ref, val, res, req, ctx, err
 */
const MIN_QUERY_LENGTH = 5

/**
 * Terms that are too generic to be useful as search queries.
 * Even if they pass the length check they'd flood results.
 * This list covers common TypeScript/REST API naming patterns.
 */
const GENERIC_TERMS = new Set([
  // Ultra-common field names
  'value', 'index', 'count', 'items', 'limit', 'query', 'order',
  'token', 'roles', 'scope', 'label', 'title', 'state', 'stage',
  'owner', 'group', 'users', 'teams', 'nodes', 'edges', 'links',
  'input', 'model', 'table', 'field', 'param', 'error', 'event',
  'level', 'class', 'style', 'color', 'image', 'price', 'total',
  'start', 'flags', 'rules', 'roles', 'tasks', 'pages', 'files',
  // Common short route segments that appear in every API
  'users', 'admin', 'login', 'oauth',
])

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchHit {
  repository: string
  filePath:   string
  textMatch?: string
}

/** Maps query term → search results. Built once, shared across findings. */
type QueryResultMap = Map<string, SearchHit[]>

// ─── Query builder ────────────────────────────────────────────────────────────

/**
 * Returns the search term for a finding, or null if the finding cannot
 * produce a reliable search query.
 *
 * Key changes vs v1:
 *  - Minimum length raised from 3 → 5
 *  - Generic terms blocklist applied
 *  - Short field names use qualified form (e.g. "UserResponse.id") as
 *    GitHub search supports exact symbol search via quotes
 *  - Endpoint paths use the most specific non-parameter segment
 */
export function buildSearchQuery(finding: Omit<Finding, 'evidence'>): string | null {
  const val = finding.affectedValue

  switch (finding.changeType as ChangeType) {
    case 'removed_field':
    case 'changed_type':
    case 'changed_required': {
      const field = val.includes('.') ? val.split('.').pop()! : val

      // Short field: use qualified name in quotes for precision
      // e.g. "UserResponse.id" → searches for that exact string pattern
      if (field.length < MIN_QUERY_LENGTH) {
        // Only use qualified form if parent name is available
        const dot = val.lastIndexOf('.')
        if (dot > 0) {
          const qualified = val.slice(dot - Math.min(20, dot))
          return qualified.length >= MIN_QUERY_LENGTH ? `"${qualified}"` : null
        }
        return null
      }

      if (GENERIC_TERMS.has(field.toLowerCase())) return null

      return field
    }

    case 'removed_endpoint': {
      // 'DELETE /organizations/{orgId}/members/{userId}'
      // → try segments from right (most specific first) until one is long enough
      const route = val.replace(/^(GET|POST|PUT|DELETE|PATCH|OPTIONS)\s+/, '')
      const segments = route
        .split('/')
        .map(s => s.replace(/\{[^}]+\}/g, '').trim())   // strip path params
        .filter(s => s.length >= MIN_QUERY_LENGTH && !GENERIC_TERMS.has(s.toLowerCase()))
        .sort((a, b) => b.length - a.length)              // longest first

      const best = segments[0]
      if (!best) return null

      // Use the normalized route path if no single segment is good enough
      const normalizedRoute = route.replace(/\{[^}]+\}/g, '').replace(/\/$/, '')
      return normalizedRoute.length >= MIN_QUERY_LENGTH ? normalizedRoute : best
    }

    case 'removed_interface':
    case 'removed_parameter':
    case 'added_required_field':
    case 'changed_return_type': {
      const parts = val.replace(/[()]/g, '').split(/[.#]/)
      const term  = parts[parts.length - 1]!
      if (!term || term.length < MIN_QUERY_LENGTH) return null
      if (GENERIC_TERMS.has(term.toLowerCase())) return null
      return term
    }

    default:
      return null
  }
}

// ─── GitHub Code Search ───────────────────────────────────────────────────────

async function searchCode(
  octokit:      Octokit,
  query:        string,
  repoFullName: string,
  log:          ReturnType<typeof logger.child>
): Promise<SearchHit[]> {
  try {
    const resp = await (octokit as any).request('GET /search/code', {
      q:        `${query} repo:${repoFullName}`,
      per_page: MAX_SEARCH_RESULTS,
      headers:  { accept: 'application/vnd.github.text-match+json' },
    })

    return (resp.data.items as any[]).map((item: any) => ({
      repository: repoFullName,
      filePath:   item.path as string,
      textMatch:  item.text_matches?.[0]?.fragment?.trim().substring(0, 160),
    }))
  } catch (err: any) {
    if (err.status === 422 || err.status === 403) {
      log.warn('Code search rate limited or unprocessable', { query, status: err.status })
      return []
    }
    if (err.status === 404) return []   // repo not indexed yet
    throw err
  }
}

// ─── Parallel batch executor ──────────────────────────────────────────────────

/**
 * Runs all unique queries in parallel batches.
 *
 * Within each batch: full concurrency (no artificial delay).
 * Between batches:   BATCH_GAP_MS pause to respect rate limit.
 *
 * Returns a map of query → search results.
 */
async function runSearchBatches(
  uniqueQueries: string[],
  octokit:       Octokit,
  repoFullName:  string,
  log:           ReturnType<typeof logger.child>
): Promise<QueryResultMap> {
  const results: QueryResultMap = new Map()

  // Split into chunks of BATCH_SIZE
  const batches: string[][] = []
  for (let i = 0; i < uniqueQueries.length; i += BATCH_SIZE) {
    batches.push(uniqueQueries.slice(i, i + BATCH_SIZE))
  }

  log.info('Starting search batches', {
    total_queries: uniqueQueries.length,
    batches:       batches.length,
    batch_size:    BATCH_SIZE,
  })

  for (let bIdx = 0; bIdx < batches.length; bIdx++) {
    const batch      = batches[bIdx]!
    const batchStart = Date.now()

    // All queries in this batch run simultaneously
    const batchResults = await Promise.all(
      batch.map(query =>
        searchCode(octokit, query, repoFullName, log)
          .then(hits => ({ query, hits }))
          .catch(err => {
            log.warn('Search query failed', { query, error: String(err) })
            return { query, hits: [] as SearchHit[] }
          })
      )
    )

    for (const { query, hits } of batchResults) {
      results.set(query, hits)
    }

    log.debug('Batch complete', {
      batch_index: bIdx + 1,
      of_batches:  batches.length,
      queries:     batch.length,
      elapsed_ms:  Date.now() - batchStart,
    })

    // Gap between batches — skip after the last one
    if (bIdx < batches.length - 1) {
      const elapsed = Date.now() - batchStart
      const remaining = BATCH_GAP_MS - elapsed
      if (remaining > 0) {
        await new Promise(r => setTimeout(r, remaining))
      }
    }
  }

  return results
}

// ─── File content fetcher ─────────────────────────────────────────────────────

async function fetchFileContent(
  octokit: Octokit,
  owner:   string,
  repo:    string,
  path:    string,
  ref:     string
): Promise<string | null> {
  try {
    const resp = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner, repo, path, ref,
    })
    const data = resp.data as { content?: string; encoding?: string; size?: number }

    if ((data.size ?? 0) > 200_000) return null   // skip generated/large files

    if (data.content && data.encoding === 'base64') {
      return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8')
    }
    return null
  } catch {
    return null
  }
}

// ─── Skip list for consumer files ────────────────────────────────────────────

const SKIP_CONSUMER_PATHS = [
  'node_modules/', '.test.', '.spec.', '__tests__/',
  'dist/', 'build/', '.next/', 'coverage/',
  'CHANGELOG', 'README', '.md',
  'migrations/', 'generated/', '__generated__/',
]

function shouldSkipConsumerFile(path: string, sourceFile: string): boolean {
  if (path === sourceFile) return true
  return SKIP_CONSUMER_PATHS.some(p => path.includes(p))
}

// ─── AST-verify a single search hit ──────────────────────────────────────────

async function verifyHit(
  hit:           SearchHit,
  finding:       Omit<Finding, 'evidence'>,
  query:         string,
  octokit:       Octokit,
  owner:         string,
  repo:          string,
  headSha:       string
): Promise<EvidenceItem[]> {
  const isTS    = shouldAnalyzeFile(hit.filePath)
  const content = isTS
    ? await fetchFileContent(octokit, owner, repo, hit.filePath, headSha)
    : null

  if (content && isTS) {
    // Full AST parse — most reliable evidence
    const usages = finding.changeType === 'removed_endpoint'
      ? findEndpointUsages(
          content, hit.filePath,
          finding.affectedValue.replace(/^(GET|POST|PUT|DELETE|PATCH)\s+/, '')
        )
      : findPropertyUsages(content, hit.filePath, query.replace(/^"|"$/g, ''))

    if (usages.length > 0) {
      return usages.map(usage => {
        const base: Omit<EvidenceItem, 'confidence'> = {
          repository:  hit.repository,
          filePath:    hit.filePath,
          lineNumber:  usage.lineNumber,
          column:      usage.column,
          codeSnippet: usage.codeSnippet,
          usageType:   usage.usageType,
        }
        return { ...base, confidence: scoreEvidence(base, finding.affectedValue) }
      })
    }

    // GitHub Search matched but AST found nothing — include with low confidence
    if (hit.textMatch) {
      const base: Omit<EvidenceItem, 'confidence'> = {
        repository:  hit.repository,
        filePath:    hit.filePath,
        lineNumber:  null,
        column:      null,
        codeSnippet: hit.textMatch,
        usageType:   'search_heuristic',
      }
      return [{ ...base, confidence: scoreEvidence(base, finding.affectedValue) }]
    }

    return []
  }

  // Non-TS file (Python, Go, etc.) — search heuristic only
  const base: Omit<EvidenceItem, 'confidence'> = {
    repository:  hit.repository,
    filePath:    hit.filePath,
    lineNumber:  null,
    column:      null,
    codeSnippet: hit.textMatch ?? `(see ${hit.filePath})`,
    usageType:   'search_heuristic',
  }
  return [{ ...base, confidence: scoreEvidence(base, finding.affectedValue) }]
}

// ─── Main: enrich findings with evidence ─────────────────────────────────────

export interface ConsumerFinderConfig {
  octokit:      Octokit
  owner:        string
  repo:         string
  repoFullName: string
  headSha:      string
  traceId:      string
}

export async function enrichWithEvidence(
  findings: Omit<Finding, 'evidence'>[],
  config:   ConsumerFinderConfig
): Promise<Finding[]> {
  const { octokit, owner, repo, repoFullName, headSha, traceId } = config
  const log = logger.child({
    trace_id: traceId,
    repo:     repoFullName,
    phase:    'consumer-finder',
  })

  // ── Step 1: Build query map (finding → query term) ──────────────────────
  // Multiple findings can share the same query — we search once and fan out.
  const findingQueryMap = new Map<Omit<Finding, 'evidence'>, string>()

  for (const finding of findings) {
    const query = buildSearchQuery(finding)
    if (query) findingQueryMap.set(finding, query)
  }

  // ── Step 2: Deduplicate queries → run parallel batches ──────────────────
  const uniqueQueries = [...new Set(findingQueryMap.values())]

  let queryResultMap: QueryResultMap = new Map()

  if (uniqueQueries.length > 0) {
    queryResultMap = await runSearchBatches(uniqueQueries, octokit, repoFullName, log)
  }

  log.info('Search phase complete', {
    findings:       findings.length,
    unique_queries: uniqueQueries.length,
    total_hits:     [...queryResultMap.values()].reduce((s, h) => s + h.length, 0),
  })

  // ── Step 3: For each finding, verify hits with AST in parallel ───────────
  const enriched = await Promise.all(
    findings.map(async (finding): Promise<Finding> => {
      const query = findingQueryMap.get(finding)

      if (!query) {
        log.debug('No query for finding', { finding: finding.affectedValue })
        return { ...finding, evidence: [] }
      }

      const rawHits   = queryResultMap.get(query) ?? []
      const filtered  = rawHits.filter(h => !shouldSkipConsumerFile(h.filePath, finding.sourceFile))

      if (filtered.length === 0) {
        return { ...finding, evidence: [] }
      }

      // Verify each hit concurrently — file fetches are IO-bound, safe to parallelise
      const evidenceArrays = await Promise.all(
        filtered
          .slice(0, MAX_FILES_PER_QUERY)
          .map(hit => verifyHit(hit, finding, query, octokit, owner, repo, headSha))
      )

      const evidence = evidenceArrays
        .flat()
        .sort((a, b) => b.confidence - a.confidence)   // highest confidence first

      const maxEvidenceConf = evidence.length > 0
        ? evidence[0]!.confidence
        : 0
      const finalConfidence = Math.max(finding.confidence, maxEvidenceConf)

      log.debug('Finding enriched', {
        finding:    finding.affectedValue,
        query,
        raw_hits:   rawHits.length,
        evidence:   evidence.length,
        confidence: finalConfidence,
      })

      return { ...finding, evidence, confidence: finalConfidence }
    })
  )

  return enriched
}
