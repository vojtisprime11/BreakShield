# BreakShield CI — Promotion Materials

## Current Status (June 6, 2026)

### Awesome List PRs — 22 open
| # | Repo | Stars | Status |
|---|------|-------|--------|
| 1 | analysis-tools-dev/static-analysis | 13k+ | ⏳ Open |
| 2 | joho/awesome-code-review | 4k+ | ⏳ Open |
| 3 | wmariuss/awesome-devops | 5k+ | ⏳ Open |
| 4 | fffaraz/awesome-github | 1k+ | ⏳ Open |
| 5 | semlinker/awesome-typescript | 5k+ | ⏳ Open |
| 6 | moimikey/awesome-devtools | 1k+ | ⏳ Open |
| 7 | devtoolsd/awesome-devtools | 500+ | ⏳ Open |
| 8 | Curated-Awesome-Lists/awesome-devops-tools | 500+ | ⏳ Open |
| 9 | ligurio/awesome-ci | 2k+ | ⏳ Open |
| 10 | sdras/awesome-actions | 24k+ | ⏳ Open |
| 11 | codacy/tools-for-code-review | 400+ | ⏳ Open |
| 12 | unicodeveloper/awesome-opensource-apps | 3k+ | ⏳ Open |
| 13 | bytefer/awesome-nextjs | 2k+ | ⏳ Open |
| 14 | avinash201199/Awesome-GitHub-Repos | 1k+ | ⏳ Open |
| 15 | marmelab/awesome-rest | 4k+ | ⏳ Open |
| 16 | cicdops/awesome-ciandcd | 1k+ | ⏳ Open |
| 17 | TheJambo/awesome-testing | 2k+ | ⏳ Open |
| 18 | atinfo/awesome-test-automation | 4k+ | ⏳ Open |
| 19 | mfornos/awesome-microservices | 13k+ | ⏳ Open |
| 20 | mahseema/awesome-ai-tools | 15k+ | ⏳ Open |
| 21 | jondot/awesome-devenv | 3k+ | ⏳ Open |
| 22 | lirantal/awesome-nodejs-security | 3k+ | ⏳ Open |
| 23 | matiassingers/awesome-readme | 18k+ | ⏳ Open |

---

## Show HN Post (submit to https://news.ycombinator.com/submit)

**Title:** Show HN: BreakShield CI – Catches breaking API changes in PRs using TypeScript AST

**URL:** https://breakshield-ci.vercel.app

**Text (for self-post option):**
```
I built a GitHub App that detects breaking API changes in pull requests using TypeScript AST analysis (ts-morph). It's free and open source.

The problem: you rename a field, remove an endpoint, or change a return type — and don't realize 5 other services depend on it until production breaks at 3am.

BreakShield CI analyzes every PR automatically:
- Parses TypeScript with ts-morph (real compiler AST, not regex/LLM)
- Detects removed fields, changed types, deleted endpoints, new required params
- Scores confidence (80%+ = AST-verified, no false positive)
- Finds downstream consumers (exact file:line of code that will break)
- Calculates risk: SAFE → LOW → MEDIUM → HIGH → CRITICAL

If it finds breaking changes, it also offers AI auto-fix — supports Gemini (free), OpenAI, Claude, Groq (free), and Perplexity. Type /fix in a PR comment and it generates a fix PR.

Try the live demo (no signup): https://breakshield-ci.vercel.app/analyze
Install (free): https://github.com/apps/breakshield-ci
Source: https://github.com/vojtisprime11/BreakShield

Built with: Next.js 16, TypeScript, ts-morph, Supabase, Vercel
```

---

## Reddit Posts

### r/typescript
**Title:** I built a free tool that catches breaking API changes in PRs using TypeScript AST analysis

**Body:**
After getting woken up at 3am because someone removed a field that 5 services depended on, I built BreakShield CI.

It's a GitHub App that analyzes every PR using ts-morph (real TypeScript compiler AST, not regex). It detects:
- Removed fields from interfaces/types
- Changed type signatures
- Deleted endpoints
- New required parameters
- Changed return types

