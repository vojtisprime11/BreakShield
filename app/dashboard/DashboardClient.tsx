'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import styles from './dashboard.module.css'

const INSTALL_URL = 'https://github.com/apps/breakshield-ci'

type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'SAFE'

const RISK_COLOR: Record<RiskLevel, string> = {
  CRITICAL: '#f43f5e', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#22c55e', SAFE: '#10b981',
}
const RISK_BG: Record<RiskLevel, string> = {
  CRITICAL: 'rgba(244,63,94,0.12)', HIGH: 'rgba(249,115,22,0.12)',
  MEDIUM: 'rgba(245,158,11,0.12)', LOW: 'rgba(34,197,94,0.12)', SAFE: 'rgba(16,185,129,0.12)',
}
const RISK_ICON: Record<RiskLevel, string> = {
  CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🟢', SAFE: '✅',
}

interface Repo {
  id: number
  fullName: string
  name: string
  owner: string
  private: boolean
  defaultBranch: string
  updatedAt: string
  installationId: number
}

interface PR {
  number: number
  title: string
  state: string
  author: string
  authorAvatar: string
  baseBranch: string
  headBranch: string
  headSha?: string
  url: string
  createdAt: string
  analyzed: boolean
  riskLevel: RiskLevel | null
  riskScore: number | null
  breakingCount: number | null
  consumersAffected: number | null
  analysisStatus: string | null
  durationMs: number | null
  filesAnalyzed: number | null
}

interface Finding {
  change_type: string
  severity: string
  source_file: string
  affected_value: string
  description: string
  before_schema?: any
  after_schema?: any
  confidence: number
  is_breaking: boolean
}

interface User { login: string; name: string; avatarUrl: string }

const BREAKING_TYPES = new Set([
  'removed_field', 'changed_type', 'removed_endpoint',
  'added_required_field', 'changed_required', 'removed_parameter',
  'removed_interface', 'changed_return_type',
])

