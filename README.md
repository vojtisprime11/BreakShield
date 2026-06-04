<div align="center">

# 🛡️ BreakShield CI

**Catch breaking API changes before they ship. AI auto-fix included.**

[![Install on GitHub](https://img.shields.io/badge/Install-GitHub%20App-2ea44f?style=for-the-badge&logo=github)](https://github.com/apps/breakshield-ci)
[![Website](https://img.shields.io/badge/Website-breakshield--ci.vercel.app-5b8dee?style=for-the-badge)](https://breakshield-ci.vercel.app)
[![TypeScript](https://img.shields.io/badge/TypeScript-AST%20Analysis-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://breakshield-ci.vercel.app)

---

A GitHub App that **automatically detects breaking API changes** in pull requests using **AST analysis** — not LLM guessing.

Finds removed fields, changed types, deleted endpoints, and new required parameters. Shows confidence levels, affected consumers, and risk scores. Then offers **AI-powered auto-fix** with one command.

</div>

---

## ⚡ Quick Start

1. **Install** → [github.com/apps/breakshield-ci](https://github.com/apps/breakshield-ci)
2. **Open a PR** with API changes
3. **BreakShield analyzes** automatically — posts findings in PR comment
4. **Type `/fix`** in a comment to generate a fix PR with AI

That's it. No config files. No YAML. No CI pipeline changes.

---

## 🔍 What It Detects

| Change Type | Example | Severity |
|:--|:--|:--|
| Removed field | `UserResponse.email` deleted | 🔴 Critical |
| Changed type | `id: number` → `id: string` | 🔴 Critical |
| Removed endpoint | `GET /api/users/:id` gone | 🔴 Critical |
| Added required field | New `orgId` required in request | 🟠 High |
| Changed return type | `Promise<User>` → `Promise<void>` | 🟠 High |
| Removed interface | `PaymentMethod` type deleted | 🔴 Critical |
| Removed parameter | Function param removed | 🟡 Medium |

Every finding includes:
- **Confidence score** — 80%+ means AST-verified, no false positive
- **Consumer search** — which files in your repo actually use that API
- **Risk level** — CRITICAL / HIGH / MEDIUM / LOW / SAFE
- **Before/after** — what changed exactly

---

## 🤖 AI Auto-Fix

Type `/fix` as a comment in your PR and BreakShield:

1. 👀 Acknowledges (reaction on your comment)
2. 🧠 Reads the affected file + breaking change context
3. ✨ Sends to your AI provider to generate a fix
4. 🚀 Opens a new PR with the corrected code

### Supported AI Providers

| Provider | Models | Free? |
|:--|:--|:--|
| Google Gemini | 3.5 Flash, 2.5 Pro, 2.5 Flash | ✅ Free tier |
| OpenAI | GPT-5.5, GPT-5.4, GPT-5.4 mini | ❌ |
| Anthropic | Claude Opus 4.8, Sonnet 4.6, Haiku 4.5 | ❌ |
| Groq | GPT-OSS 120B, Llama 3.3 70B, Qwen3 32B | ✅ Free tier |
| Perplexity | Sonar Deep Research, Sonar Pro | ❌ |

BYOK — Bring Your Own Key. Configure in the [Dashboard](https://breakshield-ci.vercel.app/dashboard).

---

## 🏗️ How It Works

```
PR opened / updated
       ↓
GitHub webhook fires → BreakShield CI
       ↓
Fetch changed files (base vs head)
       ↓
Parse both versions with ts-morph (TypeScript AST)
       ↓
Diff exported interfaces, types, functions, endpoints
       ↓
For each breaking change → search repo for consumers
       ↓
Calculate risk score → post PR comment + GitHub Check
```

**No LLM in detection.** Pure AST. Deterministic. Same code = same result every time.

AI is only used when you explicitly request a fix via `/fix`.

---

## 📊 Dashboard

The web dashboard at [breakshield-ci.vercel.app](https://breakshield-ci.vercel.app) provides:

- Overview of all your repositories and PRs
- Detailed findings with before/after diffs
- Risk scoring and trend analysis
- One-click "Suggest fix with AI" button
- Settings for AI provider and model selection

---

## 🛠️ Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **AST Parsing:** ts-morph
- **Database:** Supabase (PostgreSQL)
- **Auth:** GitHub OAuth + JWT sessions
- **Hosting:** Vercel (serverless)
- **Queue:** Supabase-backed job queue with `after()` processing

---

## 🔒 Security

- API keys stored encrypted at rest in Supabase
- Keys never exposed to client (only `hasApiKey: boolean`)
- OAuth tokens in signed HTTP-only JWT cookies
- Webhook signatures verified with HMAC-SHA256
- Write operations use installation tokens or scoped PATs

---

## 📝 License

MIT — free for personal and commercial use.

---

<div align="center">

**[Install on GitHub](https://github.com/apps/breakshield-ci)** · **[Dashboard](https://breakshield-ci.vercel.app)** · **[Report Bug](https://github.com/vojtisprime11/BreakShield/issues)**

Made with 🛡️ by [@vojtisprime11](https://github.com/vojtisprime11)

</div>
