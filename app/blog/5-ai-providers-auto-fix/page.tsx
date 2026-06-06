import type { Metadata } from 'next'
import Link from 'next/link'
import styles from '../post.module.css'

export const metadata: Metadata = {
  title: '5 AI Providers for Auto-fixing Breaking API Changes — BreakShield CI',
  description: 'How BreakShield CI uses Gemini, OpenAI, Claude, Groq, and Perplexity to automatically fix breaking API changes detected in GitHub PRs.',
  openGraph: {
    title: '5 AI Providers for Auto-fixing Breaking API Changes',
    description: 'How BreakShield CI uses Gemini, OpenAI, Claude, Groq, and Perplexity to automatically fix breaking API changes detected in GitHub PRs.',
    type: 'article',
  },
}

export default function Post() {
  return (
    <main className={styles.main}>
      <div className={styles.inner}>
        <Link href="/blog" className={styles.back}>← Back to Blog</Link>

        <div className={styles.meta}>June 6, 2026 · 6 min read</div>
        <h1 className={styles.title}>5 AI Providers for Auto-fixing Breaking API Changes</h1>

        <div className={styles.content}>
          <p>BreakShield CI detects breaking changes using pure AST analysis — no AI in the detection loop. But when it finds a breaking change, the next question is: <em>how do we fix it?</em></p>
          <p>That{"'"}s where AI comes in. We now support 5 providers, each with different strengths.</p>

          <h2>The detection → fix pipeline</h2>
          <p>Here{"'"}s how it works:</p>
          <ol>
            <li><strong>AST detects</strong> — ts-morph finds a removed field, changed type, or deleted endpoint</li>
            <li><strong>Context is gathered</strong> — the affected file content, change type, before/after schemas</li>
            <li><strong>AI generates a fix</strong> — your chosen provider rewrites the affected code</li>
            <li><strong>PR is created</strong> — a new branch with the fix, ready for review</li>
          </ol>
          <p>The AI never decides what{"'"}s breaking — that{"'"}s deterministic AST analysis with 80-95% confidence. AI only handles the creative part: generating correct code.</p>

          <h2>Provider comparison</h2>

          <h3>Google Gemini (recommended for free tier)</h3>
          <p>Gemini 2.5 Flash is our default. It{"'"}s fast, free (1,500 requests/day), and handles most TypeScript fixes well. For complex refactoring, Gemini 2.5 Pro has a 1M token context window.</p>
          <ul>
            <li>Best for: quick fixes, simple field additions, type changes</li>
            <li>Free tier: yes (generous)</li>
            <li>Speed: very fast</li>
          </ul>

          <h3>OpenAI GPT-5.x</h3>
          <p>GPT-5.4 and 5.5 are excellent at understanding complex TypeScript patterns. They produce clean, idiomatic code and handle edge cases well.</p>
          <ul>
            <li>Best for: complex refactoring, multi-file implications</li>
            <li>Free tier: no</li>
            <li>Speed: fast</li>
          </ul>

          <h3>Anthropic Claude</h3>
          <p>Claude Sonnet 4.6 and Opus 4.8 are arguably the best at code generation right now. They understand nuanced TypeScript patterns and produce fewer errors. If you need the highest success rate, use Claude.</p>
          <ul>
            <li>Best for: complex breaking changes, nuanced code rewrites</li>
            <li>Free tier: no</li>
            <li>Speed: moderate</li>
          </ul>

          <h3>Groq (recommended for speed + free)</h3>
          <p>Groq runs open-source models at incredible speed. Llama 3.3 70B is fast and free — great for simple fixes. The new GPT-OSS 120B is surprisingly capable.</p>
          <ul>
            <li>Best for: simple fixes, speed-critical workflows</li>
            <li>Free tier: yes (all models)</li>
            <li>Speed: fastest</li>
          </ul>

          <h3>Perplexity Sonar</h3>
          <p>Perplexity is unique — it can search the web while generating fixes. This is useful when the fix requires understanding an external API that changed. Sonar Deep Research goes deep.</p>
          <ul>
            <li>Best for: fixes requiring external context/documentation</li>
            <li>Free tier: no</li>
            <li>Speed: moderate</li>
          </ul>

          <h2>Which one should you use?</h2>
          <p>Our recommendation:</p>
          <ul>
            <li><strong>Free + simple fixes</strong> → Gemini 2.5 Flash or Groq Llama 3.3 70B</li>
            <li><strong>Best quality</strong> → Claude Sonnet 4.6 or GPT-5.4</li>
            <li><strong>Complex refactoring</strong> → Claude Opus 4.8 or GPT-5.5</li>
            <li><strong>Fastest response</strong> → Groq</li>
          </ul>

          <h2>BYOK — Bring Your Own Key</h2>
          <p>All providers use your own API key. We never see or store it in plaintext — it{"'"}s encrypted in your Supabase user_settings row. You can test your key works with one click in the Settings panel.</p>
          <p>Configure it in the <a href="https://breakshield-ci.vercel.app/analyze">Analyze page</a> (click ⚙ AI Settings) or in the <a href="https://breakshield-ci.vercel.app/dashboard">Dashboard</a> under Settings.</p>

          <h2>Try it now</h2>
          <p>Paste any GitHub PR URL into <a href="https://breakshield-ci.vercel.app/analyze">the analyzer</a>, find a breaking change, and click {"\""}Suggest fix with AI{"\""}. It takes about 5 seconds from click to PR.</p>
        </div>

        <div className={styles.cta}>
          <Link href="/analyze">Try BreakShield CI →</Link>
        </div>
      </div>
    </main>
  )
}
