import type { Metadata } from 'next'
import Link from 'next/link'
import styles from '../post.module.css'

export const metadata: Metadata = {
  title: 'Why AST Analysis Catches Breaking Changes That Regex Misses',
  description: 'Most tools use regex to find breaking API changes. Here\'s why that\'s wrong and how a full TypeScript AST parser does it better.',
  openGraph: {
    title: 'Why AST Analysis Catches Breaking Changes That Regex Misses',
    description: 'Most tools use regex to find breaking API changes. Here\'s why that\'s wrong and how a full TypeScript AST parser does it better.',
    type: 'article',
  },
}

export default function Post() {
  return (
    <main className={styles.main}>
      <div className={styles.inner}>
        <Link href="/blog" className={styles.back}>← Back to Blog</Link>

        <div className={styles.meta}>June 3, 2026 · 5 min read</div>
        <h1 className={styles.title}>Why AST Analysis Catches Breaking Changes That Regex Misses</h1>

        <div className={styles.content}>
          <p>Most tools that claim to detect breaking API changes use regex under the hood. It seems reasonable — search for the field name, see if it's still there. Simple, fast, works most of the time.</p>
          <p>Except when it doesn't. And when it fails, it fails silently.</p>

          <h2>The regex approach</h2>
          <p>Imagine you have this TypeScript interface:</p>
          <pre><code>{`export interface UserResponse {
  id: string
  email: string
  emailAddress: string  // legacy field
}`}</code></pre>
          <p>Now you remove <code>email</code>. A regex-based tool searches for the string <code>email</code> in your codebase and finds hundreds of matches — including <code>emailAddress</code>, comments, string literals, and unrelated code.</p>
          <p>It either flags everything (noise) or misses the actual usages (false negatives). Neither is useful.</p>

          <h2>The AST approach</h2>
          <p>BreakShield CI uses <a href="https://ts-morph.com" target="_blank" rel="noopener">ts-morph</a> to parse a full TypeScript AST. This means it actually understands your code structure.</p>
          <p>When it looks for usages of <code>email</code>, it finds:</p>
          <ul>
            <li><strong>Direct access:</strong> <code>user.email</code> — 90% confidence</li>
            <li><strong>Destructuring:</strong> <code>const {'{ email }'} = user</code> — 80% confidence</li>
            <li><strong>Type annotation:</strong> <code>param: UserResponse</code> — 80% confidence</li>
            <li><strong>Object literal:</strong> <code>{'{ email: value }'}</code> — 65% confidence</li>
          </ul>
          <p>It does NOT match <code>emailAddress</code>, comments, or unrelated variables with the same name.</p>

          <h2>Confidence scoring</h2>
          <p>Every finding gets a confidence score. Low-confidence noise is filtered automatically. If there's no AST-verified evidence, there's no warning.</p>
          <p>This means zero false positives from generic field names like <code>id</code>, <code>name</code>, or <code>status</code> that appear in hundreds of unrelated places.</p>

          <h2>Why it matters</h2>
          <p>A tool that cries wolf on every PR is worse than no tool at all. Developers learn to ignore it.</p>
          <p>BreakShield CI only warns you when it has proof. Every finding includes the exact file, line number, and code snippet. You can verify it in seconds.</p>

          <div className={styles.cta}>
            <p>See it in action — free during beta.</p>
            <a href="https://github.com/apps/breakshield-ci" target="_blank" rel="noopener">
              Install on GitHub →
            </a>
          </div>
        </div>
      </div>
    </main>
  )
}
