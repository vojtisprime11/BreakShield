import styles from './page.module.css'

const INSTALL_URL = 'https://github.com/apps/breakshield-ci'

export default function Home() {
  return (
    <main>

      {/* ── NAV ── */}
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <a href="/" className={styles.logo}>
            <Shield />
            BreakShield CI
          </a>
          <div className={styles.navLinks}>
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
          </div>
          <a href={INSTALL_URL} className={styles.navCta} target="_blank" rel="noopener">
            Install free →
          </a>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className={styles.hero}>

        {/* background glow */}
        <div className={styles.glow1} />
        <div className={styles.glow2} />

        <div className={styles.heroBadge}>
          <span className={styles.liveDot} />
          Free during beta · No credit card required
        </div>

        <h1 className={styles.heroTitle}>
          Stop shipping<br />
          <span className={styles.gradient}>broken APIs</span>
        </h1>

        <p className={styles.heroSub}>
          BreakShield CI watches every pull request and catches breaking changes
          in TypeScript interfaces and OpenAPI specs — with AST-verified proof
          of exactly who gets affected.
        </p>

        <div className={styles.heroCtas}>
          <a href={INSTALL_URL} className={styles.btnPrimary} target="_blank" rel="noopener">
            <GithubIcon />
            Install on GitHub — it&apos;s free
          </a>
          <a href="#how" className={styles.btnGhost}>See how it works ↓</a>
        </div>

        <div className={styles.heroStats}>
          {[
            { n: '< 5s',   l: 'Analysis time' },
            { n: '95%',    l: 'AST confidence' },
            { n: '0',      l: 'Config files needed' },
          ].map(s => (
            <div key={s.l} className={styles.heroStat}>
              <span className={styles.heroStatN}>{s.n}</span>
              <span className={styles.heroStatL}>{s.l}</span>
            </div>
          ))}
        </div>

        {/* ── PR MOCKUP ── */}
        <div className={styles.mockup}>
          <div className={styles.mockupBar}>
            <div className={styles.mockupDots}>
              <span style={{background:'#ff5f57'}} />
              <span style={{background:'#febc2e'}} />
              <span style={{background:'#28c840'}} />
            </div>
            <span className={styles.mockupTitle}>
              Pull Request #42 — refactor: clean up UserResponse API
            </span>
            <span className={styles.mockupBranch}>main ← feature/cleanup</span>
          </div>

          <div className={styles.mockupBody}>
            {/* check run */}
            <div className={styles.checkRun}>
              <span className={styles.checkIcon}>✕</span>
              <div>
                <div className={styles.checkName}>BreakShield CI</div>
                <div className={styles.checkDesc}>1 breaking change · HIGH risk · merge blocked</div>
              </div>
              <span className={styles.checkStatus}>Details</span>
            </div>

            {/* comment */}
            <div className={styles.comment}>
              <div className={styles.commentHeader}>
                <div className={styles.commentAvatar}>⚡</div>
                <span className={styles.commentBot}>breakshield-ci</span>
                <span className={styles.commentTime}>bot · just now</span>
                <span className={styles.riskBadge}>🔴 HIGH RISK</span>
              </div>

              <div className={styles.commentBody}>
                <div className={styles.commentHeading}>⚡ BreakShield CI — API Contract Analysis</div>

                <div className={styles.finding}>
                  <div className={styles.findingName}>
                    <code>UserResponse.email</code>
                  </div>
                  <div className={styles.findingRow}>
                    <Tag color="red">removed field</Tag>
                    <Tag color="blue">src/types/user.ts</Tag>
                    <Tag color="green">94% — AST-verified</Tag>
                  </div>
                  <div className={styles.findingDesc}>
                    Property <code>email</code> removed from <code>UserResponse</code>.
                    2 consumer files affected.
                  </div>

                  <div className={styles.evidence}>
                    <EvidenceLine
                      file="src/components/UserCard.tsx"
                      line={23}
                      code={'return `${user.name} <${user.email}>`'}
                      conf={94}
                    />
                    <EvidenceLine
                      file="src/pages/profile.tsx"
                      line={41}
                      code={'const { email, name } = user'}
                      conf={88}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── LOGOS / SOCIAL PROOF ── */}
      <div className={styles.proofBar}>
        <span className={styles.proofLabel}>Works with any GitHub repository</span>
        <div className={styles.proofLogos}>
          {['TypeScript', 'OpenAPI', 'Next.js', 'NestJS', 'Express', 'Fastify'].map(l => (
            <span key={l} className={styles.proofLogo}>{l}</span>
          ))}
        </div>
      </div>

      {/* ── HOW IT WORKS ── */}
      <section className={styles.section} id="how">
        <div className={styles.inner}>
          <div className={styles.sectionLabel}>How it works</div>
          <h2 className={styles.sectionTitle}>Zero setup. Works on every PR.</h2>
          <p className={styles.sectionSub}>
            Install once. BreakShield CI runs automatically on every pull request — no YAML, no CLI, no config.
          </p>

          <div className={styles.steps}>
            {[
              {
                n: '01',
                title: 'Install the GitHub App',
                desc: 'One click. BreakShield CI gets read access to your pull requests and repository contents. Nothing else.',
                tag: '30 seconds',
              },
              {
                n: '02',
                title: 'Open a pull request',
                desc: 'Push your branch and open a PR as usual. BreakShield CI starts analyzing in the background immediately.',
                tag: 'Automatic',
              },
              {
                n: '03',
                title: 'Get instant results',
                desc: 'A detailed report appears in your PR with breaking changes, affected files, exact line numbers, and a risk level.',
                tag: '< 5 seconds',
              },
            ].map(s => (
              <div key={s.n} className={styles.step}>
                <div className={styles.stepLeft}>
                  <div className={styles.stepNum}>{s.n}</div>
                  <div className={styles.stepLine} />
                </div>
                <div className={styles.stepRight}>
                  <div className={styles.stepTag}>{s.tag}</div>
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
        <div className={styles.inner}>
          <div className={styles.sectionLabel}>Features</div>
          <h2 className={styles.sectionTitle}>Built for teams that care about API contracts</h2>

          <div className={styles.featureGrid}>
            <div className={styles.featureBig}>
              <div className={styles.featureIcon}>🔬</div>
              <div className={styles.featureBigTitle}>AST-verified evidence</div>
              <div className={styles.featureBigDesc}>
                Every finding is backed by real code. We parse your TypeScript with ts-morph
                and show you the exact line that breaks — not a guess, not a regex match.
                If there&apos;s no evidence, there&apos;s no warning.
              </div>
            </div>

            {[
              { icon:'📋', title:'TypeScript + OpenAPI', desc:'Interfaces, type aliases, functions, REST endpoints, request bodies, response schemas.' },
              { icon:'🎯', title:'Confidence scoring', desc:'Each finding is scored 0–100. Noise is filtered automatically.' },
              { icon:'🛡️', title:'Merge protection', desc:'HIGH and CRITICAL risk PRs get a failing check run that blocks merge.' },
              { icon:'⚡', title:'Results in seconds', desc:'Analysis runs in the background. No waiting, no timeouts.' },
              { icon:'📊', title:'Risk levels', desc:'SAFE · LOW · MEDIUM · HIGH · CRITICAL — based on blast radius.' },
            ].map(f => (
              <div key={f.title} className={styles.featureSmall}>
                <div className={styles.featureSmallIcon}>{f.icon}</div>
                <div className={styles.featureSmallTitle}>{f.title}</div>
                <div className={styles.featureSmallDesc}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHAT IT DETECTS ── */}
      <section className={styles.section} id="detects">
        <div className={styles.inner}>
          <div className={styles.sectionLabel}>Detection</div>
          <h2 className={styles.sectionTitle}>Every breaking change that matters</h2>

          <div className={styles.detectGrid}>
            <div className={styles.detectCol}>
              <div className={styles.detectColHeader} style={{color:'var(--red)'}}>⚠ Breaking — blocks merge</div>
              {[
                ['Removed field', 'UserResponse.email deleted'],
                ['Changed type', 'id: string → id: number'],
                ['Removed endpoint', 'DELETE /users/{id} gone'],
                ['Optional → required', 'name?: string → name: string'],
                ['Removed parameter', 'getUser(id, opts) → getUser(id)'],
                ['Added required field', 'New required email in request body'],
              ].map(([l, ex]) => (
                <div key={l} className={styles.detectRow}>
                  <span className={styles.detectLabel}>{l}</span>
                  <span className={styles.detectEx}>{ex}</span>
                </div>
              ))}
            </div>
            <div className={styles.detectCol}>
              <div className={styles.detectColHeader} style={{color:'var(--green)'}}>✓ Safe — passes</div>
              {[
                ['Added optional field', 'New bio?: string added'],
                ['New endpoint added', 'POST /users/search added'],
                ['Widened type', 'string → string | null'],
              ].map(([l, ex]) => (
                <div key={l} className={styles.detectRow}>
                  <span className={styles.detectLabel}>{l}</span>
                  <span className={styles.detectEx}>{ex}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className={styles.section} id="pricing" style={{background:'var(--bg2)'}}>
        <div className={styles.inner}>
          <div className={styles.sectionLabel}>Pricing</div>
          <h2 className={styles.sectionTitle}>Free during beta</h2>
          <p className={styles.sectionSub}>
            No limits, no credit card. Help us improve by using it and sharing feedback.
          </p>

          <div className={styles.pricingWrap}>
            <div className={styles.pricingCard}>
              <div className={styles.pricingTop}>
                <div className={styles.pricingBadge}>Beta</div>
                <div className={styles.pricingPrice}>$0<span>/mo</span></div>
                <div className={styles.pricingNote}>Free forever during beta</div>
              </div>
              <ul className={styles.pricingList}>
                {[
                  'Unlimited repositories',
                  'Unlimited pull requests',
                  'TypeScript + OpenAPI analysis',
                  'AST-verified consumer evidence',
                  'PR comments + Check Runs',
                  'Risk scoring & merge protection',
                  'Priority support',
                ].map(item => (
                  <li key={item}><span className={styles.checkMark}>✓</span>{item}</li>
                ))}
              </ul>
              <a href={INSTALL_URL} className={styles.btnPrimary} target="_blank" rel="noopener">
                Install for free →
              </a>
            </div>

            <div className={styles.pricingQuote}>
              <div className={styles.quoteText}>
                &ldquo;We merged a PR that removed a field used in 6 places.
                Took 3 hours to debug in production. BreakShield CI would have caught it in seconds.&rdquo;
              </div>
              <div className={styles.quoteAuthor}>— Every backend developer, at least once</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className={styles.ctaSection}>
        <div className={styles.glow3} />
        <div className={styles.inner} style={{textAlign:'center', position:'relative'}}>
          <h2 className={styles.ctaTitle}>Your next breaking change<br />is already in a PR</h2>
          <p className={styles.ctaSub}>Install BreakShield CI in 30 seconds. Free during beta.</p>
          <a href={INSTALL_URL} className={styles.btnPrimary} target="_blank" rel="noopener">
            <GithubIcon />
            Install on GitHub — it&apos;s free
          </a>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <a href="/" className={styles.logo}>
            <Shield />
            BreakShield CI
          </a>
          <span className={styles.footerMuted}>
            © 2026 · Built for developers who care about API contracts
          </span>
          <a href={INSTALL_URL} className={styles.footerLink} target="_blank" rel="noopener">
            GitHub App →
          </a>
        </div>
      </footer>

    </main>
  )
}

/* ── Small components ── */

function Shield() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z"
        fill="url(#shg)"/>
      <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <defs>
        <linearGradient id="shg" x1="3" y1="2" x2="21" y2="23" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5b8dee"/>
          <stop offset="1" stopColor="#8b5cf6"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function GithubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  )
}

function Tag({ children, color }: { children: React.ReactNode; color: 'red'|'blue'|'green' }) {
  const colors = {
    red:   { bg: 'rgba(244,63,94,0.12)',  text: '#f43f5e' },
    blue:  { bg: 'rgba(91,141,238,0.12)', text: '#5b8dee' },
    green: { bg: 'rgba(16,185,129,0.12)', text: '#10b981' },
  }
  return (
    <span style={{
      background: colors[color].bg,
      color: colors[color].text,
      padding: '2px 8px',
      borderRadius: '5px',
      fontSize: '11px',
      fontWeight: 600,
    }}>
      {children}
    </span>
  )
}

function EvidenceLine({ file, line, code, conf }: { file: string; line: number; code: string; conf: number }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '8px',
      padding: '10px 14px',
      marginBottom: '6px',
    }}>
      <div style={{ fontSize: '11px', color: '#5b8dee', marginBottom: '4px', fontFamily: 'monospace' }}>
        {file}:{line} · {conf}% confidence
      </div>
      <code style={{ fontSize: '12px', color: '#9ca3af', fontFamily: "'SF Mono', 'Fira Code', monospace" }}>
        {code}
      </code>
    </div>
  )
}
