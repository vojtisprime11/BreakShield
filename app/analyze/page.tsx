'use client'

import { useState } from 'react'
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

const RISK_LABELS: Record<RiskLevel, string> = {
  CRITICAL: '🔴 CRITICAL',
  HIGH:     '🟠 HIGH',
  MEDIUM:   '🟡 MEDIUM',
  LOW:      '🟢 LOW',
  SAFE:     '✅ SAFE',
}

export default function AnalyzePage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState('')

  async function analyze(demo = false) {
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(demo ? { demo: true } : { prUrl: url }),
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

  return (
    <main className={styles.main}>
      {/* Nav */}
      <nav className={styles.nav}>
        <Link href="/" className={styles.logo}>
          <ShieldIcon />
          BreakShield CI
        </Link>
        <a href={INSTALL_URL} className={styles.navCta} target="_blank" rel="noopener">
          Install free →
        </a>
      </nav>

      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.badge}>
            <span className={styles.dot} />
            No login required · Works on public repos
          </div>
          <h1 className={styles.title}>Analyze a Pull Request</h1>
          <p className={styles.sub}>
            Paste a GitHub PR URL and see breaking changes instantly.
            No installation needed.
          </p>
        </div>

        {/* Input */}
        <div className={styles.inputWrap}>
          <input
            className={styles.input}
            type="url"
            placeholder="https://github.com/owner/repo/pull/123"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && url && analyze()}
            disabled={loading}
          />
          <button
            className={styles.btnAnalyze}
            onClick={() => analyze()}
            disabled={loading || !url}
          >
            {loading ? <Spinner /> : 'Analyze →'}
          </button>
        </div>

        {/* Demo button */}
        <div className={styles.demoWrap}>
          <span className={styles.orText}>or</span>
          <button
            className={styles.btnDemo}
            onClick={() => analyze(true)}
            disabled={loading}
          >
            {loading ? 'Analyzing…' : '⚡ Try with a real breaking change demo'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className={styles.errorBox}>
            ⚠ {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className={styles.loadingBox}>
            <div className={styles.loadingDots}>
              <span /><span /><span />
            </div>
            <p>Analyzing TypeScript interfaces and OpenAPI specs…</p>
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <div className={styles.result}>
            {/* PR info */}
            <div className={styles.prInfo}>
              <a href={result.prUrl} target="_blank" rel="noopener" className={styles.prTitle}>
                {result.prTitle}
              </a>
              <span className={styles.prBranch}>
                {result.baseBranch} ← {result.headBranch}
              </span>
            </div>

            {/* Risk badge */}
            {result.risk && (
              <div
                className={styles.riskBadge}
                style={{ borderColor: RISK_COLORS[result.risk.riskLevel], color: RISK_COLORS[result.risk.riskLevel] }}
              >
                <span className={styles.riskLabel}>{RISK_LABELS[result.risk.riskLevel]}</span>
                <span className={styles.riskScore}>Score: {result.risk.riskScore}/100</span>
                {result.risk.breakingCount > 0 && (
                  <span className={styles.riskCount}>{result.risk.breakingCount} breaking change{result.risk.breakingCount !== 1 ? 's' : ''}</span>
                )}
                <span className={styles.riskFiles}>{result.filesAnalyzed} file{result.filesAnalyzed !== 1 ? 's' : ''} analyzed · {result.durationMs}ms</span>
              </div>
            )}

            {/* No findings */}
            {result.message && (
              <div className={styles.noFindings}>
                ✅ {result.message}
              </div>
            )}

            {/* Findings */}
            {result.findings && result.findings.length > 0 && (
              <div className={styles.findings}>
                <div className={styles.findingsHeader}>Breaking Changes</div>
                {result.findings.filter(f => [
                  'removed_field', 'changed_type', 'removed_endpoint',
                  'added_required_field', 'changed_required', 'removed_parameter',
                  'removed_interface', 'changed_return_type',
                ].includes(f.changeType)).map((f, i) => (
                  <div key={i} className={styles.finding}>
                    <div className={styles.findingTop}>
                      <code className={styles.findingValue}>{f.affectedValue}</code>
                      <span className={styles.findingType}>{f.changeType.replace(/_/g, ' ')}</span>
                      <span className={styles.findingConf}>{f.confidence}% confidence</span>
                    </div>
                    <div className={styles.findingDesc}>{f.description}</div>
                    <div className={styles.findingFile}>{f.sourceFile}</div>
                    {(f.beforeSchema || f.afterSchema) && (
                      <div className={styles.findingDiff}>
                        {f.beforeSchema && <span className={styles.diffBefore}>Before: <code>{f.beforeSchema}</code></span>}
                        {f.afterSchema && <span className={styles.diffAfter}>After: <code>{f.afterSchema}</code></span>}
                      </div>
                    )}
                  </div>
                ))}

                {result.findings.filter(f => f.changeType === 'added_optional_field').length > 0 && (
                  <div className={styles.safeFindings}>
                    <span className={styles.safeBadge}>✓ {result.findings.filter(f => f.changeType === 'added_optional_field').length} safe additive change{result.findings.filter(f => f.changeType === 'added_optional_field').length !== 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>
            )}

            {/* Note about consumer evidence */}
            {result.note && (
              <div className={styles.noteBox}>
                <span>💡</span>
                <div>
                  <strong>Want consumer evidence?</strong> {result.note}
                  <div style={{marginTop: 12}}>
                    <a href={INSTALL_URL} className={styles.installBtn} target="_blank" rel="noopener">
                      Install BreakShield CI — it's free →
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* How it works */}
        {!result && !loading && (
          <div className={styles.howItWorks}>
            <div className={styles.howTitle}>How the demo works</div>
            <div className={styles.howSteps}>
              {[
                { n: '1', t: 'Paste a PR URL', d: 'Any public GitHub pull request that changes TypeScript or OpenAPI files.' },
                { n: '2', t: 'AST analysis', d: 'We fetch the before/after file versions and diff them with a full TypeScript AST parser.' },
                { n: '3', t: 'See breaking changes', d: 'Get a report of every breaking change with confidence scores.' },
              ].map(s => (
                <div key={s.n} className={styles.howStep}>
                  <div className={styles.howNum}>{s.n}</div>
                  <div>
                    <div className={styles.howStepTitle}>{s.t}</div>
                    <div className={styles.howStepDesc}>{s.d}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.howNote}>
              For automatic analysis on every PR, install the GitHub App — it also adds consumer evidence and blocks merge on HIGH risk.
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
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z" fill="url(#shg2)"/>
      <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <defs>
        <linearGradient id="shg2" x1="3" y1="2" x2="21" y2="23" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5b8dee"/><stop offset="1" stopColor="#8b5cf6"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function Spinner() {
  return <span className={styles.spinner} />
}
