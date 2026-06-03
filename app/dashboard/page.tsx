'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import styles from './dashboard.module.css'

const INSTALL_URL = 'https://github.com/apps/breakshield-ci'

type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'SAFE'

const RISK_COLOR: Record<RiskLevel, string> = {
  CRITICAL: '#f43f5e', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#22c55e', SAFE: '#10b981',
}
const RISK_LABEL: Record<RiskLevel, string> = {
  CRITICAL: '🔴 CRITICAL', HIGH: '🟠 HIGH', MEDIUM: '🟡 MEDIUM', LOW: '🟢 LOW', SAFE: '✅ SAFE',
}

interface User { login: string; name: string; avatarUrl: string }
interface Repo { fullName: string; name: string; owner: string; private: boolean; updatedAt: string }
interface PR {
  number: number; title: string; state: string; author: string; authorAvatar: string
  baseBranch: string; headBranch: string; url: string; createdAt: string
  analyzed: boolean; riskLevel: RiskLevel | null; riskScore: number | null
  breakingCount: number | null; analysisStatus: string | null; durationMs: number | null
}
interface Finding {
  change_type: string; severity: string; source_file: string
  affected_value: string; description: string; confidence: number
  before_schema?: any; after_schema?: any; is_breaking: boolean
}

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [repos, setRepos] = useState<Repo[]>([])
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)
  const [prs, setPrs] = useState<PR[]>([])
  const [prsLoading, setPrsLoading] = useState(false)
  const [selectedPR, setSelectedPR] = useState<PR | null>(null)
  const [findings, setFindings] = useState<Finding[]>([])
  const [risk, setRisk] = useState<any>(null)
  const [findingsLoading, setFindingsLoading] = useState(false)
  const [reposLoading, setReposLoading] = useState(false)

  // Load user
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => {
        setUser(d.user)
        setLoading(false)
        if (d.user) loadRepos()
      })
  }, [])

  const loadRepos = useCallback(async () => {
    setReposLoading(true)
    try {
      const r = await fetch('/api/dashboard/repos')
      const d = await r.json()
      setRepos(d.repos ?? [])
      if (d.repos?.length > 0) {
        setSelectedRepo(d.repos[0].fullName)
      }
    } finally {
      setReposLoading(false)
    }
  }, [])

  // Load PRs when repo selected
  useEffect(() => {
    if (!selectedRepo) return
    setPrsLoading(true)
    setSelectedPR(null)
    setFindings([])
    fetch(`/api/dashboard/prs?repo=${encodeURIComponent(selectedRepo)}`)
      .then(r => r.json())
      .then(d => { setPrs(d.prs ?? []); setPrsLoading(false) })
  }, [selectedRepo])

  // Load findings when PR selected
  useEffect(() => {
    if (!selectedPR || !selectedRepo) return
    setFindingsLoading(true)
    fetch(`/api/dashboard/findings?repo=${encodeURIComponent(selectedRepo)}&pr=${selectedPR.number}`)
      .then(r => r.json())
      .then(d => { setFindings(d.findings ?? []); setRisk(d.risk); setFindingsLoading(false) })
  }, [selectedPR, selectedRepo])

  if (loading) return <LoadingScreen />

  if (!user) return <LoginScreen />

  return (
    <div className={styles.app}>
      {/* ── Sidebar ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <Link href="/" className={styles.sidebarLogo}>
            <ShieldIcon />
            <span>BreakShield CI</span>
          </Link>

          <nav className={styles.sidebarNav}>
            <div className={styles.navSection}>Repositories</div>
            {reposLoading && <div className={styles.navLoading}>Loading…</div>}
            {repos.length === 0 && !reposLoading && (
              <div className={styles.noRepos}>
                <p>No repositories found.</p>
                <a href={INSTALL_URL} target="_blank" rel="noopener" className={styles.installLink}>
                  Install BreakShield CI →
                </a>
              </div>
            )}
            {repos.map(r => (
              <button
                key={r.fullName}
                className={`${styles.repoBtn} ${selectedRepo === r.fullName ? styles.repoBtnActive : ''}`}
                onClick={() => setSelectedRepo(r.fullName)}
              >
                <span className={styles.repoIcon}>{r.private ? '🔒' : '📁'}</span>
                <span className={styles.repoName}>{r.name}</span>
                <span className={styles.repoOwner}>{r.owner}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className={styles.sidebarBottom}>
          <div className={styles.userCard}>
            <img src={user.avatarUrl} alt={user.login} className={styles.userAvatar} />
            <div className={styles.userInfo}>
              <div className={styles.userName}>{user.name}</div>
              <div className={styles.userLogin}>@{user.login}</div>
            </div>
            <a href="/api/auth/logout" className={styles.logoutBtn} title="Sign out">↩</a>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className={styles.main}>
        {!selectedRepo ? (
          <EmptyState />
        ) : (
          <div className={styles.content}>
            {/* Header */}
            <div className={styles.contentHeader}>
              <div>
                <h1 className={styles.repoTitle}>{selectedRepo}</h1>
                <p className={styles.repoSubtitle}>Pull request analysis history</p>
              </div>
              <a href={`https://github.com/${selectedRepo}`} target="_blank" rel="noopener" className={styles.viewOnGh}>
                View on GitHub ↗
              </a>
            </div>

            <div className={styles.split}>
              {/* PR list */}
              <div className={styles.prList}>
                <div className={styles.prListHeader}>
                  Pull Requests
                  <span className={styles.prCount}>{prs.length}</span>
                </div>

                {prsLoading && <PrSkeleton />}

                {!prsLoading && prs.length === 0 && (
                  <div className={styles.noPrs}>
                    No pull requests found. Open a PR to trigger analysis.
                  </div>
                )}

                {prs.map(pr => (
                  <button
                    key={pr.number}
                    className={`${styles.prItem} ${selectedPR?.number === pr.number ? styles.prItemActive : ''}`}
                    onClick={() => setSelectedPR(pr)}
                  >
                    <div className={styles.prItemTop}>
                      <span className={styles.prNumber}>#{pr.number}</span>
                      {pr.riskLevel && (
                        <span
                          className={styles.prRiskBadge}
                          style={{ color: RISK_COLOR[pr.riskLevel], background: `${RISK_COLOR[pr.riskLevel]}18` }}
                        >
                          {RISK_LABEL[pr.riskLevel]}
                        </span>
                      )}
                      {!pr.analyzed && (
                        <span className={styles.prNotAnalyzed}>not analyzed</span>
                      )}
                    </div>
                    <div className={styles.prItemTitle}>{pr.title}</div>
                    <div className={styles.prItemMeta}>
                      <span className={`${styles.prState} ${pr.state === 'open' ? styles.prStateOpen : styles.prStateClosed}`}>
                        {pr.state}
                      </span>
                      <span>{pr.author}</span>
                      <span>{timeAgo(pr.createdAt)}</span>
                    </div>
                  </button>
                ))}
              </div>

              {/* PR detail */}
              <div className={styles.prDetail}>
                {!selectedPR && (
                  <div className={styles.prDetailEmpty}>
                    <div className={styles.prDetailEmptyIcon}>🔍</div>
                    <p>Select a pull request to see the analysis</p>
                  </div>
                )}

                {selectedPR && (
                  <div className={styles.prDetailContent}>
                    {/* PR title */}
                    <div className={styles.prDetailHeader}>
                      <div>
                        <a href={selectedPR.url} target="_blank" rel="noopener" className={styles.prDetailTitle}>
                          {selectedPR.title} <span className={styles.prDetailNum}>#{selectedPR.number}</span>
                        </a>
                        <div className={styles.prDetailBranch}>
                          <code>{selectedPR.baseBranch}</code>
                          <span>←</span>
                          <code>{selectedPR.headBranch}</code>
                        </div>
                      </div>
                      <a href={selectedPR.url} target="_blank" rel="noopener" className={styles.openPrBtn}>
                        Open PR ↗
                      </a>
                    </div>

                    {/* Risk summary */}
                    {risk && (
                      <div
                        className={styles.riskCard}
                        style={{ borderColor: RISK_COLOR[risk.risk_level as RiskLevel], background: `${RISK_COLOR[risk.risk_level as RiskLevel]}10` }}
                      >
                        <div className={styles.riskCardTop}>
                          <span className={styles.riskCardLabel} style={{ color: RISK_COLOR[risk.risk_level as RiskLevel] }}>
                            {RISK_LABEL[risk.risk_level as RiskLevel]}
                          </span>
                          <span className={styles.riskCardScore}>{risk.risk_score}/100</span>
                        </div>
                        <div className={styles.riskCardBar}>
                          <div className={styles.riskCardBarFill} style={{ width: `${risk.risk_score}%`, background: RISK_COLOR[risk.risk_level as RiskLevel] }} />
                        </div>
                        <div className={styles.riskCardMeta}>
                          <span>{risk.breaking_count} breaking change{risk.breaking_count !== 1 ? 's' : ''}</span>
                          {risk.total_consumers_affected > 0 && <span>· {risk.total_consumers_affected} consumer{risk.total_consumers_affected !== 1 ? 's' : ''} affected</span>}
                        </div>
                      </div>
                    )}

                    {/* Not analyzed */}
                    {!risk && !findingsLoading && (
                      <div className={styles.notAnalyzed}>
                        <span>⏳</span>
                        <div>
                          <strong>Not yet analyzed</strong>
                          <p>Push a commit to this PR to trigger BreakShield CI analysis.</p>
                        </div>
                      </div>
                    )}

                    {findingsLoading && <FindingsSkeleton />}

                    {/* Findings */}
                    {!findingsLoading && findings.length > 0 && (
                      <div className={styles.findingsList}>
                        <div className={styles.findingsTitle}>
                          Findings
                          <span className={styles.findingsCount}>{findings.length}</span>
                        </div>
                        {findings.filter(f => f.is_breaking).map((f, i) => (
                          <FindingCard key={i} finding={f} />
                        ))}
                        {findings.filter(f => !f.is_breaking).length > 0 && (
                          <details className={styles.safeSection}>
                            <summary className={styles.safeSectionTitle}>
                              ✓ {findings.filter(f => !f.is_breaking).length} safe changes
                            </summary>
                            {findings.filter(f => !f.is_breaking).map((f, i) => (
                              <FindingCard key={i} finding={f} safe />
                            ))}
                          </details>
                        )}
                      </div>
                    )}

                    {!findingsLoading && risk && findings.length === 0 && (
                      <div className={styles.noFindings}>
                        ✅ No breaking changes detected in this PR.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FindingCard({ finding, safe = false }: { finding: Finding; safe?: boolean }) {
  const color = safe ? '#10b981' : '#f43f5e'
  return (
    <div className={styles.findingCard} style={{ borderColor: `${color}25` }}>
      <div className={styles.findingCardTop}>
        <code className={styles.findingCardValue}>{finding.affected_value}</code>
        <span className={styles.findingCardType} style={{ color, background: `${color}15` }}>
          {finding.change_type.replace(/_/g, ' ')}
        </span>
        <span className={styles.findingCardConf}>{finding.confidence}%</span>
      </div>
      <div className={styles.findingCardDesc}>{finding.description}</div>
      <div className={styles.findingCardFile}>📄 {finding.source_file}</div>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className={styles.loadingScreen}>
      <div className={styles.loadingSpinner} />
      <p>Loading…</p>
    </div>
  )
}

function LoginScreen() {
  return (
    <div className={styles.loginScreen}>
      <div className={styles.loginCard}>
        <ShieldIcon size={48} />
        <h1>BreakShield CI</h1>
        <p>Sign in with GitHub to see your pull request analysis dashboard.</p>
        <a href="/api/auth/login" className={styles.loginBtn}>
          <GithubIcon />
          Sign in with GitHub
        </a>
        <div className={styles.loginNote}>
          Free during beta · No credit card required
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyStateIcon}>📦</div>
      <h2>No repositories yet</h2>
      <p>Install BreakShield CI on your GitHub repositories to start analyzing pull requests.</p>
      <a href={INSTALL_URL} target="_blank" rel="noopener" className={styles.installBtn}>
        Install BreakShield CI →
      </a>
    </div>
  )
}

function PrSkeleton() {
  return (
    <div className={styles.skeleton}>
      {[1, 2, 3].map(i => <div key={i} className={styles.skeletonItem} />)}
    </div>
  )
}

function FindingsSkeleton() {
  return (
    <div className={styles.skeleton}>
      {[1, 2].map(i => <div key={i} className={styles.skeletonItem} style={{ height: 80 }} />)}
    </div>
  )
}

function ShieldIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z" fill="url(#dsh)"/>
      <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <defs>
        <linearGradient id="dsh" x1="3" y1="2" x2="21" y2="23" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5b8dee"/><stop offset="1" stopColor="#8b5cf6"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function GithubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  )
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
