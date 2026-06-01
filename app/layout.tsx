import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BreakShield CI — Catch breaking API changes before they ship',
  description: 'Automatically detects breaking API changes in every pull request. Analyzes TypeScript interfaces and OpenAPI specs with AST-verified evidence.',
  openGraph: {
    title: 'BreakShield CI',
    description: 'Catch breaking API changes before they ship.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
