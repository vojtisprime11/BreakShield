'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import styles from './analyze.module.css'

const INSTALL_URL = 'https://github.com/apps/breakshield-ci'

type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'SAFE'

interface Finding {
  changeType: string
  severity: string
  sourceFile: string
  affectedValue: string
  description: string
  beforeSchema?: string
  afterSchema?: string
  confidence: number
}

interface Risk {
  riskLevel: RiskLevel
  riskScore: number
  breakingCount: number
  totalConsumersAffected: number
}

interface AnalysisResult {
  ok: boolean
  prTitle?: string
  prUrl?: string
  baseBranch?: string
  headBranch?: string
  findings?: Finding[]
  risk?: Risk
  filesAnalyzed?: number
  durationMs?: number
  note?: string
  error?: string
  message?: string
}

const RISK_COLORS: Record<RiskLevel, string> = {
  CRITICAL: '#f43f5e',
  HIGH:     '#f97316',
  MEDIUM:   '#f59e0b',
  LOW:      '#22c55e',
  SAFE:     '#10b981',
}

const RISK_BG: Record<RiskLevel, string> = {
  CRITICAL: 'rgba(244,63,94,0.08)',
  HIGH:     'rgba(249,115,22,0.08)',
  MEDIUM:   'rgba(245,158,11,0.08)',
  LOW:      'rgba(34,197,94,0.08)',
  SAFE:     'rgba(16,185,129,0.08)',
}

const RISK_LABELS: Record<RiskLevel, string> = {
  CRITICAL: '🔴 CRITICAL — Merge blocked',
  HIGH:     '🟠 HIGH — Merge blocked',
  MEDIUM:   '🟡 MEDIUM — Review required',
  LOW:      '🟢 LOW — Minor concerns',
  SAFE:     '✅ SAFE — No breaking changes',
}

const BREAKING_TYPES = new Set([
  'removed_field', 'changed_type', 'removed_endpoint',
  'added_required_field', 'changed_required', 'removed_parameter',
  'removed_interface', 'changed_return_type',
])

const SAMPLE_PRS = [
  { label: '🔴 Breaking: removed field', url: 'https://github.com/vojtisprime11/BreakShield-test/pull/10' },
]

