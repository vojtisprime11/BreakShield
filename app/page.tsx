import styles from './page.module.css'

const INSTALL_URL  = 'https://github.com/apps/breakshield-ci'
const GITHUB_LOGIN = '/api/auth/login'

export default function Home() {
  return (
    <main>

      {/* ── NAV ── */}
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <a href="/" className={styles.logo}><Shield />BreakShield CI</a>
          <div className={styles.navLinks}>
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="/blog">Blog</a>
            <a href="/analyze">Live demo</a>
          </div>
          <div className={styles.navActions}>
            <a href={GITHUB_LOGIN} className={styles.navSignIn}><GH size={14} />Sign in</a>
            <a href={INSTALL_URL} className={styles.navCta} target="_blank" rel="noopener">Install free</a>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroGlow2} />

        <div className={styles.heroBadge}>
          <span className={styles.liveChip}>BETA</span>
          Free for everyone · No credit card · 2 min setup
        </div>

        <h1 className={styles.heroH1}>
          Never ship a<br /><span className={styles.heroGrad}>broken API</span><br />again
        </h1>

        <p className={styles.heroP}>
          BreakShield CI reads every pull request, parses your TypeScript interfaces
          and OpenAPI specs with a real compiler, and tells you exactly what will break
          — before you click merge.
        </p>

        <div className={styles.heroCTAs}>
          <a href={GITHUB_LOGIN} className={styles.btnPrimary}>
            <GH size={16} />
            Sign in with GitHub
          </a>
          <a href="/analyze" className={styles.btnSecondary}>
            Try demo — no signup
          </a>
        </div>

        {/* Stats strip */}
        <div className={styles.heroStats}>
          {[
            { n: '< 5s',  l: 'Time to results' },
            { n: '95%',   l: 'AST confidence'  },
            { n: '0',     l: 'Config files'     },
            { n: 'Free',  l: 'During beta'      },
          ].map(s => (
            <div key={s.l} className={styles.heroStat}>
              <span className={styles.heroStatN}>{s.n}</span>
              <span className={styles.heroStatL}>{s.l}</span>
            </div>
          ))}
        </div>

        {/* PR preview mockup */}
        <div className={styles.mockup}>
          <div className={styles.mockupTitleBar}>
            <Dots />
            <span className={styles.mockupTabActive}>Pull Request #42</span>
            <span className={styles.mockupTab}>Files changed  <em>3</em></span>
            <span className={styles.mockupTab}>Checks  <em className={styles.red}>1</em></span>
          </div>
          <div className={styles.mockupBody}>
            {/* Check run */}
            <div className={styles.checkBox}>
              <div className={styles.checkFail}>
                <span className={styles.xCircle}>✕</span>
                <div>
                  <div className={styles.checkName}>BreakShield CI</div>
                  <div className={styles.checkSub}>1 breaking change · HIGH risk · merge blocked</div>
                </div>
                <span className={styles.checkDetails}>Details →</span>
              </div>
            </div>
            {/* Comment */}
            <div className={styles.comment}>
              <div className={styles.commentBar}>
                <div className={styles.commentAvatar}>⚡</div>
                <strong>breakshield-ci</strong>
                <span className={styles.bot}>bot</span>
                <span className={styles.commentTime}>just now</span>
                <span className={styles.riskPillHigh}>🔴 HIGH RISK</span>
              </div>
              <div className={styles.commentContent}>
                <p className={styles.commentTitle}>⚡ BreakShield CI — API Contract Analysis</p>
                <div className={styles.findingCard}>
                  <code className={styles.findingName}>UserResponse.email</code>
                  <div className={styles.tags}>
                    <Tag c="red">removed field</Tag>
                    <Tag c="blue">src/types/user.ts</Tag>
                    <Tag c="green">94% — AST-verified</Tag>
                  </div>
                  <p className={styles.findingDesc}>
                    Property <code>email</code> removed from <code>UserResponse</code>. 2 consumers affected.
                  </p>
                  <div className={styles.evidenceList}>
                    <Evidence file="src/components/UserCard.tsx" line={23} code={'return `${user.name} <${user.email}>`'} conf={94} />
                    <Evidence file="src/pages/profile.tsx"       line={41} code={'const { email, name } = user'}           conf={88} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── LOGO STRIP ── */}
      <div className={styles.strip}>
        <span className={styles.stripLabel}>Works with</span>
        {['TypeScript','OpenAPI','Next.js','NestJS','Express','Fastify','tRPC'].map(l=>(
          <span key={l} className={styles.stripItem}>{l}</span>
        ))}
      </div>

      {/* ── HOW IT WORKS ── */}
      <section className={styles.section} id="how">
        <div className={styles.inner}>
          <Eyebrow>How it works</Eyebrow>
          <h2 className={styles.h2}>From push to report in seconds</h2>
          <p className={styles.lead}>Install once. After that BreakShield CI runs automatically on every PR — zero config, zero YAML.</p>

          <div className={styles.steps}>
            {[
              { n:'01', tag:'30 seconds', title:'Install the GitHub App', body:'One click on GitHub Marketplace. BreakShield CI gets read-only access to your PRs and code — nothing else.' },
              { n:'02', tag:'Automatic',  title:'Open a pull request',    body:'Push your branch normally. BreakShield CI picks up the webhook and starts analyzing in the background.' },
              { n:'03', tag:'< 5 seconds',title:'Get your report',        body:'A PR comment appears with breaking changes, exact file:line locations, confidence scores, and a risk badge.' },
            ].map(s=>(
              <div key={s.n} className={styles.step}>
                <div className={styles.stepLine}>
                  <div className={styles.stepNum}>{s.n}</div>
                </div>
                <div className={styles.stepBody}>
                  <span className={styles.stepTag}>{s.tag}</span>
                  <h3 className={styles.stepTitle}>{s.title}</h3>
                  <p className={styles.stepDesc}>{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className={styles.sectionAlt} id="features">
        <div className={styles.inner}>
          <Eyebrow>Features</Eyebrow>
          <h2 className={styles.h2}>Everything you need. Nothing you don&apos;t.</h2>

          <div className={styles.featureGrid}>
            <div className={styles.featureLarge}>
              <div className={styles.featureIconLg}>🔬</div>
              <h3 className={styles.featureTitleLg}>AST-verified evidence</h3>
              <p className={styles.featureDescLg}>
                Every warning is backed by real code. We parse TypeScript with ts-morph — a full compiler API —
                and show the exact line that breaks. No evidence, no warning. Zero false positives from
                generic names like <code>id</code> or <code>name</code>.
              </p>
              <div className={styles.featureCode}>
                <div className={styles.codeRow}><span className={styles.codeFile}>src/components/UserCard.tsx:23</span></div>
                <code className={styles.codeLine}>return `{'${user.name}'} &lt;{'${user.email}'}&gt;`</code>
                <div className={styles.codeConf}>94% · direct access · AST-verified</div>
              </div>
            </div>

            {[
              { icon:'📋', title:'TypeScript + OpenAPI',  desc:'Interfaces, type aliases, exported functions, REST endpoints, request bodies, response schemas — all in one pass.' },
              { icon:'🎯', title:'Confidence scoring',    desc:'Each finding gets a score 0–100 based on usage type: direct access (90%), destructuring (80%), type annotation (80%).' },
              { icon:'🛡️', title:'Merge protection',      desc:'HIGH and CRITICAL risk PRs get a failing Check Run. Merge is blocked until the team acknowledges the change.' },
              { icon:'⚡', title:'Under 5 seconds',       desc:'Analysis runs in the background via Next.js waitUntil. Your PR gets a comment before you finish your coffee.' },
              { icon:'📊', title:'5 risk levels',         desc:'SAFE · LOW · MEDIUM · HIGH · CRITICAL — calculated from change type, consumer count, and confidence.' },
            ].map(f=>(
              <div key={f.title} className={styles.featureSmall}>
                <div className={styles.featureIconSm}>{f.icon}</div>
                <h3 className={styles.featureTitleSm}>{f.title}</h3>
                <p className={styles.featureDescSm}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DETECTION TABLE ── */}
      <section className={styles.section} id="detects">
        <div className={styles.inner}>
          <Eyebrow>Detection</Eyebrow>
          <h2 className={styles.h2}>Every breaking change that matters</h2>
          <div className={styles.detectGrid}>
            <div className={styles.detectCol}>
              <div className={styles.detectHeader} style={{color:'#f43f5e'}}>⚠ Breaking — blocks merge on HIGH/CRITICAL</div>
              {[
                ['Removed field',        'UserResponse.email deleted'],
                ['Changed type',         'id: string → id: number'],
                ['Removed endpoint',     'DELETE /users/{id} gone'],
                ['Optional → required',  'name?: string → name: string'],
                ['Removed parameter',    'getUser(id, opts) → getUser(id)'],
                ['Added required field', 'New required email in POST body'],
                ['Removed interface',    'UserResponse type deleted entirely'],
                ['Changed return type',  'Promise<User> → Promise<UserSummary>'],
              ].map(([l,e])=>(
                <div key={l} className={styles.detectRow}>
                  <span className={styles.detectLabel}>{l}</span>
                  <span className={styles.detectEx}>{e}</span>
                </div>
              ))}
            </div>
            <div className={styles.detectCol}>
              <div className={styles.detectHeader} style={{color:'#10b981'}}>✓ Safe — passes</div>
              {[
                ['Added optional field',  'New bio?: string added'],
                ['New endpoint',          'POST /users/search added'],
                ['Widened type',          'string → string | null'],
              ].map(([l,e])=>(
                <div key={l} className={styles.detectRow}>
                  <span className={styles.detectLabel}>{l}</span>
                  <span className={styles.detectEx}>{e}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className={styles.sectionAlt} id="pricing">
        <div className={styles.inner}>
          <Eyebrow>Pricing</Eyebrow>
          <h2 className={styles.h2}>Free during beta. Seriously.</h2>
          <p className={styles.lead}>No trials. No limits. Help us ship a better product by using it.</p>
          <div className={styles.pricingRow}>
            <div className={styles.pricingCard}>
              <div className={styles.pricingBadge}>Beta — Free</div>
              <div className={styles.pricingPrice}>$0 <span>/month</span></div>
              <ul className={styles.pricingList}>
                {['Unlimited repositories','Unlimited pull requests','TypeScript + OpenAPI analysis','AST-verified consumer evidence','PR comments + Check Runs','Merge protection on HIGH/CRITICAL','Priority support during beta'].map(i=>(
                  <li key={i}><span className={styles.check}>✓</span>{i}</li>
                ))}
              </ul>
              <a href={GITHUB_LOGIN} className={styles.btnPrimary}><GH size={15} />Get started free</a>
            </div>
            <blockquote className={styles.quote}>
              <p>&ldquo;We merged a PR that removed a field used in 6 places. Took 3 hours to debug in production. BreakShield CI would have caught it in seconds.&rdquo;</p>
              <footer>— Every backend developer, at least once</footer>
            </blockquote>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className={styles.section} id="faq">
        <div className={styles.inner}>
          <Eyebrow>FAQ</Eyebrow>
          <h2 className={styles.h2}>Common questions</h2>
          <div className={styles.faqGrid}>
            {[
              {q:'Does it work on private repos?',       a:'Yes — after installing the GitHub App it works on both public and private repos. The live demo on this site only works with public repos.'},
              {q:'What permissions does it need?',       a:'Read access to pull requests and repository contents. It only writes a PR comment and a Check Run — never modifies your code.'},
              {q:'Does it slow down CI?',                a:'No. BreakShield CI runs in parallel in the background. Your existing CI pipeline is unaffected.'},
              {q:'How is it different from TypeScript?', a:'TypeScript checks types within a single build. BreakShield CI diffs across commits, finds cross-file consumer usages, and catches runtime contract violations TypeScript misses.'},
              {q:'Does it catch all breaking changes?',  a:'It catches structural breaking changes in TypeScript interfaces and OpenAPI specs with high confidence. Logic bugs and runtime errors are out of scope.'},
              {q:'When will it stop being free?',        a:'We\'ll give users at least 30 days notice before any pricing changes. Beta users will get a grandfathered rate.'},
            ].map(f=>(
              <div key={f.q} className={styles.faqItem}>
                <h3 className={styles.faqQ}>{f.q}</h3>
                <p className={styles.faqA}>{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className={styles.ctaSection}>
        <div className={styles.ctaGlow} />
        <div className={styles.inner} style={{textAlign:'center',position:'relative',zIndex:1}}>
          <h2 className={styles.ctaH2}>Your next breaking change is already in a PR</h2>
          <p className={styles.ctaP}>Sign in with GitHub and protect your first repository in 30 seconds.</p>
          <div className={styles.heroCTAs}>
            <a href={GITHUB_LOGIN} className={styles.btnPrimary}><GH size={16} />Sign in with GitHub</a>
            <a href="/analyze"     className={styles.btnSecondary}>Try demo first</a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <a href="/" className={styles.logo}><Shield />BreakShield CI</a>
          <div className={styles.footerLinks}>
            <a href="/blog">Blog</a>
            <a href="/analyze">Demo</a>
            <a href="/dashboard">Dashboard</a>
            <a href={INSTALL_URL} target="_blank" rel="noopener">GitHub App</a>
          </div>
          <p className={styles.footerNote}>© 2026 · Built for developers who care about API contracts</p>
        </div>
      </footer>

    </main>
  )
}

/* ─── Micro-components ──────────────────────────────────────────────────── */

function Shield() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{flexShrink:0}}>
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z" fill="url(#sg)"/>
      <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <defs><linearGradient id="sg" x1="3" y1="2" x2="21" y2="23" gradientUnits="userSpaceOnUse"><stop stopColor="#5b8dee"/><stop offset="1" stopColor="#8b5cf6"/></linearGradient></defs>
    </svg>
  )
}

function GH({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  )
}

function Dots() {
  return (
    <div style={{display:'flex',gap:'5px',marginRight:'8px'}}>
      {['#ff5f57','#febc2e','#28c840'].map(c=><span key={c} style={{width:11,height:11,borderRadius:'50%',background:c,display:'block'}}/>)}
    </div>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p style={{fontSize:'11px',fontWeight:700,letterSpacing:'2.5px',textTransform:'uppercase',color:'#5b8dee',marginBottom:'12px'}}>{children}</p>
}

function Tag({ children, c }: { children: React.ReactNode; c: 'red'|'blue'|'green' }) {
  const m = {red:{bg:'rgba(244,63,94,.12)',t:'#f43f5e'},blue:{bg:'rgba(91,141,238,.12)',t:'#5b8dee'},green:{bg:'rgba(16,185,129,.12)',t:'#10b981'}}
  return <span style={{background:m[c].bg,color:m[c].t,padding:'2px 8px',borderRadius:'5px',fontSize:'11px',fontWeight:600}}>{children}</span>
}

function Evidence({ file, line, code, conf }: { file:string; line:number; code:string; conf:number }) {
  return (
    <div style={{background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.06)',borderRadius:'8px',padding:'10px 14px',marginBottom:'6px'}}>
      <div style={{fontSize:'11px',color:'#5b8dee',marginBottom:'4px',fontFamily:'monospace'}}>{file}:{line} · {conf}% confidence</div>
      <code style={{fontSize:'12px',color:'#9ca3af',fontFamily:"'SF Mono','Fira Code',monospace"}}>{code}</code>
    </div>
  )
}
