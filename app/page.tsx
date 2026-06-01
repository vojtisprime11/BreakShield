import styles from './page.module.css'

const INSTALL_URL = 'https://github.com/apps/breakshield-ci'

export default function Home() {
  return (
    <main>
      {/* ── NAV ── */}
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <span className={styles.logo}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z"
                fill="url(#sg)" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5"/>
              <defs>
                <linearGradient id="sg" x1="3" y1="2" x2="21" y2="23" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#4f8ef7"/>
                  <stop offset="1" stopColor="#7c3aed"/>
                </linearGradient>
              </defs>
            </svg>
            BreakShield CI
          </span>
          <div className={styles.navLinks}>
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href={INSTALL_URL} className={styles.navCta} target="_blank" rel="noopener">
              Install Free →
            </a>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className={styles.hero}>
        <div className={styles.heroBadge}>
          <span className={styles.dot} />
          Free during beta · No credit card required
        </div>

        <h1 className={styles.heroTitle}>
          Catch breaking API changes<br />
          <span className={styles.gradient}>before they ship</span>
        </h1>

        <p className={styles.heroSub}>
          BreakShield CI analyzes every pull request for breaking changes in TypeScript interfaces
          and OpenAPI specs — with AST-verified evidence showing exactly which files and lines are affected.
        </p>

        <div className={styles.heroCtas}>
          <a href={INSTALL_URL} className={styles.btnPrimary} target="_blank" rel="noopener">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            Install on GitHub — it's free
          </a>
          <a href="#how" className={styles.btnSecondary}>See how it works</a>
        </div>

        {/* PR comment preview */}
        <div className={styles.prPreview}>
          <div className={styles.prHeader}>
            <div className={styles.prDot} style={{background:'#ef4444'}} />
            <div className={styles.prDot} style={{background:'#f59e0b'}} />
            <div className={styles.prDot} style={{background:'#22c55e'}} />
            <span className={styles.prTitle}>Pull Request #42 — refactor: clean up UserResponse API</span>
          </div>
          <div className={styles.prBody}>
            <div className={styles.prComment}>
              <div className={styles.prCommentHeader}>
                <span className={styles.prBot}>⚡ BreakShield CI</span>
                <span className={styles.prRisk} style={{background:'rgba(239,68,68,0.15)', color:'#ef4444'}}>🔴 HIGH RISK</span>
              </div>
              <div className={styles.prFinding}>
                <div className={styles.findingTitle}><code>UserResponse.email</code></div>
                <div className={styles.findingMeta}>
                  <span>removed field</span>
                  <span>·</span>
                  <span>src/types/user.ts</span>
                  <span>·</span>
                  <span style={{color:'#22c55e'}}>94% confidence — AST-verified</span>
                </div>
                <div className={styles.findingEvidence}>
                  <div className={styles.evidenceItem}>
                    <span className={styles.evidenceFile}>src/components/UserCard.tsx:23</span>
                    <code className={styles.evidenceCode}>return `{'${user.name}'} &lt;{'${user.email}'}&gt;`</code>
                  </div>
                  <div className={styles.evidenceItem}>
                    <span className={styles.evidenceFile}>src/pages/profile.tsx:41</span>
                    <code className={styles.evidenceCode}>{'const { email, name } = user'}</code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className={styles.section} id="how">
        <div className={styles.sectionInner}>
          <div className={styles.sectionLabel}>How it works</div>
          <h2 className={styles.sectionTitle}>Zero setup. Works on every PR.</h2>
          <p className={styles.sectionSub}>Install once, protect forever. No config files, no CLI, no CI yaml.</p>

          <div className={styles.steps}>
            {[
              { n:'01', title:'Install the GitHub App', desc:'One click. BreakShield CI gets read access to your pull requests and code.' },
              { n:'02', title:'Open a pull request', desc:'Push your branch and open a PR as usual. BreakShield CI starts analyzing automatically.' },
              { n:'03', title:'Get instant results', desc:'A detailed report appears in your PR — breaking changes, affected files, exact line numbers.' },
            ].map(s => (
              <div key={s.n} className={styles.step}>
                <div className={styles.stepNum}>{s.n}</div>
                <div>
                  <div className={styles.stepTitle}>{s.title}</div>
                  <div className={styles.stepDesc}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className={styles.section} id="features" style={{background:'var(--bg2)'}}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionLabel}>Features</div>
          <h2 className={styles.sectionTitle}>Everything you need to ship with confidence</h2>

          <div className={styles.features}>
            {[
              { icon:'🔍', title:'AST-verified evidence', desc:'Every finding is backed by real code. We parse your TypeScript with ts-morph — not regex — and show you the exact line that breaks.' },
              { icon:'📋', title:'TypeScript & OpenAPI', desc:'Detects breaking changes in exported interfaces, type aliases, functions, and OpenAPI endpoints and schemas.' },
              { icon:'🎯', title:'Confidence scoring', desc:'Each finding gets a confidence score 0–100. Low-confidence noise is filtered out automatically so you only see what matters.' },
              { icon:'⚡', title:'Results in seconds', desc:'Analysis runs in the background. Your PR gets a comment and a check run status within seconds of opening.' },
              { icon:'🛡️', title:'Merge protection', desc:'HIGH and CRITICAL risk PRs get a failing check run — blocking accidental merges of breaking changes.' },
              { icon:'📊', title:'Risk scoring', desc:'Every PR gets a risk level: SAFE, LOW, MEDIUM, HIGH, or CRITICAL — based on blast radius and consumer count.' },
            ].map(f => (
              <div key={f.title} className={styles.feature}>
                <div className={styles.featureIcon}>{f.icon}</div>
                <div className={styles.featureTitle}>{f.title}</div>
                <div className={styles.featureDesc}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHAT IT DETECTS ── */}
      <section className={styles.section} id="detects">
        <div className={styles.sectionInner}>
          <div className={styles.sectionLabel}>What it detects</div>
          <h2 className={styles.sectionTitle}>Every breaking change that matters</h2>

          <div className={styles.detects}>
            {[
              { bad:true,  label:'Removed field',          ex:'UserResponse.email deleted' },
              { bad:true,  label:'Changed type',           ex:'id: string → id: number' },
              { bad:true,  label:'Removed endpoint',       ex:'DELETE /users/{id} gone' },
              { bad:true,  label:'Optional → required',    ex:'name?: string → name: string' },
              { bad:true,  label:'Removed parameter',      ex:'getUser(id, options) → getUser(id)' },
              { bad:true,  label:'Added required field',   ex:'New required email in request body' },
              { bad:false, label:'Added optional field',   ex:'New optional bio?: string' },
            ].map(d => (
              <div key={d.label} className={styles.detectItem}>
                <span className={styles.detectBadge} style={{
                  background: d.bad ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                  color: d.bad ? '#ef4444' : '#22c55e',
                }}>
                  {d.bad ? '⚠ Breaking' : '✓ Safe'}
                </span>
                <span className={styles.detectLabel}>{d.label}</span>
                <span className={styles.detectEx}>{d.ex}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className={styles.section} id="pricing" style={{background:'var(--bg2)'}}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionLabel}>Pricing</div>
          <h2 className={styles.sectionTitle}>Free during beta</h2>
          <p className={styles.sectionSub}>No credit card. No limits. Help us improve by using it and sharing feedback.</p>

          <div className={styles.pricingCard}>
            <div className={styles.pricingBadge}>Beta — Free</div>
            <div className={styles.pricingPrice}>$0 <span>/month</span></div>
            <ul className={styles.pricingList}>
              {[
                'Unlimited repositories',
                'Unlimited pull requests',
                'TypeScript + OpenAPI analysis',
                'AST-verified consumer evidence',
                'PR comments + Check Runs',
                'Risk scoring & merge protection',
                'Priority support during beta',
              ].map(item => (
                <li key={item}><span className={styles.check}>✓</span>{item}</li>
              ))}
            </ul>
            <a href={INSTALL_URL} className={styles.btnPrimary} target="_blank" rel="noopener">
              Install for free →
            </a>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className={styles.ctaSection}>
        <div className={styles.sectionInner}>
          <h2 className={styles.ctaTitle}>Stop shipping broken APIs</h2>
          <p className={styles.ctaSub}>Install BreakShield CI in 30 seconds. Free during beta.</p>
          <a href={INSTALL_URL} className={styles.btnPrimary} target="_blank" rel="noopener">
            Install on GitHub — it's free →
          </a>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span className={styles.logo}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z" fill="url(#sg2)"/>
              <defs>
                <linearGradient id="sg2" x1="3" y1="2" x2="21" y2="23" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#4f8ef7"/>
                  <stop offset="1" stopColor="#7c3aed"/>
                </linearGradient>
              </defs>
            </svg>
            BreakShield CI
          </span>
          <span className={styles.footerMuted}>© 2026 · Built for developers who care about API contracts</span>
        </div>
      </footer>
    </main>
  )
}
