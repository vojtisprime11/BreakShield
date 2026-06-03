# BreakShield CI — Automated Breaking Change Detection for GitHub

> Catch breaking API changes in pull requests before they reach production.

[![Install on GitHub](https://img.shields.io/badge/Install-GitHub%20App-blue?logo=github)](https://github.com/apps/breakshield-ci)
[![Free during beta](https://img.shields.io/badge/Beta-Free-green)](https://breakshield-ci.vercel.app)

---

## What it does

BreakShield CI is a GitHub App that automatically analyzes every pull request for breaking API changes in TypeScript interfaces and OpenAPI specs.

When it detects a breaking change, it posts a detailed report directly in your PR — with exact file and line numbers of affected consumers — and creates a Check Run that blocks merge on HIGH or CRITICAL risk.

**Zero config. Install once, works on every PR.**

---

## How to prevent breaking API changes in TypeScript

BreakShield CI uses [ts-morph](https://ts-morph.com) to parse a full TypeScript AST — not regex. This means it actually understands your code structure and finds:

- Removed fields from interfaces and type aliases
- Changed field types (`string` → `number`)
- Optional → required changes
- Removed exported functions and parameters
- Removed REST endpoints (OpenAPI)
- Added required fields to request bodies

---

## Automated breaking change detection for GitHub Actions

Unlike other CI tools, BreakShield CI doesn't just flag the changed file — it searches your entire codebase for consumer files and AST-verifies each match.

Every finding includes:
- Exact file path and line number
- The specific line of code that uses the changed API
- A confidence score (0–100) — low confidence noise is filtered automatically

---

## Risk levels

| Level | Description | Merge |
|-------|-------------|-------|
| ✅ SAFE | No breaking changes | Allowed |
| 🟢 LOW | Minor concerns | Allowed |
| 🟡 MEDIUM | Possible breaking changes | Allowed with warning |
| 🟠 HIGH | Breaking changes detected | **Blocked** |
| 🔴 CRITICAL | Verified consumers will break | **Blocked** |

---

## Installation

**[Install BreakShield CI on GitHub →](https://github.com/apps/breakshield-ci)**

Free during beta. No credit card required.

---

## How it works

1. You open a pull request
2. BreakShield CI fetches changed TypeScript and OpenAPI files
3. Parses before/after versions with full AST
4. Diffs exported interfaces, type aliases, functions, and REST endpoints
5. Searches codebase for consumer files via GitHub Code Search
6. AST-verifies each match — direct access, destructuring, type annotations
7. Posts PR comment + Check Run with results in seconds

---

## Supported file types

- TypeScript (`.ts`, `.tsx`) — interfaces, type aliases, exported functions
- OpenAPI / Swagger (`.yaml`, `.yml`, `.json`) — endpoints, request bodies, response schemas

---

## Tech stack

- **Next.js 16** — webhook handler
- **ts-morph** — TypeScript AST analysis
- **@apidevtools/swagger-parser** — OpenAPI parsing and dereferencing
- **Supabase** — job queue and results persistence
- **Vercel** — deployment

---

## Links

- 🌐 [Website](https://breakshield-ci.vercel.app)
- 📦 [GitHub Marketplace](https://github.com/marketplace/breakshield-ci)
- 📝 [How I built it](https://dev.to/vojtaholes/the-3am-production-incident-that-made-me-build-breakshield-ci)

---

*Built by [Vojta Holeš](https://github.com/vojtisprime11)*
