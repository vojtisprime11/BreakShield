'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import styles from './analyze.module.css'

const INSTALL_URL  = 'https://github.com/apps/breakshield-ci'
const GITHUB_LOGIN = '/api/auth/login'

// ─── AI Providers & Models ────────────────────────────────────────────────────

type AIProvider = 'gemini' | 'openai' | 'anthropic' | 'groq' | 'perplexity'

const PROVIDERS = [
  {
    id: 'gemini' as AIProvider,
    name: 'Google Gemini',
    free: true,
    url: 'https://aistudio.google.com/apikey',
    keyPrefix: 'AIza…',
    keyDesc: 'Google AI Studio API key — works with all Gemini models. Free tier gives 1,500 req/day.',
  },
  {
    id: 'openai' as AIProvider,
    name: 'OpenAI',
    free: false,
    url: 'https://platform.openai.com/api-keys',
    keyPrefix: 'sk-…',
    keyDesc: 'OpenAI platform API key — works with GPT-5.x, GPT-4o, o3, o4-mini and all other OpenAI models.',
  },
  {
    id: 'anthropic' as AIProvider,
    name: 'Anthropic Claude',
    free: false,
    url: 'https://console.anthropic.com/settings/keys',
    keyPrefix: 'sk-ant-…',
    keyDesc: 'Anthropic API key — works with all Claude models (Opus, Sonnet, Haiku).',
  },
  {
    id: 'groq' as AIProvider,
    name: 'Groq',
    free: true,
    url: 'https://console.groq.com/keys',
    keyPrefix: 'gsk_…',
    keyDesc: 'GroqCloud API key — works with all Groq-hosted models (Llama, Qwen, GPT-OSS). Free tier available.',
  },
  {
    id: 'perplexity' as AIProvider,
    name: 'Perplexity',
    free: false,
    url: 'https://www.perplexity.ai/settings/api',
    keyPrefix: 'pplx-…',
    keyDesc: 'Perplexity API key — works with Sonar, Sonar Pro, Sonar Reasoning Pro and Sonar Deep Research.',
  },
] as const