export default function DashboardClient({ user }: { user: User }) {
  const [repos, setRepos] = useState<Repo[]>([])
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null)
  const [prs, setPrs] = useState<PR[]>([])
  const [selectedPr, setSelectedPr] = useState<PR | null>(null)
  const [findings, setFindings] = useState<Finding[]>([])
  const [risk, setRisk] = useState<any>(null)
  const [loadingRepos, setLoadingRepos] = useState(true)
  const [loadingPrs, setLoadingPrs] = useState(false)
  const [loadingFindings, setLoadingFindings] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [view, setView] = useState<'repos' | 'settings'>('repos')

  // Load repos on mount
  useEffect(() => {
    fetch('/api/dashboard/repos')
      .then(r => r.json())
      .then(d => { setRepos(d.repos ?? []); setLoadingRepos(false) })
      .catch(() => setLoadingRepos(false))
  }, [])

  // Load PRs when repo selected
  const selectRepo = useCallback(async (repo: Repo) => {
    setSelectedRepo(repo)
    setSelectedPr(null)
    setFindings([])
    setRisk(null)
    setLoadingPrs(true)
    try {
      const r = await fetch(`/api/dashboard/prs?repo=${encodeURIComponent(repo.fullName)}`)
      const d = await r.json()
      setPrs(d.prs ?? [])
    } finally {
      setLoadingPrs(false)
    }
  }, [])

  // Load findings when PR selected
  const selectPr = useCallback(async (pr: PR) => {
    setSelectedPr(pr)
    if (!selectedRepo) return
    setLoadingFindings(true)
    try {
      const r = await fetch(`/api/dashboard/findings?repo=${encodeURIComponent(selectedRepo.fullName)}&pr=${pr.number}`)
      const d = await r.json()
      setFindings(d.findings ?? [])
      setRisk(d.risk)
    } finally {
      setLoadingFindings(false)
    }
  }, [selectedRepo])

  const breakingFindings = findings.filter(f => f.is_breaking)
  const safeFindings = findings.filter(f => !f.is_breaking)

  return (
    <div className={styles.layout}>
      {/* ── Sidebar ── */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
        {/* Brand */}
        <div className={styles.brand}>
          <Link href="/" className={styles.brandLogo}>
            <ShieldIcon />
            <span>BreakShield CI</span>
          </Link>
          {selectedRepo ? (
            <button
              className={styles.sidebarToggle}
              onClick={() => { setSelectedRepo(null); setPrs([]); setSelectedPr(null); setFindings([]); setRisk(null); }}
              title="Back to repositories"
            >
              ← Repos
            </button>
          ) : (
            <Link href="/" className={styles.sidebarToggle} title="Go to homepage" style={{textDecoration:'none'}}>
              ← Home
            </Link>
          )}
        </div>

        {/* User */}
        <div className={styles.userCard}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={user.avatarUrl} alt={user.login} className={styles.avatar} />
          <div className={styles.userInfo}>
            <div className={styles.userName}>{user.name}</div>
            <div className={styles.userLogin}>@{user.login}</div>
          </div>
          <a href="/api/auth/logout" className={styles.logoutBtn} title="Sign out">⏻</a>
        </div>

        {/* Nav */}
        <nav className={styles.nav}>
          <div className={styles.navSection}>Repositories</div>
          {loadingRepos ? (
            <div className={styles.navLoading}>
              {[1,2,3].map(i => <div key={i} className={styles.skeleton} />)}
            </div>
          ) : repos.length === 0 ? (
            <div className={styles.navEmpty}>
              <p>No repositories found.</p>
              <a href={INSTALL_URL} target="_blank" rel="noopener" className={styles.installLink}>
                Install BreakShield CI →
              </a>
            </div>
          ) : (
            <div className={styles.repoList}>
              {repos.map(r => (
                <button
                  key={r.id}
                  className={`${styles.repoItem} ${selectedRepo?.id === r.id ? styles.repoItemActive : ''}`}
                  onClick={() => selectRepo(r)}
                >
                  <span className={styles.repoIcon}>{r.private ? '🔒' : '📁'}</span>
                  <span className={styles.repoName}>{r.name}</span>
                </button>
              ))}
            </div>
          )}
        </nav>

        {/* Analyze link */}
        <div className={styles.sidebarFooter}>
          <Link href="/analyze" className={styles.analyzeLink}>
            ⚡ Analyze a PR
          </Link>
          <a href={INSTALL_URL} target="_blank" rel="noopener" className={styles.analyzeLink}>
            + Add repository
          </a>
          <button
            className={`${styles.analyzeLink} ${view === 'settings' ? styles.repoItemActive : ''}`}
            style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
            onClick={() => setView(v => v === 'settings' ? 'repos' : 'settings')}
          >
            ⚙ Settings
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className={styles.main}>
        {/* Top bar */}
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            {selectedRepo ? (
              <span className={styles.breadcrumb}>
                <button onClick={() => { setSelectedRepo(null); setPrs([]); setSelectedPr(null); setFindings([]); setRisk(null); }} className={styles.breadcrumbBtn}>
                  Dashboard
                </button>
                <span>/</span>
                {selectedPr ? (
                  <>
                    <button onClick={() => { setSelectedPr(null); setFindings([]); setRisk(null); }} className={styles.breadcrumbBtn}>
                      {selectedRepo.name}
                    </button>
                    <span>/</span>
                    <strong>PR #{selectedPr.number}</strong>
                  </>
                ) : (
                  <strong>{selectedRepo.name}</strong>
                )}
              </span>
            ) : (
              <span className={styles.pageTitle}>Dashboard</span>
            )}
          </div>
          <div className={styles.topbarRight}>
            <Link href="/analyze" className={styles.topbarAnalyze}>⚡ Analyze PR</Link>
          </div>
        </header>

        <div className={styles.content}>
          {/* ── Settings view ── */}
          {view === 'settings' && (
            <SettingsPanel onClose={() => setView('repos')} />
          )}

          {/* ── No repo selected ── */}
          {view === 'repos' && !selectedRepo && (
            <div className={styles.emptyState}>
              {loadingRepos ? (
                <div className={styles.loadingGrid}>
                  {[1,2,3,4,5,6].map(i => <div key={i} className={styles.skeletonCard} />)}
                </div>
              ) : repos.length === 0 ? (
                <div className={styles.noRepos}>
                  <div className={styles.noReposIcon}>🛡️</div>
                  <h2>No repositories connected</h2>
                  <p>Install BreakShield CI on your GitHub repositories to start monitoring API changes.</p>
                  <a href={INSTALL_URL} target="_blank" rel="noopener" className={styles.btnPrimary}>
                    Install on GitHub →
                  </a>
                </div>
              ) : (
                <>
                  <div className={styles.sectionHeader}>
                    <h2>Your repositories</h2>
                    <p>Select a repository to view pull requests and analysis results.</p>
                  </div>
                  <div className={styles.repoGrid}>
                    {repos.map(r => (
                      <button key={r.id} className={styles.repoCard} onClick={() => selectRepo(r)}>
                        <div className={styles.repoCardTop}>
                          <span className={styles.repoCardIcon}>{r.private ? '🔒' : '📁'}</span>
                          <span className={styles.repoCardPrivate}>{r.private ? 'Private' : 'Public'}</span>
                        </div>
                        <div className={styles.repoCardName}>{r.fullName}</div>
                        <div className={styles.repoCardBranch}>Default: {r.defaultBranch}</div>
                        <div className={styles.repoCardFooter}>
                          <span>Updated {new Date(r.updatedAt).toLocaleDateString()}</span>
                          <span className={styles.repoCardArrow}>→</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Repo selected, no PR ── */}
          {view === 'repos' && selectedRepo && !selectedPr && (
            <div>
              <div className={styles.sectionHeader}>
                <h2>Pull Requests — {selectedRepo.fullName}</h2>
                <p>Click a pull request to view its analysis results.</p>
              </div>
              {loadingPrs ? (
                <div className={styles.prList}>
                  {[1,2,3,4].map(i => <div key={i} className={`${styles.skeleton} ${styles.skeletonPr}`} />)}
                </div>
              ) : prs.length === 0 ? (
                <div className={styles.noPrs}>
                  <p>No pull requests found in this repository.</p>
                </div>
              ) : (
                <div className={styles.prList}>
                  {prs.map(pr => (
                    <button key={pr.number} className={styles.prItem} onClick={() => selectPr(pr)}>
                      <div className={styles.prLeft}>
                        <div className={styles.prTitleRow}>
                          <span className={`${styles.prStateBadge} ${pr.state === 'open' ? styles.prOpen : styles.prClosed}`}>
                            {pr.state === 'open' ? '⬤ Open' : '✓ Merged'}
                          </span>
                          <span className={styles.prTitle}>{pr.title}</span>
                        </div>
                        <div className={styles.prMeta}>
                          <span>#{pr.number}</span>
                          <span>·</span>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={pr.authorAvatar} alt={pr.author} className={styles.authorAvatar} />
                          <span>{pr.author}</span>
                          <span>·</span>
                          <code>{pr.headBranch}</code>
                          <span>→</span>
                          <code>{pr.baseBranch}</code>
                          <span>·</span>
                          <span>{new Date(pr.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className={styles.prRight}>
                        {pr.analyzed && pr.riskLevel ? (
                          <span
                            className={styles.riskPill}
                            style={{ background: RISK_BG[pr.riskLevel], color: RISK_COLOR[pr.riskLevel], borderColor: RISK_COLOR[pr.riskLevel] }}
                          >
                            {RISK_ICON[pr.riskLevel]} {pr.riskLevel}
                            {pr.breakingCount !== null && pr.breakingCount > 0 && (
                              <span className={styles.riskCount}>{pr.breakingCount}</span>
                            )}
                          </span>
                        ) : pr.analysisStatus === 'running' ? (
                          <span className={styles.analyzingPill}>⏳ Analyzing…</span>
                        ) : (
                          <span className={styles.notAnalyzedPill}>Not analyzed</span>
                        )}
                        <span className={styles.prArrow}>→</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── PR selected — findings ── */}
          {view === 'repos' && selectedRepo && selectedPr && (
            <div>
              {/* PR header */}
              <div className={styles.prDetailHeader}>
                <div className={styles.prDetailTop}>
                  <a href={selectedPr.url} target="_blank" rel="noopener" className={styles.prDetailTitle}>
                    ↗ {selectedPr.title}
                  </a>
                  <span className={`${styles.prStateBadge} ${selectedPr.state === 'open' ? styles.prOpen : styles.prClosed}`}>
                    {selectedPr.state === 'open' ? '⬤ Open' : '✓ Closed'}
                  </span>
                </div>
                <div className={styles.prDetailMeta}>
                  <span>#{selectedPr.number}</span>
                  <span>·</span>
                  <span>{selectedPr.author}</span>
                  <span>·</span>
                  <code>{selectedPr.headBranch}</code>
                  <span>→</span>
                  <code>{selectedPr.baseBranch}</code>
                  {selectedPr.filesAnalyzed !== null && (
                    <>
                      <span>·</span>
                      <span>{selectedPr.filesAnalyzed} files analyzed</span>
                    </>
                  )}
                  {selectedPr.durationMs !== null && (
                    <>
                      <span>·</span>
                      <span>{selectedPr.durationMs}ms</span>
                    </>
                  )}
                </div>
              </div>

              {loadingFindings ? (
                <div className={styles.findingsLoading}>
                  {[1,2,3].map(i => <div key={i} className={`${styles.skeleton} ${styles.skeletonFinding}`} />)}
                </div>
              ) : !selectedPr.analyzed ? (
                <div className={styles.notAnalyzed}>
                  <div className={styles.notAnalyzedIcon}>🔍</div>
                  <h3>Not analyzed yet</h3>
                  <p>Push a commit to trigger automatic analysis, or click below to analyze now.</p>
                  <AnalyzeNowButton
                    owner={selectedRepo.owner}
                    repo={selectedRepo.name}
                    prNumber={selectedPr.number}
                    prUrl={selectedPr.url}
                    onDone={(r) => {
                      setSelectedPr({ ...selectedPr, analyzed: true, riskLevel: r.risk?.riskLevel ?? null, riskScore: r.risk?.riskScore ?? null, breakingCount: r.risk?.breakingCount ?? null, consumersAffected: r.risk?.totalConsumersAffected ?? null, analysisStatus: 'completed', durationMs: r.durationMs ?? null, filesAnalyzed: r.filesAnalyzed ?? null })
                      setFindings(r.findings?.map((f: any) => ({
                        change_type: f.changeType,
                        severity: f.severity,
                        source_file: f.sourceFile,
                        affected_value: f.affectedValue,
                        description: f.description,
                        before_schema: f.beforeSchema ? { text: f.beforeSchema } : null,
                        after_schema: f.afterSchema ? { text: f.afterSchema } : null,
                        confidence: f.confidence,
                        is_breaking: ['removed_field','changed_type','removed_endpoint','added_required_field','changed_required','removed_parameter','removed_interface','changed_return_type'].includes(f.changeType),
                      })) ?? [])
                      setRisk(r.risk ? {
                        risk_level: r.risk.riskLevel,
                        risk_score: r.risk.riskScore,
                        breaking_count: r.risk.breakingCount,
                        total_consumers_affected: r.risk.totalConsumersAffected,
                        max_confidence: r.risk.maxConfidence,
                        summary: r.risk.summary,
                      } : null)
                    }}
                  />
                </div>
              ) : (
                <>
                  {/* Risk summary */}
                  {risk && (
                    <div
                      className={styles.riskSummary}
                      style={{ borderColor: RISK_COLOR[risk.risk_level as RiskLevel], background: RISK_BG[risk.risk_level as RiskLevel] }}
                    >
                      <div className={styles.riskSummaryMain}>
                        <span className={styles.riskSummaryLevel} style={{ color: RISK_COLOR[risk.risk_level as RiskLevel] }}>
                          {RISK_ICON[risk.risk_level as RiskLevel]} {risk.risk_level}
                        </span>
                        <div className={styles.riskSummaryStats}>
                          <div className={styles.riskStat}>
                            <span className={styles.riskStatN}>{risk.risk_score}</span>
                            <span className={styles.riskStatL}>Risk score</span>
                          </div>
                          <div className={styles.riskStat}>
                            <span className={styles.riskStatN}>{risk.breaking_count}</span>
                            <span className={styles.riskStatL}>Breaking</span>
                          </div>
                          <div className={styles.riskStat}>
                            <span className={styles.riskStatN}>{risk.total_consumers_affected}</span>
                            <span className={styles.riskStatL}>Consumers</span>
                          </div>
                          <div className={styles.riskStat}>
                            <span className={styles.riskStatN}>{risk.max_confidence}%</span>
                            <span className={styles.riskStatL}>Confidence</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* No findings */}
                  {findings.length === 0 && (
                    <div className={styles.noFindings}>
                      <span>✅</span>
                      <div>
                        <strong>No breaking changes detected</strong>
                        <p>This PR is safe to merge from an API contract perspective.</p>
                      </div>
                    </div>
                  )}

                  {/* Breaking findings */}
                  {breakingFindings.length > 0 && (
                    <div className={styles.findingsSection}>
                      <div className={styles.findingsSectionTitle}>
                        <span className={styles.breakingBadge}>⚠ {breakingFindings.length} Breaking Change{breakingFindings.length !== 1 ? 's' : ''}</span>
                      </div>
                      {breakingFindings.map((f, i) => (
                        <DashFindingCard
                          key={i}
                          finding={f}
                          owner={selectedRepo.owner}
                          repo={selectedRepo.name}
                          baseBranch={selectedRepo.defaultBranch}
                          prNumber={selectedPr.number}
                          headSha={selectedPr.headSha ?? ''}
                          installationId={selectedRepo.installationId}
                        />
                      ))}
                    </div>
                  )}

                  {/* Safe findings */}
                  {safeFindings.length > 0 && (
                    <details className={styles.safeSection}>
                      <summary className={styles.safeSummary}>
                        <span className={styles.safeBadge}>✓ {safeFindings.length} safe additive change{safeFindings.length !== 1 ? 's' : ''}</span>
                        <span className={styles.safeToggle}>expand</span>
                      </summary>
                      <div className={styles.safeList}>
                        {safeFindings.map((f, i) => (
                          <div key={i} className={styles.safeFinding}>
                            <code>{f.affected_value}</code>
                            <span>{f.description}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z" fill="url(#shd)"/>
      <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <defs><linearGradient id="shd" x1="3" y1="2" x2="21" y2="23" gradientUnits="userSpaceOnUse"><stop stopColor="#5b8dee"/><stop offset="1" stopColor="#8b5cf6"/></linearGradient></defs>
    </svg>
  )
}

function AnalyzeNowButton({ owner, repo, prNumber, prUrl, onDone }: {
  owner: string; repo: string; prNumber: number; prUrl: string;
  onDone: (result: any) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  async function run() {
    setLoading(true); setError('')
    try {
      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo, prNumber }),
      })
      const data = await resp.json()
      if (!resp.ok || data.error) {
        setError(data.error ?? 'Analysis failed')
      } else {
        onDone(data)
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button className={styles.btnPrimary} onClick={run} disabled={loading}>
        {loading ? '⏳ Analyzing…' : '⚡ Analyze now'}
      </button>
      {error && <p style={{color:'#f43f5e',fontSize:'13px',marginTop:'10px'}}>{error}</p>}
      <p style={{fontSize:'13px',color:'var(--muted2)',marginTop:'10px'}}>
        Or <a href={prUrl} target="_blank" rel="noopener" style={{color:'var(--accent)'}}>push a commit</a> to trigger automatic analysis.
      </p>
    </div>
  )
}

function DashFindingCard({ finding: f, owner, repo, baseBranch, prNumber, headSha, installationId }: {
  finding: Finding
  owner: string; repo: string; baseBranch: string; prNumber: number; headSha: string; installationId?: number
}) {
  const [fixing, setFixing] = useState(false)
  const [fixPr,  setFixPr]  = useState<{ url: string; number: number } | null>(null)
  const [fixErr, setFixErr] = useState('')

  async function suggestFix() {
    setFixing(true); setFixErr(''); setFixPr(null)
    try {
      const resp = await fetch('/api/autofix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner, repo, baseBranch, prNumber,
          filePath: f.source_file,
          headSha,
          installationId,
          finding: {
            changeType:    f.change_type,
            affectedValue: f.affected_value,
            description:   f.description,
            beforeSchema:  f.before_schema?.text,
            afterSchema:   f.after_schema?.text,
          },
        }),
      })
      const data = await resp.json()
      if (!resp.ok || data.error) setFixErr(data.error ?? 'Fix failed')
      else setFixPr({ url: data.prUrl, number: data.prNumber })
    } catch { setFixErr('Network error') }
    finally { setFixing(false) }
  }

  return (
    <div className={styles.findingCard}>
      <div className={styles.findingCardTop}>
        <code className={styles.findingAffected}>{f.affected_value}</code>
        <span className={styles.findingTypeBadge}>{f.change_type.replace(/_/g, ' ')}</span>
        <span className={styles.findingConfBadge} style={{ color: f.confidence >= 80 ? '#10b981' : '#f59e0b' }}>
          {f.confidence}% {f.confidence >= 80 ? '· AST-verified' : '· probable'}
        </span>
      </div>
      <p className={styles.findingDesc}>{f.description}</p>
      <div className={styles.findingFile}>📄 {f.source_file}</div>
      {(f.before_schema?.text || f.after_schema?.text) && (
        <div className={styles.findingDiff}>
          {f.before_schema?.text && <div className={styles.diffBefore}><span>Before</span><code>{f.before_schema.text}</code></div>}
          {f.after_schema?.text  && <div className={styles.diffAfter}><span>After</span><code>{f.after_schema.text}</code></div>}
        </div>
      )}
      {/* Auto-fix */}
      <div className={styles.autofixRow}>
        {fixPr ? (
          <a href={fixPr.url} target="_blank" rel="noopener" className={styles.autofixSuccess}>
            ✓ Fix PR #{fixPr.number} created — Review &amp; merge →
          </a>
        ) : (
          <>
            <button className={styles.autofixBtn} onClick={suggestFix} disabled={fixing}>
              {fixing ? '⏳ Generating fix…' : '✨ Suggest fix with AI'}
            </button>
            {fixErr && <span className={styles.autofixErr}>{fixErr}</span>}
          </>
        )}
      </div>
    </div>
  )
}

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [provider,    setProvider]    = useState('gemini')
  const [model,       setModel]       = useState('')
  const [apiKey,      setApiKey]      = useState('')
  const [saving,      setSaving]      = useState(false)
  const [hasKey,      setHasKey]      = useState(false)
  const [curProvider, setCurProvider] = useState<string | null>(null)
  const [curModel,    setCurModel]    = useState<string | null>(null)
  // validation result: null = idle, 'testing' = in progress, 'ok' = valid, 'warn' = rate-limited but valid, 'error' = invalid
  const [testState,   setTestState]   = useState<null | 'testing' | 'ok' | 'warn' | 'error'>(null)
  const [testMsg,     setTestMsg]     = useState('')

  const PROVIDERS = [
    {
      id: 'gemini',
      name: 'Google Gemini',
      free: true,
      url: 'https://aistudio.google.com/apikey',
      keyPrefix: 'AIza…',
      keyDesc: 'Google AI Studio API key — works with all Gemini models. Free tier gives 1,500 req/day.',
    },
    {
      id: 'openai',
      name: 'OpenAI',
      free: false,
      url: 'https://platform.openai.com/api-keys',
      keyPrefix: 'sk-…',
      keyDesc: 'OpenAI platform API key — works with GPT-5.x, GPT-4o, o3, o4-mini and all other OpenAI models.',
    },
    {
      id: 'anthropic',
      name: 'Anthropic Claude',
      free: false,
      url: 'https://console.anthropic.com/settings/keys',
      keyPrefix: 'sk-ant-…',
      keyDesc: 'Anthropic API key — works with all Claude models (Opus, Sonnet, Haiku).',
    },
    {
      id: 'groq',
      name: 'Groq',
      free: true,
      url: 'https://console.groq.com/keys',
      keyPrefix: 'gsk_…',
      keyDesc: 'GroqCloud API key — works with all Groq-hosted models (Llama, Qwen, GPT-OSS). Free tier available.',
    },
    {
      id: 'perplexity',
      name: 'Perplexity',
      free: false,
      url: 'https://www.perplexity.ai/settings/api',
      keyPrefix: 'pplx-…',
      keyDesc: 'Perplexity API key — works with Sonar, Sonar Pro, Sonar Reasoning Pro and Sonar Deep Research.',
    },
  ] as const

  type ProviderId = typeof PROVIDERS[number]['id']

  const MODELS: Record<ProviderId, { id: string; name: string; free?: boolean }[]> = {
    // Source: https://ai.google.dev/gemini-api/docs/models (June 2026)
    gemini: [
      { id: 'gemini-3.5-flash',       name: 'Gemini 3.5 Flash',         free: true },
      { id: 'gemini-3.1-flash-lite',  name: 'Gemini 3.1 Flash-Lite',    free: true },
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (preview)',  free: true },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (preview)' },
      { id: 'gemini-2.5-pro',         name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash',       name: 'Gemini 2.5 Flash',         free: true },
      { id: 'gemini-2.5-flash-lite',  name: 'Gemini 2.5 Flash-Lite',    free: true },
    ],
    // Source: https://platform.openai.com/docs/models (June 2026)
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
    // Source: https://docs.anthropic.com/en/docs/about-claude/models/all-models (June 2026)
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
    // Source: https://console.groq.com/docs/models (June 2026)
    groq: [
      { id: 'openai/gpt-oss-120b',                       name: 'OpenAI GPT-OSS 120B',  free: true },
      { id: 'openai/gpt-oss-20b',                        name: 'OpenAI GPT-OSS 20B',   free: true },
      { id: 'llama-3.3-70b-versatile',                   name: 'Llama 3.3 70B',         free: true },
      { id: 'llama-3.1-8b-instant',                      name: 'Llama 3.1 8B Instant',  free: true },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B',    free: true },
      { id: 'qwen/qwen3-32b',                            name: 'Qwen3 32B',             free: true },
    ],
    // Source: https://docs.perplexity.ai/docs/sonar/models (June 2026)
    perplexity: [
      { id: 'sonar-deep-research', name: 'Sonar Deep Research' },
      { id: 'sonar-pro',           name: 'Sonar Pro' },
      { id: 'sonar-reasoning-pro', name: 'Sonar Reasoning Pro' },
      { id: 'sonar',               name: 'Sonar' },
    ],
  }

  const DEFAULT_MODELS: Record<ProviderId, string> = {
    gemini:     'gemini-2.5-flash',
    openai:     'gpt-5.4-mini',
    anthropic:  'claude-haiku-4-5',
    groq:       'llama-3.3-70b-versatile',
    perplexity: 'sonar',
  }

  // When provider changes, reset model to default for that provider
  const handleProviderChange = (p: string) => {
    setProvider(p)
    setModel(DEFAULT_MODELS[p as ProviderId] ?? '')
  }

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        const p = d.aiProvider ?? 'gemini'
        setProvider(p)
        setCurProvider(d.aiProvider ?? null)
        setHasKey(!!d.hasApiKey)
        const m = d.aiModel ?? DEFAULT_MODELS[p as ProviderId] ?? ''
        setModel(m)
        setCurModel(d.aiModel ?? null)
      })
      .catch(() => {})
  }, [])

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
          setTimeout(() => setTestState(null), 5000)
          return
        }
        if (testData.warning) {
          setTestState('warn')
          setTestMsg('Key accepted · ' + (testData.error ?? 'quota/billing issue on your account'))
        }
      } catch {
        setTestState('error')
        setTestMsg('Could not reach validation endpoint')
        setSaving(false)
        setTimeout(() => setTestState(null), 5000)
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
        setTimeout(() => setTestState(null), 5000)
      }
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    setSaving(true)
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiProvider: provider, aiApiKey: null }),
      })
      setHasKey(false); setCurProvider(null); setCurModel(null)
    } finally { setSaving(false) }
  }

  const currentProviderInfo = PROVIDERS.find(p => p.id === provider)
  const currentModels       = MODELS[provider as ProviderId] ?? []
  const activeModelName     = currentModels.find(m => m.id === curModel)?.name

  return (
    <div>
      {/* Back button */}
      <div style={{ marginBottom: 24 }}>
        <button onClick={onClose} className={styles.backBtn}>
          ← Back to Dashboard
        </button>
      </div>

      <div className={styles.sectionHeader}>
        <h2>Settings</h2>
        <p>Configure your AI provider for auto-fix.</p>
      </div>

      {/* AI Provider + Model selection */}
      <div className={styles.settingsCard}>
        <div className={styles.settingsCardHeader}>
          <div>
            <h3 className={styles.settingsCardTitle}>AI Provider</h3>
            <p className={styles.settingsCardDesc}>
              Choose which AI model generates your code fixes.
              {hasKey && curProvider && (
                <span className={styles.settingsActiveBadge} style={{ marginLeft: 10 }}>
                  ✓ {PROVIDERS.find(p => p.id === curProvider)?.name}
                  {activeModelName ? ` · ${activeModelName}` : ''} active
                </span>
              )}
            </p>
          </div>
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
        <div style={{ marginTop: 16 }}>
          <div className={styles.settingsLabel} style={{ marginBottom: 8 }}>Model</div>
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
        <div style={{ marginTop: 16 }}>
          <div className={styles.settingsLabel}>
            {currentProviderInfo?.name} API Key
            {' · '}
            <a href={currentProviderInfo?.url} target="_blank" rel="noopener" className={styles.settingsLink}>
              Get key →
            </a>
          </div>
          <div className={styles.settingsInputRow} style={{ marginTop: 8 }}>
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
              className={styles.settingsSaveBtn}
              onClick={save}
              disabled={saving || (!apiKey && curProvider === provider && curModel === model)}
            >
              {saving ? '⏳ Saving…' : 'Save'}
            </button>
            {hasKey && curProvider === provider && (
              <button className={styles.settingsRemoveBtn} onClick={remove} disabled={saving}>
                Remove
              </button>
            )}
          </div>

          {/* Validation result */}
          {testState && (
            <div className={`${styles.testResult} ${
              testState === 'testing' ? styles.testResultTesting :
              testState === 'ok'      ? styles.testResultOk :
              testState === 'warn'    ? styles.testResultWarn :
                                        styles.testResultError
            }`}>
              {testState === 'testing' && <><span className={styles.testSpinner} />Verifying API key…</>}
              {testState === 'ok'      && <>✓ {testMsg}</>}
              {testState === 'warn'    && <>⚠ {testMsg}</>}
              {testState === 'error'   && <>✗ {testMsg}</>}
            </div>
          )}

          <p className={styles.settingsNote}>{currentProviderInfo?.keyDesc}</p>
        </div>
      </div>

      {/* How auto-fix works */}
      <div className={styles.settingsCard} style={{ marginTop: 16 }}>
        <h3 className={styles.settingsCardTitle}>How AI Auto-fix Works</h3>
        <div className={styles.settingsSteps}>
          {[
            { n: '1', t: 'BreakShield detects a breaking change', d: 'AST analysis finds removed fields, changed types, or deleted endpoints.' },
            { n: '2', t: 'Click "Suggest fix with AI"',           d: 'The affected file is sent to your AI provider with context about what changed.' },
            { n: '3', t: 'AI generates a fix',                    d: 'The model rewrites only the affected code while preserving all existing logic.' },
            { n: '4', t: 'Review & merge',                        d: 'A new PR is created with the fix. You review and merge — no blind auto-merging.' },
          ].map(s => (
            <div key={s.n} className={styles.settingsStep}>
              <div className={styles.settingsStepNum}>{s.n}</div>
              <div>
                <strong>{s.t}</strong>
                <p>{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
