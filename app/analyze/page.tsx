'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import styles from './analyze.module.css'

const INSTALL_URL  = 'https://github.com/apps/breakshield-ci'
const GITHUB_LOGIN = '/api/auth/login'

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
  baseBranch?: string; headBranch?: string
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
                    <FindingCard key={i} finding={f} withEvidence={!!result.withEvidence} />
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

function FindingCard({ finding: f, withEvidence }: { finding: Finding; withEvidence: boolean }) {
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