Each finding gets a confidence score (80%+ means AST-verified) and it finds which files in your codebase actually use the changed API.

Free, no signup needed for public repos: https://breakshield-ci.vercel.app/analyze

Source: https://github.com/vojtisprime11/BreakShield

---

### r/webdev
**Title:** Show off: GitHub App that prevents breaking API changes from reaching production (free, open source)

**Body:**
Built this over the past few months. It's a GitHub App that:

1. Watches your PRs
2. Parses changed TypeScript/OpenAPI files with ts-morph AST
3. Detects breaking changes (removed fields, changed types, deleted endpoints)
4. Posts a risk assessment as a PR comment
5. Offers AI auto-fix (supports Gemini, OpenAI, Claude, Groq, Perplexity)

Live demo (paste any public PR): https://breakshield-ci.vercel.app/analyze
Install free: https://github.com/apps/breakshield-ci

Tech: Next.js 16, TypeScript, ts-morph, Supabase, deployed on Vercel.

---

### r/devops
**Title:** BreakShield CI — free GitHub App that catches breaking API changes before they hit production

---

### r/reactjs / r/nextjs
**Title:** I built a full Next.js 16 app that detects breaking API changes in GitHub PRs (open source)

---

## Twitter/X Posts

### Launch tweet
```
🛡️ Shipped: BreakShield CI

Free GitHub App that catches breaking API changes before they ship.

✅ TypeScript AST analysis (ts-morph, not regex)
✅ Confidence scoring (80%+ = verified)
✅ Consumer detection (exact file:line)
✅ AI auto-fix (5 providers)
✅ Results in <3 seconds

Try it → breakshield-ci.vercel.app/analyze
```

### Technical tweet
```
How BreakShield CI works:

1. PR opened → webhook fires
2. Fetch changed .ts/.yaml files
3. Parse both versions with ts-morph AST
4. Diff exported interfaces, types, functions
5. Find removed fields, changed types, deleted endpoints
6. Score confidence (direct_access=90%, destructuring=80%)
7. Search consumers via GitHub Code Search
8. Calculate composite risk

All in <3 seconds. No LLM in the detection loop.

github.com/vojtisprime11/BreakShield
```

### AI angle tweet
```
🤖 BreakShield CI now supports 5 AI providers for auto-fix:

• Gemini 3.5 Flash (free!)
• GPT-5.5
• Claude Opus 4.8
• Groq Llama 70B (free!)
• Perplexity Sonar

It detects breaking changes with AST, then fixes them with AI.
Type /fix in a PR comment → fix PR generated.

breakshield-ci.vercel.app
```

---

## DEV.to / Hashnode Article Ideas

1. "How I built a TypeScript AST analyzer that catches breaking API changes"
2. "Why regex-based code analysis fails (and what to use instead)"
3. "Building a multi-provider AI engine: Gemini vs OpenAI vs Claude for code generation"
4. "The anatomy of a breaking API change: what ts-morph can detect"
5. "From 3am production incident to automated prevention: BreakShield CI"

---

## Product Hunt Launch

**Tagline:** Catch breaking API changes before they ship. AI auto-fix included.

**Description:** BreakShield CI is a free GitHub App that detects breaking API changes in pull requests using TypeScript AST analysis. It finds removed fields, changed types, deleted endpoints — with confidence scoring and consumer detection. Then offers AI-powered auto-fix via 5 providers.

**Topics:** Developer Tools, GitHub, TypeScript, AI, API

---

## Directories to submit to manually

- https://www.producthunt.com (launch)
- https://dev.to (article)
- https://hashnode.com (article)
- https://www.indiehackers.com/products (listing)
- https://alternativeto.net (list as alternative to Optic, Bump.sh)
- https://www.saashub.com
- https://stackshare.io/tools
- https://www.toolhunt.dev
- https://uneed.best
- https://microlaunch.net
- https://betalist.com
- https://startupstash.com
- https://www.startupranking.com
