import type { Metadata } from 'next'
import Link from 'next/link'
import styles from '../post.module.css'

export const metadata: Metadata = {
  title: 'The 3am Production Incident That Made Me Build BreakShield CI',
  description: 'How a removed TypeScript field caused a 3am production outage — and what I built to prevent it from happening again.',
  openGraph: {
    title: 'The 3am Production Incident That Made Me Build BreakShield CI',
    description: 'How a removed TypeScript field caused a 3am production outage — and what I built to prevent it from happening again.',
    type: 'article',
  },
}

export default function Post() {
  return (
    <main className={styles.main}>
      <div className={styles.inner}>
        <Link href="/blog" className={styles.back}>← Back to Blog</Link>

        <div className={styles.meta}>June 2, 2026 · 4 min read</div>
        <h1 className={styles.title}>The 3am Production Incident That Made Me Build BreakShield CI</h1>

        <div className={styles.content}>
          <p>It was 3am when my phone started ringing.</p>
          <p>Our API was down. Half the app was broken. Users were angry. The on-call engineer was panicking.</p>
          <p>After two hours of debugging we found it. Someone had removed the <code>email</code> field from <code>UserResponse</code>. Three other services were using it. Nobody caught it in code review. Nobody even knew those services existed.</p>
          <p>We fixed it. Deployed at 5am. Wrote the post-mortem. Added it to the "lessons learned" doc that nobody reads.</p>
          <p>Three months later it happened again.</p>

          <h2>The problem nobody talks about</h2>
          <p>Every team I've worked with has the same issue. You have a TypeScript interface. It's used in 6 places across 4 different files. You remove one field. You open a PR. Your teammates review it. Nobody catches it because nobody knows about those 6 places.</p>
          <p>The tests pass. The build passes. You merge. And then production breaks.</p>
          <p>The scary part? This isn't a skill issue. Senior engineers with 10 years of experience make this mistake. It's a tooling problem. Code review wasn't designed to catch this.</p>

          <h2>What I built</h2>
          <p>I spent a weekend building BreakShield CI — a GitHub App that does one thing: catches breaking API changes before you merge.</p>
          <p>When you open a pull request, it automatically:</p>
          <ul>
            <li>Parses your TypeScript interfaces and OpenAPI specs with a full AST</li>
            <li>Finds every place in your codebase that uses the changed API</li>
            <li>Shows you exactly which file and which line will break</li>
            <li>Posts a report directly in your PR</li>
            <li>Blocks merge if the risk is HIGH or CRITICAL</li>
          </ul>
          <p>No config. No CLI. No YAML. Install once, works on every PR forever.</p>

          <h2>The 3am call I didn't get</h2>
          <p>Last week a teammate removed a field from a shared interface. BreakShield CI caught it. The PR comment listed 4 consumer files. We updated them before merging.</p>
          <p>I didn't get a 3am call. That's the whole point.</p>

          <div className={styles.cta}>
            <p>BreakShield CI is free during beta. Install in 30 seconds.</p>
            <a href="https://github.com/apps/breakshield-ci" target="_blank" rel="noopener">
              Install on GitHub →
            </a>
          </div>
        </div>
      </div>
    </main>
  )
}
