import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/react'
import './globals.css'

export const metadata: Metadata = {
  title: 'BreakShield CI — Catch breaking API changes before they ship',
  description: 'Automatically detects breaking API changes in every pull request. Analyzes TypeScript interfaces and OpenAPI specs with AST-verified evidence. Free during beta.',
  keywords: ['breaking changes', 'TypeScript', 'API', 'GitHub App', 'CI/CD', 'AST', 'OpenAPI', 'pull request', 'code review', 'developer tools'],
  authors: [{ name: 'Vojta Holeš' }],
  creator: 'Vojta Holeš',
  metadataBase: new URL('https://breakshield-ci.vercel.app'),
  openGraph: {
    title: 'BreakShield CI — Catch breaking API changes before they ship',
    description: 'Automatically detects breaking API changes in every pull request. Analyzes TypeScript interfaces and OpenAPI specs with AST-verified evidence.',
    type: 'website',
    url: 'https://breakshield-ci.vercel.app',
    siteName: 'BreakShield CI',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'BreakShield CI — Stop shipping broken APIs',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BreakShield CI — Catch breaking API changes before they ship',
    description: 'Automatically detects breaking API changes in every pull request. Free during beta.',
    images: ['/og-image.png'],
    creator: '@vojtispri',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'BreakShield CI',
              description: 'GitHub App that automatically detects breaking API changes in pull requests using AST analysis of TypeScript interfaces and OpenAPI specs.',
              url: 'https://breakshield-ci.vercel.app',
              applicationCategory: 'DeveloperApplication',
              operatingSystem: 'GitHub',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD',
                description: 'Free during beta',
              },
              author: {
                '@type': 'Person',
                name: 'Vojta Holeš',
              },
              keywords: 'TypeScript, API, breaking changes, GitHub App, CI/CD, AST, OpenAPI',
            }),
          }}
        />
      </head>
      <body>{children}<Analytics /></body>
    </html>
  )
}
