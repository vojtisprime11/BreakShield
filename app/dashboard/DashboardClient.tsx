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
          <button className={styles.sidebarToggle} onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? '←' : '→'}
          </button>
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
        </div>
      </aside>

      {/* ── Main ── */}
      <main className={styles.main}>
        {/* Top bar */}
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            {selectedRepo ? (
              <>
                <span className={styles.breadcrumb}>
                  <button onClick={() => { setSelectedRepo(null); setPrs([]); setSelectedPr(null) }} className={styles.breadcrumbBtn}>
                    Dashboard
                  </button>
                  <span>/</span>
                  <span>{selectedRepo.owner}</span>
                  <span>/</span>
                  <strong>{selectedRepo.name}</strong>
                  {selectedPr && (
                    <>
                      <span>/</span>
                      <span>PR #{selectedPr.number}</span>
                    </>
                  )}
                </span>
              </>
            ) : (
              <span className={styles.pageTitle}>Dashboard</span>
            )}
          </div>
          <div className={styles.topbarRight}>
            <Link href="/analyze" className={styles.topbarAnalyze}>⚡ Analyze PR</Link>
          </div>
        </header>

        <div className={styles.content}>
          {/* ── No repo selected ── */}
          {!selectedRepo && (
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
          {selectedRepo && !selectedPr && (
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
          {selectedRepo && selectedPr && (
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
                  <p>Push a commit to this PR to trigger analysis, or use the instant analyzer.</p>
                  <Link href={`/analyze?url=${encodeURIComponent(selectedPr.url)}`} className={styles.btnPrimary}>
                    Analyze now →
                  </Link>
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
                        <div key={i} className={styles.findingCard}>
                          <div className={styles.findingCardTop}>
                            <code className={styles.findingAffected}>{f.affected_value}</code>
                            <span className={styles.findingTypeBadge}>{f.change_type.replace(/_/g, ' ')}</span>
                            <span
                              className={styles.findingConfBadge}
                              style={{ color: f.confidence >= 80 ? '#10b981' : '#f59e0b' }}
                            >
                              {f.confidence}% {f.confidence >= 80 ? '· AST-verified' : '· probable'}
                            </span>
                          </div>
                          <p className={styles.findingDesc}>{f.description}</p>
                          <div className={styles.findingFile}>📄 {f.source_file}</div>
                          {(f.before_schema?.text || f.after_schema?.text) && (
                            <div className={styles.findingDiff}>
                              {f.before_schema?.text && (
                                <div className={styles.diffBefore}>
                                  <span>Before</span>
                                  <code>{f.before_schema.text}</code>
                                </div>
                              )}
                              {f.after_schema?.text && (
                                <div className={styles.diffAfter}>
                                  <span>After</span>
                                  <code>{f.after_schema.text}</code>
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