const MODELS: Record<AIProvider, { id: string; name: string; free?: boolean }[]> = {
  gemini: [
    { id: 'gemini-3.5-flash',       name: 'Gemini 3.5 Flash',         free: true },
    { id: 'gemini-3.1-flash-lite',  name: 'Gemini 3.1 Flash-Lite',    free: true },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (preview)',  free: true },
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (preview)' },
    { id: 'gemini-2.5-pro',         name: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash',       name: 'Gemini 2.5 Flash',         free: true },
    { id: 'gemini-2.5-flash-lite',  name: 'Gemini 2.5 Flash-Lite',    free: true },
  ],
  openai: [
    { id: 'gpt-5.5',       name: 'GPT-5.5' },
    { id: 'gpt-5.4',       name: 'GPT-5.4' },
    { id: 'gpt-5.4-mini',  name: 'GPT-5.4 mini' },
    { id: 'gpt-5.4-nano',  name: 'GPT-5.4 nano' },
    { id: 'gpt-4o',        name: 'GPT-4o (legacy)' },
    { id: 'gpt-4.1',       name: 'GPT-4.1 (legacy)' },
    { id: 'gpt-4.1-mini',  name: 'GPT-4.1 mini (legacy)' },
    { id: 'o4-mini',       name: 'o4-mini (legacy)' },
    { id: 'o3',            name: 'o3 (legacy)' },
  ],
  anthropic: [
    { id: 'claude-opus-4-8',           name: 'Claude Opus 4.8' },
    { id: 'claude-sonnet-4-6',         name: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5',          name: 'Claude Haiku 4.5' },
    { id: 'claude-opus-4-5',           name: 'Claude Opus 4.5' },
    { id: 'claude-sonnet-4-5',         name: 'Claude Sonnet 4.5' },
    { id: 'claude-3-7-sonnet-20250219',name: 'Claude 3.7 Sonnet' },
    { id: 'claude-3-5-sonnet-20241022',name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
  ],
  groq: [
    { id: 'openai/gpt-oss-120b',                       name: 'OpenAI GPT-OSS 120B',  free: true },
    { id: 'openai/gpt-oss-20b',                        name: 'OpenAI GPT-OSS 20B',   free: true },
    { id: 'llama-3.3-70b-versatile',                   name: 'Llama 3.3 70B',         free: true },
    { id: 'llama-3.1-8b-instant',                      name: 'Llama 3.1 8B Instant',  free: true },
    { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B',    free: true },
    { id: 'qwen/qwen3-32b',                            name: 'Qwen3 32B',             free: true },
  ],
  perplexity: [
    { id: 'sonar-deep-research', name: 'Sonar Deep Research' },
    { id: 'sonar-pro',           name: 'Sonar Pro' },
    { id: 'sonar-reasoning-pro', name: 'Sonar Reasoning Pro' },
    { id: 'sonar',               name: 'Sonar' },
  ],
}

const DEFAULT_MODELS: Record<AIProvider, string> = {
  gemini:     'gemini-2.5-flash',
  openai:     'gpt-5.4-mini',
  anthropic:  'claude-haiku-4-5',
  groq:       'llama-3.3-70b-versatile',
  perplexity: 'sonar',
}

type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'SAFE'

const RISK: Record<RiskLevel, { color: string; bg: string; border: string; label: string; desc: string }> = {
  CRITICAL: { color: '#f43f5e', bg: 'rgba(244,63,94,.09)', border: 'rgba(244,63,94,.25)', label: '🔴 CRITICAL',  desc: 'This PR will break deployed consumers. Do not merge without coordination.' },
  HIGH:     { color: '#f97316', bg: 'rgba(249,115,22,.09)', border: 'rgba(249,115,22,.25)', label: '🟠 HIGH',    desc: 'Breaking changes detected. Review required before merge.' },
  MEDIUM:   { color: '#f59e0b', bg: 'rgba(245,158,11,.09)', border: 'rgba(245,158,11,.25)', label: '🟡 MEDIUM',  desc: 'Possible breaking changes. Verify consumers before deploying.' },
  LOW:      { color: '#22c55e', bg: 'rgba(34,197,94,.09)',  border: 'rgba(34,197,94,.25)',  label: '🟢 LOW',     desc: 'Minor concerns. Review recommended.' },
  SAFE:     { color: '#10b981', bg: 'rgba(16,185,129,.09)', border: 'rgba(16,185,129,.25)', label: '✅ SAFE',    desc: 'No breaking API changes detected.' },
}

const BREAKING = new Set([
  'removed_field','changed_type','removed_endpoint',
  'added_required_field','changed_required','removed_parameter',
  'removed_interface','changed_return_type',
])

const CHANGE_LABEL: Record<string, string> = {
  removed_field:        'Removed field',
  changed_type:         'Changed type',
  removed_endpoint:     'Removed endpoint',
  added_required_field: 'Added required field',
  changed_required:     'Now required',
  removed_parameter:    'Removed parameter',
  removed_interface:    'Removed interface',
  changed_return_type:  'Changed return type',
  added_optional_field: 'Added optional field',
}

interface Finding {
  changeType: string; severity: string
  sourceFile: string; affectedValue: string
  description: string
  beforeSchema?: string; afterSchema?: string
  confidence: number
  evidence?: { repository: string; filePath: string; lineNumber: number | null; codeSnippet: string; usageType: string; confidence: number }[]
}

interface Risk {
  riskLevel: RiskLevel; riskScore: number
  breakingCount: number; totalConsumersAffected: number; maxConfidence: number
  summary: { critical: number; high: number; medium: number; low: number; safe: number }
}

interface AnalysisResult {
  ok: boolean; isDemo?: boolean; withEvidence?: boolean
  prTitle?: string; prUrl?: string; prState?: string; prAuthor?: string
  baseBranch?: string; headBranch?: string; headSha?: string
  findings?: Finding[]; risk?: Risk
  filesAnalyzed?: number; totalFiles?: number; durationMs?: number
  note?: string; error?: string; message?: string
}

export default function AnalyzePage() {
  const [url, setUrl]       = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<AnalysisResult | null>(null)
  const [error, setError]     = useState('')
  const [copied, setCopied]   = useState(false)
  const [user, setUser]       = useState<{ login: string; avatarUrl: string } | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const resultRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => { if (d.user) setUser(d.user) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (result && resultRef.current) {
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100)
    }
  }, [result])

  const analyze = useCallback(async (opts: { demo?: boolean; prUrl?: string } = {}) => {
    setLoading(true); setError(''); setResult(null)
    try {
      const body = opts.demo ? { demo: true } : { prUrl: opts.prUrl ?? url }
      const resp = await fetch('/api/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data: AnalysisResult = await resp.json()
      if (!resp.ok || data.error) setError(data.error ?? 'Analysis failed')
      else setResult(data)
    } catch { setError('Network error. Please try again.') }
    finally { setLoading(false) }
  }, [url])

  function copyReport() {
    if (!result) return
    const r = result.risk
    const breaking = result.findings?.filter(f => BREAKING.has(f.changeType)) ?? []
    const text = [
      `BreakShield CI — ${result.prTitle}`,
      `Risk: ${r?.riskLevel} (${r?.riskScore}/100)`,
      `Breaking changes: ${r?.breakingCount ?? 0}`,
      `Consumers affected: ${r?.totalConsumersAffected ?? 0}`,
      '',
      ...breaking.map(f => `• ${f.affectedValue} — ${CHANGE_LABEL[f.changeType] ?? f.changeType} (${f.confidence}% confidence)`),
      '',
      `Analyzed by BreakShield CI: https://breakshield-ci.vercel.app/analyze`,
    ].join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const breaking = result?.findings?.filter(f => BREAKING.has(f.changeType)) ?? []
  const safe     = result?.findings?.filter(f => !BREAKING.has(f.changeType)) ?? []
  const riskMeta = result?.risk ? RISK[result.risk.riskLevel] : null

  return (
    <div className={styles.root}>
      {/* ── Nav ── */}
      <nav className={styles.nav}>
        <Link href="/" className={styles.navBrand}>
          <Shield /> BreakShield CI
        </Link>
        <div className={styles.navRight}>
          <Link href="/blog" className={styles.navLink}>Blog</Link>
          <Link href="/dashboard" className={styles.navLink}>Dashboard</Link>
          {user && (
            <button className={styles.navSettingsBtn} onClick={() => setShowSettings(s => !s)}>
              ⚙ AI Settings
            </button>
          )}
          {user ? (
            <div className={styles.navUser}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={user.avatarUrl} alt={user.login} className={styles.navAvatar} />
              <span>@{user.login}</span>
            </div>
          ) : (
            <a href={GITHUB_LOGIN} className={styles.navSignIn}><GH size={13} />Sign in</a>
          )}
        </div>
      </nav>

      <div className={styles.page}>
        {/* ── Header ── */}
        <header className={styles.header}>
          <div className={styles.headerBadge}>
            <span className={styles.pulseDot} />
            {user ? `Signed in as @${user.login} · Private repos supported` : 'No signup required · Public repos'}
          </div>
          <h1 className={styles.h1}>
            Analyze a Pull Request
          </h1>
          <p className={styles.headerSub}>
            Paste any GitHub PR URL. BreakShield CI parses the TypeScript AST and finds every breaking change in seconds.
          </p>
        </header>

        {/* ── Settings Panel ── */}
        {showSettings && user && (
          <AISettingsPanel onClose={() => setShowSettings(false)} />
        )}

        {/* ── Input card ── */}
        <div className={styles.inputCard}>
          <div className={styles.inputRow}>
            <div className={styles.inputPrefix}><GH size={15} /></div>
            <input
              className={styles.input}
              type="url"
              placeholder="https://github.com/owner/repo/pull/123"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && url.trim() && analyze()}
              disabled={loading}
              autoFocus
            />
            <button
              className={styles.btnAnalyze}
              onClick={() => analyze()}
              disabled={loading || !url.trim()}
            >
              {loading ? <Spin /> : <>Analyze <span className={styles.arrowKey}>↵</span></>}
            </button>
          </div>
          <div className={styles.quickRow}>
            <span className={styles.quickLabel}>Quick start:</span>
            <button className={styles.quickBtn} onClick={() => analyze({ demo: true })} disabled={loading}>
              ⚡ Live demo — real breaking change
            </button>
            {!user && (
              <a href={GITHUB_LOGIN} className={styles.quickBtn}>
                <GH size={12} /> Sign in for private repos
              </a>
            )}
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className={styles.errorCard}>
            <span className={styles.errorIcon}>⚠</span>
            <div>
              <strong>Analysis failed</strong>
              <p>{error}</p>
              {error.includes('private') && !user && (
                <a href={GITHUB_LOGIN} className={styles.errorCta}><GH size={13} />Sign in with GitHub</a>
              )}
            </div>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className={styles.loadingCard}>
            <div className={styles.loadingProgress} />
            <div className={styles.loadingStages}>
              {[
                { icon: '📡', text: 'Fetching PR from GitHub…' },
                { icon: '🔬', text: 'Parsing TypeScript AST with ts-morph…' },
                { icon: '⚖️', text: 'Diffing interfaces and type aliases…' },
                { icon: '🎯', text: 'Scoring confidence and calculating risk…' },
              ].map((s, i) => (
                <div key={i} className={styles.loadingStage} style={{ animationDelay: `${i * 0.35}s` }}>
                  <span>{s.icon}</span>
                  <span>{s.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Result ── */}
        {result && !loading && (
          <div className={styles.resultWrap} ref={resultRef}>

            {/* PR header bar */}
            <div className={styles.prBar}>
              <div className={styles.prBarLeft}>
                <span className={`${styles.prState} ${result.prState === 'open' ? styles.prOpen : styles.prMerged}`}>
                  {result.prState === 'open' ? '⬤ Open' : '✓ Merged'}
                </span>
                <a href={result.prUrl} target="_blank" rel="noopener" className={styles.prTitle}>
                  {result.prTitle}
                </a>
              </div>
              <div className={styles.prBarRight}>
                <span className={styles.prMeta}>
                  <code>{result.headBranch}</code> → <code>{result.baseBranch}</code>
                </span>
                <span className={styles.prMeta}>{result.filesAnalyzed} files · {result.durationMs}ms</span>
                {result.isDemo && <span className={styles.demoBadge}>Demo</span>}
                <button className={styles.copyBtn} onClick={copyReport}>
                  {copied ? '✓ Copied' : '⧉ Copy report'}
                </button>
              </div>
            </div>

            {/* Risk banner */}
            {result.risk && riskMeta && (
              <div className={styles.riskBanner} style={{ background: riskMeta.bg, borderColor: riskMeta.border }}>
                <div className={styles.riskBannerLeft}>
                  <div className={styles.riskLevel} style={{ color: riskMeta.color }}>{riskMeta.label}</div>
                  <p className={styles.riskDesc}>{riskMeta.desc}</p>
                </div>
                <div className={styles.riskStats}>
                  <RiskStat n={result.risk.riskScore} label="Score" max={100} color={riskMeta.color} />
                  <RiskStat n={result.risk.breakingCount}          label="Breaking"  />
                  <RiskStat n={result.risk.totalConsumersAffected} label="Consumers" />
                  <RiskStat n={result.risk.maxConfidence}          label="Confidence" suffix="%" />
                </div>
              </div>
            )}

            {/* Severity summary pills */}
            {result.risk && result.risk.breakingCount > 0 && (
              <div className={styles.severityRow}>
                {result.risk.summary.critical > 0 && <SevPill n={result.risk.summary.critical} label="critical" color="#f43f5e" />}
                {result.risk.summary.high     > 0 && <SevPill n={result.risk.summary.high}     label="high"     color="#f97316" />}
                {result.risk.summary.medium   > 0 && <SevPill n={result.risk.summary.medium}   label="medium"   color="#f59e0b" />}
                {result.risk.summary.low      > 0 && <SevPill n={result.risk.summary.low}      label="low"      color="#22c55e" />}
                {result.risk.summary.safe     > 0 && <SevPill n={result.risk.summary.safe}     label="safe"     color="#10b981" />}
              </div>
            )}

            {/* Empty / message */}
            {result.message && (
              <div className={styles.emptyResult}>
                <div className={styles.emptyResultIcon}>✅</div>
                <div>
                  <strong>No breaking changes detected</strong>
                  <p>{result.message}</p>
                </div>
              </div>
            )}

            {/* Breaking findings */}
            {breaking.length > 0 && (
              <section className={styles.findingSection}>
                <div className={styles.findingSectionHead}>
                  <span className={styles.sectionBadge} style={{ background: 'rgba(244,63,94,.1)', color: '#f43f5e' }}>
                    ⚠ {breaking.length} Breaking Change{breaking.length !== 1 ? 's' : ''}
                  </span>
                  <span className={styles.sectionHint}>Blocks merge on HIGH / CRITICAL</span>
                </div>
                <div className={styles.findingList}>
                  {breaking.map((f, i) => (
                    <FindingCard
                      key={i}
                      finding={f}
                      withEvidence={!!result.withEvidence}
                      prData={result.prUrl ? (() => {
                        const m = result.prUrl!.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
                        if (!m) return null
                        return {
                          owner: m[1]!, repo: m[2]!,
                          baseBranch: result.baseBranch ?? 'main',
                          prNumber: parseInt(m[3]!, 10),
                          headSha: result.headSha ?? '',
                        }
                      })() : null}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Safe findings */}
            {safe.length > 0 && (
              <details className={styles.safeSection}>
                <summary className={styles.safeSummary}>
                  <span className={styles.sectionBadge} style={{ background: 'rgba(16,185,129,.1)', color: '#10b981' }}>
                    ✓ {safe.length} Safe Additive Change{safe.length !== 1 ? 's' : ''}
                  </span>
                  <span className={styles.sectionHint}>These are backward-compatible — safe to merge</span>
                </summary>
                <div className={styles.safeList}>
                  {safe.map((f, i) => (
                    <div key={i} className={styles.safeFinding}>
                      <code className={styles.safeValue}>{f.affectedValue}</code>
                      <span className={styles.safeDesc}>{f.description}</span>
                      <span className={styles.safeFile}>{f.sourceFile}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Evidence / upsell */}
            {!result.withEvidence && breaking.length > 0 && (
              <div className={styles.upsellCard}>
                <div className={styles.upsellIcon}>🔍</div>
                <div className={styles.upsellBody}>
                  <strong>Missing: consumer evidence</strong>
                  <p>
                    This demo shows what changed. Install BreakShield CI to also see
                    <em> which files in your codebase will break</em> — with exact file paths,
                    line numbers, and the specific line of code that uses the removed API.
                  </p>
                </div>
                <div className={styles.upsellActions}>
                  <a href={INSTALL_URL} target="_blank" rel="noopener" className={styles.upsellPrimary}>
                    Install free →
                  </a>
                  {!user && (
                    <a href={GITHUB_LOGIN} className={styles.upsellSecondary}>
                      <GH size={13} /> Sign in
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Share row */}
            <div className={styles.shareRow}>
              <span className={styles.shareLabel}>Share:</span>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Just analyzed a PR with BreakShield CI\n${result.risk?.riskLevel} risk · ${result.risk?.breakingCount} breaking changes\n\nhttps://breakshield-ci.vercel.app/analyze`)}`}
                target="_blank" rel="noopener" className={styles.shareBtn}
              >
                Post on X
              </a>
              <button className={styles.shareBtn} onClick={copyReport}>{copied ? '✓ Copied' : 'Copy report'}</button>
              {result.prUrl && (
                <a href={result.prUrl} target="_blank" rel="noopener" className={styles.shareBtn}>
                  View PR on GitHub ↗
                </a>
              )}
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {!result && !loading && !error && (
          <div className={styles.emptyState}>
            <div className={styles.emptyGrid}>
              {[
                { icon:'🔬', title:'Full TypeScript AST', desc:'We use ts-morph to parse a real TypeScript compiler AST — not regex. Every finding maps to an actual node in your code.' },
                { icon:'📋', title:'TypeScript + OpenAPI', desc:'Interfaces, type aliases, exported functions, REST endpoints, request bodies, response schemas — all in one pass.' },
                { icon:'🎯', title:'Confidence scoring', desc:'Direct access (90%) · Destructuring (80%) · Type annotation (80%) · Search heuristic (35%). Low-confidence noise is filtered.' },
                { icon:'⚡', title:'Results in seconds', desc:'Parallel file fetching, in-memory AST parsing, no disk I/O. Typically under 3 seconds for a normal PR.' },
              ].map(c => (
                <div key={c.title} className={styles.emptyCard}>
                  <div className={styles.emptyCardIcon}>{c.icon}</div>
                  <h3 className={styles.emptyCardTitle}>{c.title}</h3>
                  <p className={styles.emptyCardDesc}>{c.desc}</p>
                </div>
              ))}
            </div>
            <div className={styles.limitNote}>
              <span>ℹ</span>
              <p>
                This page analyzes <strong>public repositories</strong> without login.
                {' '}<a href={GITHUB_LOGIN}>Sign in with GitHub</a> to analyze private repos
                and get consumer evidence (exact file:line of every caller that will break).
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function FindingCard({ finding: f, withEvidence, prData }: {
  finding: Finding
  withEvidence: boolean
  prData?: { owner: string; repo: string; baseBranch: string; prNumber: number; headSha: string } | null
}) {
  const [fixing, setFixing]   = useState(false)
  const [fixPr,  setFixPr]    = useState<{ url: string; number: number } | null>(null)
  const [fixErr, setFixErr]   = useState('')

  async function suggestFix() {
    if (!prData) return
    setFixing(true); setFixErr(''); setFixPr(null)
    try {
      const resp = await fetch('/api/autofix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner:       prData.owner,
          repo:        prData.repo,
          baseBranch:  prData.baseBranch,
          prNumber:    prData.prNumber,
          filePath:    f.sourceFile,
          headSha:     prData.headSha,
          finding: {
            changeType:    f.changeType,
            affectedValue: f.affectedValue,
            description:   f.description,
            beforeSchema:  f.beforeSchema,
            afterSchema:   f.afterSchema,
          },
        }),
      })
      const data = await resp.json()
      if (!resp.ok || data.error) setFixErr(data.error ?? 'Fix failed')
      else setFixPr({ url: data.prUrl, number: data.prNumber })
    } catch { setFixErr('Network error') }
    finally { setFixing(false) }
  }

  const isBreaking = BREAKING.has(f.changeType)
  const evidenceItems = f.evidence ?? []
  const highConf = evidenceItems.filter(e => e.confidence >= 80)
  const lowConf  = evidenceItems.filter(e => e.confidence < 80)

  return (
    <div className={`${styles.findingCard} ${isBreaking ? styles.findingBreaking : styles.findingSafe}`}>
      {/* Top row */}
      <div className={styles.findingTop}>
        <code className={styles.findingValue}>{f.affectedValue}</code>
        <span className={styles.findingTypeBadge}>{CHANGE_LABEL[f.changeType] ?? f.changeType}</span>
        <span
          className={styles.findingConf}
          style={{ color: f.confidence >= 80 ? '#10b981' : f.confidence >= 55 ? '#f59e0b' : '#f43f5e' }}
        >
          {f.confidence}%
          {f.confidence >= 80 ? ' · AST-verified' : f.confidence >= 55 ? ' · probable' : ' · weak signal'}
        </span>
      </div>

      {/* Description */}
      <p className={styles.findingDesc}>{f.description}</p>

      {/* File */}
      <div className={styles.findingFile}>
        <span className={styles.fileIcon}>📄</span>
        <code>{f.sourceFile}</code>
      </div>

      {/* Diff */}
      {(f.beforeSchema || f.afterSchema) && (
        <div className={styles.findingDiff}>
          {f.beforeSchema && (
            <div className={styles.diffBefore}>
              <span className={styles.diffLabel} style={{ color: '#f43f5e' }}>Before</span>
              <code className={styles.diffCode}>{f.beforeSchema}</code>
            </div>
          )}
          {f.afterSchema && (
            <div className={styles.diffAfter}>
              <span className={styles.diffLabel} style={{ color: '#10b981' }}>After</span>
              <code className={styles.diffCode}>{f.afterSchema}</code>
            </div>
          )}
        </div>
      )}

      {/* Evidence */}
      {withEvidence && evidenceItems.length > 0 && (
        <div className={styles.evidenceSection}>
          <div className={styles.evidenceHeader}>
            Consumer files that will break ({evidenceItems.length}):
          </div>
          {highConf.map((e, i) => (
            <div key={i} className={styles.evidenceItem}>
              <div className={styles.evidenceFileLine}>
                {e.lineNumber
                  ? <a href={`https://github.com/${e.repository}/blob/HEAD/${e.filePath}#L${e.lineNumber}`} target="_blank" rel="noopener" className={styles.evidenceLink}>{e.repository}/{e.filePath}:{e.lineNumber}</a>
                  : <span className={styles.evidenceLink}>{e.repository}/{e.filePath}</span>
                }
                <span className={styles.evidenceConf} style={{ color: '#10b981' }}>{e.confidence}% · {e.usageType.replace(/_/g, ' ')}</span>
              </div>
              {e.codeSnippet && (
                <code className={styles.evidenceCode}>{e.codeSnippet.trim().slice(0, 200)}</code>
              )}
            </div>
          ))}
          {lowConf.length > 0 && (
            <details className={styles.evidenceLow}>
              <summary>{lowConf.length} more possible consumer{lowConf.length !== 1 ? 's' : ''} (lower confidence)</summary>
              {lowConf.map((e, i) => (
                <div key={i} className={styles.evidenceItem}>
                  <div className={styles.evidenceFileLine}>
                    <span className={styles.evidenceLink}>{e.filePath}</span>
                    <span className={styles.evidenceConf} style={{ color: '#f59e0b' }}>{e.confidence}%</span>
                  </div>
                  {e.codeSnippet && <code className={styles.evidenceCode}>{e.codeSnippet.trim().slice(0, 150)}</code>}
                </div>
              ))}
            </details>
          )}
        </div>
      )}

      {/* Auto-fix button */}
      {isBreaking && prData && (
        <div className={styles.autofixRow}>
          {fixPr ? (
            <a href={fixPr.url} target="_blank" rel="noopener" className={styles.autofixSuccess}>
              ✓ Fix PR #{fixPr.number} created — Review &amp; merge →
            </a>
          ) : (
            <>
              <button className={styles.autofixBtn} onClick={suggestFix} disabled={fixing}>
                {fixing ? <><Spin /> Generating fix…</> : <>✨ Suggest fix with AI</>}
              </button>
              {fixErr && <span className={styles.autofixErr}>{fixErr}</span>}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function RiskStat({ n, label, max, color, suffix = '' }: { n: number; label: string; max?: number; color?: string; suffix?: string }) {
  return (
    <div className={styles.riskStat}>
      <span className={styles.riskStatN} style={color ? { color } : undefined}>{n}{suffix}</span>
      {max && (
        <div className={styles.riskStatBar}>
          <div className={styles.riskStatFill} style={{ width: `${(n / max) * 100}%`, background: color }} />
        </div>
      )}
      <span className={styles.riskStatLabel}>{label}</span>
    </div>
  )
}

function SevPill({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <span className={styles.sevPill} style={{ background: `${color}18`, color, borderColor: `${color}30` }}>
      {n} {label}
    </span>
  )
}

function Shield() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z" fill="url(#sa)"/>
      <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <defs><linearGradient id="sa" x1="3" y1="2" x2="21" y2="23" gradientUnits="userSpaceOnUse"><stop stopColor="#5b8dee"/><stop offset="1" stopColor="#8b5cf6"/></linearGradient></defs>
    </svg>
  )
}

function GH({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  )
}

function Spin() {
  return <span style={{ display:'inline-block', width:14, height:14, border:'2px solid rgba(255,255,255,.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin .7s linear infinite' }} />
}

/* ─── AI Settings Panel ──────────────────────────────────────────────────── */

function AISettingsPanel({ onClose }: { onClose: () => void }) {
  const [provider,    setProvider]    = useState<AIProvider>('gemini')
  const [model,       setModel]       = useState('')
  const [apiKey,      setApiKey]      = useState('')
  const [saving,      setSaving]      = useState(false)
  const [hasKey,      setHasKey]      = useState(false)
  const [curProvider, setCurProvider] = useState<string | null>(null)
  const [curModel,    setCurModel]    = useState<string | null>(null)
  const [testState,   setTestState]   = useState<null | 'testing' | 'ok' | 'warn' | 'error'>(null)
  const [testMsg,     setTestMsg]     = useState('')

  const handleProviderChange = (p: AIProvider) => {
    setProvider(p)
    setModel(DEFAULT_MODELS[p])
    setTestState(null)
  }

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        const p = (d.aiProvider ?? 'gemini') as AIProvider
        setProvider(p)
        setCurProvider(d.aiProvider ?? null)
        setHasKey(!!d.hasApiKey)
        const m = d.aiModel ?? DEFAULT_MODELS[p] ?? ''
        setModel(m)
        setCurModel(d.aiModel ?? null)
      })
      .catch(() => {})
  }, [])

  async function testKey() {
    if (!apiKey) return
    setTestState('testing')
    setTestMsg('')
    try {
      const resp = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey }),
      })
      const data = await resp.json() as any
      if (data.ok) {
        setTestState('ok')
        setTestMsg('API key is valid and working')
      } else if (data.warning) {
        setTestState('warn')
        setTestMsg(data.error ?? 'Key accepted but has quota/billing issues')
      } else {
        setTestState('error')
        setTestMsg(data.error ?? 'Invalid API key')
      }
    } catch {
      setTestState('error')
      setTestMsg('Could not reach validation endpoint')
    }
  }

  async function save() {
    if (!apiKey && curProvider === provider && curModel === model) return
    setSaving(true)
    setTestState('testing')
    setTestMsg('')

    // If a new key was provided, test it first
    if (apiKey) {
      try {
        const testResp = await fetch('/api/settings/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, apiKey }),
        })
        const testData = await testResp.json() as any
        if (!testData.ok && !testData.warning) {
          setTestState('error')
          setTestMsg(testData.error ?? 'Invalid API key')
          setSaving(false)
          return
        }
        if (testData.warning) {
          setTestState('warn')
          setTestMsg('Key accepted · ' + (testData.error ?? 'quota/billing issue'))
        }
      } catch {
        setTestState('error')
        setTestMsg('Could not reach validation endpoint')
        setSaving(false)
        return
      }
    }

    // Save to DB
    try {
      const resp = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiProvider: provider,
          aiApiKey:   apiKey || undefined,
          aiModel:    model,
        }),
      })
      if (resp.ok) {
        if (apiKey) { setHasKey(true); setTestState('ok'); setTestMsg('API key verified and saved') }
        else { setTestState('ok'); setTestMsg('Settings saved') }
        setCurProvider(provider)
        setCurModel(model)
        setApiKey('')
        setTimeout(() => setTestState(null), 4000)
      } else {
        const d = await resp.json().catch(() => ({})) as any
        setTestState('error')
        setTestMsg(d.error ?? 'Failed to save')
      }
    } finally {
      setSaving(false)
    }
  }

  async function removeKey() {
    setSaving(true)
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiProvider: provider, aiApiKey: null }),
      })
      setHasKey(false)
      setCurProvider(null)
      setCurModel(null)
      setTestState('ok')
      setTestMsg('API key removed')
      setTimeout(() => setTestState(null), 3000)
    } finally { setSaving(false) }
  }

  const currentProviderInfo = PROVIDERS.find(p => p.id === provider)
  const currentModels       = MODELS[provider] ?? []
  const activeModelName     = currentModels.find(m => m.id === curModel)?.name

  return (
    <div className={styles.settingsPanel}>
      <div className={styles.settingsHeader}>
        <div className={styles.settingsHeaderLeft}>
          <span className={styles.settingsIcon}>⚙</span>
          <div>
            <h3 className={styles.settingsTitle}>AI Settings</h3>
            <p className={styles.settingsSubtitle}>
              Choose your AI provider and model for auto-fix suggestions.
              {hasKey && curProvider && (
                <span className={styles.settingsActiveBadge}>
                  ✓ {PROVIDERS.find(p => p.id === curProvider)?.name}
                  {activeModelName ? ` · ${activeModelName}` : ''} active
                </span>
              )}
            </p>
          </div>
        </div>
        <button className={styles.settingsClose} onClick={onClose} aria-label="Close settings">✕</button>
      </div>

      {/* Provider tabs */}
      <div className={styles.providerGrid}>
        {PROVIDERS.map(p => (
          <button
            key={p.id}
            className={`${styles.providerBtn} ${provider === p.id ? styles.providerBtnActive : ''}`}
            onClick={() => handleProviderChange(p.id)}
          >
            <span className={styles.providerName}>{p.name}</span>
            {p.free && <span className={styles.providerFree}>Free tier</span>}
          </button>
        ))}
      </div>

      {/* Model select */}
      <div className={styles.settingsField}>
        <label className={styles.settingsLabel}>Model</label>
        <select
          className={styles.settingsSelect}
          value={model}
          onChange={e => setModel(e.target.value)}
        >
          {currentModels.map(m => (
            <option key={m.id} value={m.id}>
              {m.name}{m.free ? ' (free)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* API Key input */}
      <div className={styles.settingsField}>
        <label className={styles.settingsLabel}>
          {currentProviderInfo?.name} API Key
          {' · '}
          <a href={currentProviderInfo?.url} target="_blank" rel="noopener" className={styles.settingsLink}>
            Get key →
          </a>
        </label>
        <div className={styles.settingsInputRow}>
          <input
            className={styles.settingsInput}
            type="password"
            placeholder={
              hasKey && curProvider === provider
                ? '••••••••••••••••••••• (key saved)'
                : `${currentProviderInfo?.keyPrefix ?? 'Paste your API key here…'}`
            }
            value={apiKey}
            onChange={e => { setApiKey(e.target.value); setTestState(null) }}
            onKeyDown={e => e.key === 'Enter' && save()}
          />
          <button
            className={styles.settingsTestBtn}
            onClick={testKey}
            disabled={!apiKey || testState === 'testing'}
          >
            {testState === 'testing' ? '⏳' : '🧪'} Test
          </button>
          <button
            className={styles.settingsSaveBtn}
            onClick={save}
            disabled={saving || (!apiKey && curProvider === provider && curModel === model)}
          >
            {saving ? '⏳' : '💾'} Save
          </button>
          {hasKey && curProvider === provider && (
            <button className={styles.settingsRemoveBtn} onClick={removeKey} disabled={saving}>
              Remove
            </button>
          )}
        </div>
        <p className={styles.settingsNote}>{currentProviderInfo?.keyDesc}</p>
      </div>

      {/* Validation result */}
      {testState && (
        <div className={`${styles.testResult} ${
          testState === 'testing' ? styles.testResultTesting :
          testState === 'ok'      ? styles.testResultOk :
          testState === 'warn'    ? styles.testResultWarn :
                                    styles.testResultError
        }`}>
          {testState === 'testing' && <><Spin /> Verifying API key…</>}
          {testState === 'ok'      && <>✓ {testMsg}</>}
          {testState === 'warn'    && <>⚠ {testMsg}</>}
          {testState === 'error'   && <>✗ {testMsg}</>}
        </div>
      )}
    </div>
  )
}