export default function AnalyzePage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const resultRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [result])

  async function analyze(demo = false, customUrl?: string) {
    const prUrl = customUrl ?? url
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(demo ? { demo: true } : { prUrl }),
      })
      const data: AnalysisResult = await resp.json()

      if (!resp.ok || data.error) {
        setError(data.error ?? 'Analysis failed')
      } else {
        setResult(data)
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function copyResult() {
    if (!result) return
    const text = [
      `BreakShield CI Analysis — ${result.prTitle}`,
      `Risk: ${result.risk?.riskLevel} (${result.risk?.riskScore}/100)`,
      `Breaking changes: ${result.risk?.breakingCount ?? 0}`,
      `Files analyzed: ${result.filesAnalyzed}`,
      '',
      ...(result.findings?.filter(f => BREAKING_TYPES.has(f.changeType)).map(f =>
        `• ${f.affectedValue} — ${f.changeType.replace(/_/g, ' ')} (${f.confidence}%)`
      ) ?? []),
      '',
      `Analyzed by BreakShield CI: https://breakshield-ci.vercel.app`,
    ].join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const breakingFindings = result?.findings?.filter(f => BREAKING_TYPES.has(f.changeType)) ?? []
  const safeFindings = result?.findings?.filter(f => !BREAKING_TYPES.has(f.changeType)) ?? []

  return (
    <main className={styles.main}>
      {/* Nav */}
      <nav className={styles.nav}>
        <Link href="/" className={styles.logo}>
          <ShieldIcon />
          BreakShield CI
        </Link>
        <div className={styles.navRight}>
          <Link href="/blog" className={styles.navLink}>Blog</Link>
          <a href={INSTALL_URL} className={styles.navCta} target="_blank" rel="noopener">
            Install free →
          </a>
        </div>
      </nav>

      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.badge}>
            <span className={styles.dot} />
            No login · No install · Works on any public repo
          </div>
          <h1 className={styles.title}>
            Analyze a Pull Request<br />
            <span className={styles.grad}>for breaking changes</span>
          </h1>
          <p className={styles.sub}>
            Paste any public GitHub PR URL and get an instant AST-verified report.
            No GitHub App needed for this demo.
          </p>
        </div>

        {/* Input card */}
        <div className={styles.card}>
          <div className={styles.inputWrap}>
            <div className={styles.inputIcon}>
              <GithubIcon />
            </div>
            <input
              className={styles.input}
              type="url"
              placeholder="https://github.com/owner/repo/pull/123"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && url && analyze()}
              disabled={loading}
              autoFocus
            />
            <button
              className={styles.btnAnalyze}
              onClick={() => analyze()}
              disabled={loading || !url}
            >
              {loading && !result ? <Spinner /> : 'Analyze →'}
            </button>
          </div>

          {/* Sample PRs */}
          <div className={styles.samples}>
            <span className={styles.samplesLabel}>Try a sample:</span>
            {SAMPLE_PRS.map(s => (
              <button
                key={s.url}
                className={styles.sampleBtn}
                onClick={() => { setUrl(s.url); analyze(false, s.url) }}
                disabled={loading}
              >
                {s.label}
              </button>
            ))}
            <button
              className={styles.sampleBtn}
              onClick={() => analyze(true)}
              disabled={loading}
            >
              ⚡ Live demo
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className={styles.errorBox}>
            <span>⚠</span>
            <div>
              <strong>Analysis failed</strong>
              <div>{error}</div>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className={styles.loadingCard}>
            <div className={styles.loadingBar} />
            <div className={styles.loadingSteps}>
              {[
                'Fetching PR files from GitHub…',
                'Parsing TypeScript AST…',
                'Diffing interfaces and types…',
                'Calculating risk score…',
              ].map((step, i) => (
                <div key={i} className={styles.loadingStep} style={{ animationDelay: `${i * 0.4}s` }}>
                  <span className={styles.loadingDot} style={{ animationDelay: `${i * 0.4}s` }} />
                  {step}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <div className={styles.result} ref={resultRef}>

            {/* PR header */}
            <div className={styles.resultHeader}>
              <div className={styles.resultLeft}>
                <a href={result.prUrl} target="_blank" rel="noopener" className={styles.resultPrTitle}>
                  ↗ {result.prTitle}
                </a>
                <div className={styles.resultBranch}>
                  <code>{result.baseBranch}</code>
                  <span>←</span>
                  <code>{result.headBranch}</code>
                </div>
              </div>
              <button className={styles.copyBtn} onClick={copyResult}>
                {copied ? '✓ Copied' : '⧉ Copy report'}
              </button>
            </div>

            {/* Risk card */}
            {result.risk && (
              <div
                className={styles.riskCard}
                style={{
                  background: RISK_BG[result.risk.riskLevel],
                  borderColor: RISK_COLORS[result.risk.riskLevel],
                }}
              >
                <div className={styles.riskMain}>
                  <div className={styles.riskLabel} style={{ color: RISK_COLORS[result.risk.riskLevel] }}>
                    {RISK_LABELS[result.risk.riskLevel]}
                  </div>
                  <div className={styles.riskScore}>
                    <div className={styles.riskScoreBar}>
                      <div
                        className={styles.riskScoreFill}
                        style={{
                          width: `${result.risk.riskScore}%`,
                          background: RISK_COLORS[result.risk.riskLevel],
                        }}
                      />
                    </div>
                    <span>{result.risk.riskScore}/100</span>
                  </div>
                </div>
                <div className={styles.riskMeta}>
                  <span>{result.risk.breakingCount} breaking change{result.risk.breakingCount !== 1 ? 's' : ''}</span>
                  <span>·</span>
                  <span>{result.filesAnalyzed} file{result.filesAnalyzed !== 1 ? 's' : ''} analyzed</span>
                  <span>·</span>
                  <span>{result.durationMs}ms</span>
                </div>
              </div>
            )}

            {/* No findings */}
            {result.message && (
              <div className={styles.noFindings}>
                <span>✅</span>
                <div>
                  <strong>No breaking changes found</strong>
                  <div>{result.message}</div>
                </div>
              </div>
            )}

            {/* Breaking findings */}
            {breakingFindings.length > 0 && (
              <div className={styles.findingsSection}>
                <div className={styles.findingsSectionHeader}>
                  <span className={styles.findingsBadge} style={{ background: 'rgba(244,63,94,0.1)', color: '#f43f5e' }}>
                    ⚠ {breakingFindings.length} Breaking Change{breakingFindings.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {breakingFindings.map((f, i) => (
                  <div key={i} className={styles.finding}>
                    <div className={styles.findingHeader}>
                      <code className={styles.findingValue}>{f.affectedValue}</code>
                      <span className={styles.findingTypeBadge}>{f.changeType.replace(/_/g, ' ')}</span>
                      <span className={styles.findingConf} style={{ color: f.confidence >= 80 ? '#10b981' : '#f59e0b' }}>
                        {f.confidence}% {f.confidence >= 80 ? 'AST-verified' : 'probable'}
                      </span>
                    </div>
                    <div className={styles.findingDesc}>{f.description}</div>
                    <div className={styles.findingFile}>
                      <span>📄</span> {f.sourceFile}
                    </div>
                    {(f.beforeSchema || f.afterSchema) && (
                      <div className={styles.findingDiff}>
                        {f.beforeSchema && (
                          <div className={styles.diffRow}>
                            <span className={styles.diffLabel} style={{ color: '#f43f5e' }}>Before</span>
                            <code className={styles.diffCode} style={{ borderColor: 'rgba(244,63,94,0.3)', background: 'rgba(244,63,94,0.05)' }}>
                              {f.beforeSchema}
                            </code>
                          </div>
                        )}
                        {f.afterSchema && (
                          <div className={styles.diffRow}>
                            <span className={styles.diffLabel} style={{ color: '#10b981' }}>After</span>
                            <code className={styles.diffCode} style={{ borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.05)' }}>
                              {f.afterSchema}
                            </code>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Safe findings */}
            {safeFindings.length > 0 && (
              <details className={styles.safeDetails}>
                <summary className={styles.safeSummary}>
                  <span className={styles.findingsBadge} style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                    ✓ {safeFindings.length} safe additive change{safeFindings.length !== 1 ? 's' : ''}
                  </span>
                  <span className={styles.safeExpand}>Click to expand</span>
                </summary>
                <div className={styles.safeList}>
                  {safeFindings.map((f, i) => (
                    <div key={i} className={styles.safeFinding}>
                      <code>{f.affectedValue}</code>
                      <span>{f.description}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Consumer evidence upsell */}
            <div className={styles.upsell}>
              <div className={styles.upsellIcon}>🔍</div>
              <div className={styles.upsellText}>
                <strong>Want to see which files use the changed API?</strong>
                <p>
                  Install BreakShield CI to get AST-verified consumer evidence —
                  exact file paths and line numbers of every place that will break.
                  Also adds automatic Check Runs on every PR.
                </p>
              </div>
              <a href={INSTALL_URL} className={styles.upsellBtn} target="_blank" rel="noopener">
                Install free →
              </a>
            </div>

            {/* Share */}
            <div className={styles.shareRow}>
              <span className={styles.shareLabel}>Share this analysis:</span>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Just analyzed a PR with BreakShield CI — ${result.risk?.riskLevel} risk, ${result.risk?.breakingCount} breaking changes\n\nTry it free: https://breakshield-ci.vercel.app/analyze`)}`}
                target="_blank" rel="noopener"
                className={styles.shareBtn}
              >
                Share on X
              </a>
              <button className={styles.shareBtn} onClick={copyResult}>
                {copied ? '✓ Copied' : 'Copy report'}
              </button>
            </div>
          </div>
        )}

        {/* Empty state — how it works */}
        {!result && !loading && !error && (
          <div className={styles.emptyState}>
            <div className={styles.emptyGrid}>
              {[
                { icon: '🔬', title: 'AST analysis', desc: 'Full TypeScript compiler — not regex. Understands your actual code structure.' },
                { icon: '⚡', title: 'Instant results', desc: 'Results in under 5 seconds. No waiting, no queues.' },
                { icon: '🎯', title: 'Confidence scoring', desc: 'Every finding is scored 0–100. Low-confidence noise is filtered automatically.' },
                { icon: '📋', title: 'TypeScript + OpenAPI', desc: 'Interfaces, type aliases, functions, REST endpoints, request/response schemas.' },
              ].map(f => (
                <div key={f.title} className={styles.emptyCard}>
                  <div className={styles.emptyIcon}>{f.icon}</div>
                  <div className={styles.emptyTitle}>{f.title}</div>
                  <div className={styles.emptyDesc}>{f.desc}</div>
                </div>
              ))}
            </div>

            <div className={styles.limitNote}>
              <span>ℹ</span>
              <div>
                This demo works on <strong>public repositories</strong> only and doesn&apos;t include consumer evidence.
                For full analysis on private repos + automatic PR checks,{' '}
                <a href={INSTALL_URL} target="_blank" rel="noopener">install the GitHub App</a>.
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

function ShieldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z" fill="url(#sh3)"/>
      <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <defs>
        <linearGradient id="sh3" x1="3" y1="2" x2="21" y2="23" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5b8dee"/><stop offset="1" stopColor="#8b5cf6"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function GithubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--muted)' }}>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  )
}

function Spinner() {
  return <span className={styles.spinner} />
}
