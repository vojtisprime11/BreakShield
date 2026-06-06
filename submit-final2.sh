#!/bin/bash

PR_BODY="BreakShield CI is a free, open-source GitHub App that catches breaking API changes in pull requests before they reach production.

Website: https://breakshield-ci.vercel.app
Install: https://github.com/apps/breakshield-ci
Source: https://github.com/vojtisprime11/BreakShield

Features:
- TypeScript AST analysis (ts-morph)
- OpenAPI spec diffing
- Confidence scoring (35-95 percent)
- Risk levels: SAFE to CRITICAL
- AI auto-fix via Gemini/OpenAI/Claude/Groq/Perplexity
- Zero config, results in 3 seconds"

submit_pr() {
  local REPO="$1"
  local FILE="$2"
  local SECTION_PATTERN="$3"
  local ENTRY="$4"
  local BRANCH="add-breakshield-ci"
  local PR_TITLE="Add BreakShield CI"

  echo "--- $REPO ---"

  local DEFAULT_BRANCH
  DEFAULT_BRANCH=$(gh api "repos/$REPO" --jq '.default_branch' 2>/dev/null || echo "main")

  local CONTENT
  CONTENT=$(gh api "repos/$REPO/contents/$FILE?ref=$DEFAULT_BRANCH" --jq '.content' 2>/dev/null | base64 -d) || {
    echo "  x Fetch failed"; return 0
  }
  if echo "$CONTENT" | grep -qi "breakshield"; then
    echo "  ok Already listed"; return 0
  fi

  local NEW_CONTENT
  if [ -n "$SECTION_PATTERN" ] && echo "$CONTENT" | grep -q "$SECTION_PATTERN"; then
    NEW_CONTENT=$(echo "$CONTENT" | sed "/$SECTION_PATTERN/a\\
$ENTRY")
  else
    NEW_CONTENT=$(printf '%s\n%s\n' "$CONTENT" "$ENTRY")
  fi

  local FORK_REPO="vojtisprime11/$(echo $REPO | cut -d'/' -f2)"
  local BASE_SHA
  BASE_SHA=$(gh api "repos/$FORK_REPO/git/ref/heads/$DEFAULT_BRANCH" --jq '.object.sha' 2>/dev/null) || {
    echo "  x Fork not ready"; return 0
  }

  gh api -X DELETE "repos/$FORK_REPO/git/refs/heads/$BRANCH" 2>/dev/null || true
  sleep 1
  gh api "repos/$FORK_REPO/git/refs" -f "ref=refs/heads/$BRANCH" -f "sha=$BASE_SHA" 2>/dev/null || {
    echo "  x Branch failed"; return 0
  }

  local FILE_SHA
  FILE_SHA=$(gh api "repos/$FORK_REPO/contents/$FILE?ref=$BRANCH" --jq '.sha' 2>/dev/null) || {
    echo "  x SHA failed"; return 0
  }

  local ENCODED
  ENCODED=$(echo "$NEW_CONTENT" | base64)
  gh api -X PUT "repos/$FORK_REPO/contents/$FILE" \
    -f "message=Add BreakShield CI to list" \
    -f "content=$ENCODED" \
    -f "sha=$FILE_SHA" \
    -f "branch=$BRANCH" 2>/dev/null || {
    echo "  x Update failed"; return 0
  }

  gh pr create --repo "$REPO" --head "vojtisprime11:$BRANCH" --base "$DEFAULT_BRANCH" \
    --title "$PR_TITLE" --body "$PR_BODY" 2>/dev/null && echo "  OK PR submitted" || echo "  x PR exists"
}

submit_pr "yosriady/api-development-tools" "README.md" "Testing" \
  "- [BreakShield CI](https://breakshield-ci.vercel.app) - Detects breaking API changes in PRs using TypeScript AST analysis. Risk scoring and AI auto-fix."

submit_pr "sourcegraph/awesome-code-ai" "README.md" "Code Review" \
  "- [BreakShield CI](https://breakshield-ci.vercel.app) - AI-powered auto-fix for breaking API changes detected via AST in GitHub PRs."

submit_pr "AcalephStorage/awesome-devops" "README.md" "Continuous" \
  "- [BreakShield CI](https://breakshield-ci.vercel.app) - Breaking API change detection for CI/CD. AST analysis with AI auto-fix."

echo "=== DONE ==="
