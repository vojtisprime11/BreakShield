import type { Metadata } from 'next'
import Link from 'next/link'
import styles from './blog.module.css'

export const metadata: Metadata = {
  title: 'Blog — BreakShield CI',
  description: 'Articles about TypeScript API contracts, breaking changes, and developer tools.',
}

const posts = [
  {
    slug: '3am-production-incident',
    title: 'The 3am Production Incident That Made Me Build BreakShield CI',
    date: 'June 2, 2026',
    description: 'How a removed TypeScript field caused a 3am production outage — and what I built to prevent it from happening again.',
    readTime: '4 min read',
  },
  {
    slug: 'how-ast-catches-breaking-changes',
    title: 'Why AST Analysis Catches Breaking Changes That Regex Misses',
    date: 'June 3, 2026',
    description: 'Most tools use regex to find breaking API changes. Here\'s why that\'s wrong and how a full TypeScript AST parser does it better.',
    readTime: '5 min read',
  },
]

export default function BlogPage() {
  return (
    <main className={styles.main}>
      <div className={styles.inner}>
        <Link href="/" className={styles.back}>← Back to BreakShield CI</Link>
        <h1 className={styles.title}>Blog</h1>
        <p className={styles.sub}>Articles about TypeScript, API contracts, and developer tools.</p>

        <div className={styles.posts}>
          {posts.map(post => (
            <Link key={post.slug} href={`/blog/${post.slug}`} className={styles.post}>
              <div className={styles.postMeta}>{post.date} · {post.readTime}</div>
              <h2 className={styles.postTitle}>{post.title}</h2>
              <p className={styles.postDesc}>{post.description}</p>
              <span className={styles.readMore}>Read more →</span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
