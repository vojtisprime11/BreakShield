#!/bin/bash
# Submit BreakShield CI to awesome lists
set -e

ENTRY_TITLE="BreakShield CI"
ENTRY_URL="https://breakshield-ci.vercel.app"
PR_TITLE="Add BreakShield CI — AST-based breaking change detection for APIs"
PR_BODY="BreakShield CI is a free, open-source GitHub App that detects breaking API changes in pull requests using TypeScript AST analysis. Includes AI-powered auto-fix via \`/fix\` command in PR comments.

- **Website:** https://breakshield-ci.vercel.app
- **GitHub App:** https://github.com/apps/breakshield-ci
- **Features:** AST diffing, risk scoring, consumer detection, multi-provider AI auto-fix (Gemini, OpenAI, Claude, Groq, Perplexity)"

submit_pr() {
  local REPO="$1"
  local FILE="$2"
  local SECTION_PATTERN="$3"
  local ENTRY="$4"
  local BRANCH="add-breakshield-ci"

  echo ""
  echo "=== Submitting to $REPO ==="

  # Fork
  gh repo fork "$REPO" --clone=false 2>/dev/null || true
  sleep 2

  # Get default branch
  local DEFAULT_BRANCH
  DEFAULT_BRANCH=$(gh api "repos/$REPO" --jq '.default_branch' 2>/dev/null || echo "main")

  # Get current file content
  local CONTENT
  CONTENT=$(gh api "repos/$REPO/contents/$FILE?ref=$DEFAULT_BRANCH" --jq '.content' 2>/dev/null | base64 -d) || {
    echo "  ✗ Could not fetch $FILE"
    return 1
  }

  # Check if already listed
  if echo "$CONTENT" | grep -qi "breakshield"; then
    echo "  ✓ Already listed, skipping"
    return 0
  fi

  # Add entry after section pattern (or at end if no pattern)
  local NEW_CONTENT
  if [ -n "$SECTION_PATTERN" ] && echo "$CONTENT" | grep -q "$SECTION_PATTERN"; then
    NEW_CONTENT=$(echo "$CONTENT" | sed "/$SECTION_PATTERN/a\\
$ENTRY")
  else
    # Append near end
    NEW_CONTENT=$(printf '%s\n%s\n' "$CONTENT" "$ENTRY")
  fi

  # Create branch on fork
  local FORK_REPO="vojtisprime11/$(echo $REPO | cut -d'/' -f2)"

  # Get base SHA
  local BASE_SHA
  BASE_SHA=$(gh api "repos/$FORK_REPO/git/ref/heads/$DEFAULT_BRANCH" --jq '.object.sha' 2>/dev/null) || {
    echo "  ✗ Fork not ready yet"
    return 1
  }

  # Create branch
  gh api "repos/$FORK_REPO/git/refs" -f "ref=refs/heads/$BRANCH" -f "sha=$BASE_SHA" 2>/dev/null || {
    # Branch might exist, try to delete and recreate
    gh api -X DELETE "repos/$FORK_REPO/git/refs/heads/$BRANCH" 2>/dev/null || true
    sleep 1
    gh api "repos/$FORK_REPO/git/refs" -f "ref=refs/heads/$BRANCH" -f "sha=$BASE_SHA" 2>/dev/null || {
      echo "  ✗ Could not create branch"
      return 1
    }
  }

  # Get file SHA for update
  local FILE_SHA
  FILE_SHA=$(gh api "repos/$FORK_REPO/contents/$FILE?ref=$BRANCH" --jq '.sha' 2>/dev/null) || {
    echo "  ✗ Could not get file SHA"
    return 1
  }

  # Update file
  local ENCODED
  ENCODED=$(echo "$NEW_CONTENT" | base64)
  gh api -X PUT "repos/$FORK_REPO/contents/$FILE" \
    -f "message=Add BreakShield CI to list" \
    -f "content=$ENCODED" \
    -f "sha=$FILE_SHA" \
    -f "branch=$BRANCH" 2>/dev/null || {
    echo "  ✗ Could not update file"
    return 1
  }

  # Create PR
  gh pr create \
    --repo "$REPO" \
    --head "vojtisprime11:$BRANCH" \
    --base "$DEFAULT_BRANCH" \
    --title "$PR_TITLE" \
    --body "$PR_BODY" 2>/dev/null || {
    echo "  ✗ Could not create PR (might already exist)"
    return 1
  }

  echo "  ✓ PR submitted!"
}

# ─── Submit to each repo ───────────────────────────────────────────────────

submit_pr "analysis-tools-dev/static-analysis" "README.md" "TypeScript" \
  "- [BreakShield CI](https://breakshield-ci.vercel.app) — AST-based breaking change detection for TypeScript APIs. Analyzes PRs for removed fields, changed types, deleted endpoints with confidence scoring and AI auto-fix."

submit_pr "joho/awesome-code-review" "readme.md" "## Tools" \
  "- [BreakShield CI](https://breakshield-ci.vercel.app) - GitHub App that detects breaking API changes in PRs using AST analysis. Posts findings with confidence levels and offers AI-generated fixes via \`/fix\` command."

submit_pr "wmariuss/awesome-devops" "README.md" "Code review" \
  "- [BreakShield CI](https://breakshield-ci.vercel.app) - Breaking API change detection for PRs. AST-based TypeScript analysis with risk scoring and AI auto-fix."

submit_pr "fffaraz/awesome-github" "README.md" "## Tools" \
  "- [BreakShield CI](https://github.com/apps/breakshield-ci) - GitHub App that catches breaking API changes in PRs using AST analysis, with AI auto-fix via \`/fix\` command."

submit_pr "semlinker/awesome-typescript" "README.md" "## Tools" \
  "- [BreakShield CI](https://breakshield-ci.vercel.app) - AST-based breaking change detection for TypeScript APIs in GitHub PRs. 92-95% confidence with AI auto-fix."

submit_pr "moimikey/awesome-devtools" "README.md" "CI" \
  "- [BreakShield CI](https://breakshield-ci.vercel.app) - Breaking API change detection in PRs with AST analysis and AI auto-fix."

submit_pr "devtoolsd/awesome-devtools" "README.md" "CI" \
  "- [BreakShield CI](https://breakshield-ci.vercel.app) - GitHub App for detecting breaking API changes in PRs using TypeScript AST analysis. Includes AI-powered auto-fix."

submit_pr "Curated-Awesome-Lists/awesome-devops-tools" "README.md" "Code" \
  "- [BreakShield CI](https://breakshield-ci.vercel.app) - Catches breaking API changes before merge using AST analysis. Risk scoring, consumer detection, AI auto-fix."

submit_pr "officialrajdeepsingh/awesome-nextjs" "README.md" "Tools" \
  "- [BreakShield CI](https://breakshield-ci.vercel.app) - Breaking API change detection for Next.js/TypeScript projects. Built with Next.js 15, AST analysis + AI auto-fix."

submit_pr "unicodeveloper/awesome-opensource-apps" "README.md" "Developer" \
  "- [BreakShield CI](https://breakshield-ci.vercel.app) - Open-source GitHub App for detecting breaking API changes. Next.js + TypeScript + Supabase. [Install](https://github.com/apps/breakshield-ci)"

submit_pr "t18n/awesome-dev-tools" "README.md" "## " \
  "- [BreakShield CI](https://breakshield-ci.vercel.app) - GitHub App that catches breaking API changes in PRs using AST analysis and offers AI auto-fix."

submit_pr "codacy/tools-for-code-review-engineers" "README.md" "## " \
  "- [BreakShield CI](https://breakshield-ci.vercel.app) - Automated breaking API change detection in PRs. AST analysis with confidence scoring and AI-generated fix PRs."

echo ""
echo "=== DONE ==="
echo "Check your PRs at: https://github.com/pulls?q=is:pr+author:vojtisprime11+is:open"
