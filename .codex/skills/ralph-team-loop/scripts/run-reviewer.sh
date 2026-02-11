#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# run-reviewer.sh — Run the Reviewer agent in a Codex Ralph Loop
#
# Codex reviews open PRs created by the agent team, approves or requests changes.
#
# Usage:
#   ./scripts/run-reviewer.sh [--max-iterations 10]
# =============================================================================

MAX_ITERATIONS=10
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENTS_DIR="$SCRIPT_DIR/../agents"

while [[ $# -gt 0 ]]; do
  case $1 in
    --max-iterations) MAX_ITERATIONS="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ ! -f ".ralph-team/config.json" ]]; then
  echo "Error: .ralph-team/config.json not found. Run init.sh first."
  exit 1
fi

REPO_TYPE=$(jq -r '.repo_type' .ralph-team/config.json)
DETECTED_STACK=$(jq -c '.detected_stack' .ralph-team/config.json)

echo "🔍 Starting Reviewer Loop (Codex)"
echo "   Max iterations: $MAX_ITERATIONS"

ITERATION=0

while [[ $ITERATION -lt $MAX_ITERATIONS ]]; do
  ITERATION=$((ITERATION + 1))
  echo ""
  echo "━━━ Reviewer Iteration $ITERATION / $MAX_ITERATIONS ━━━"

  # Gather open PRs
  OPEN_PRS=$(gh pr list --state open --json number,title,headRefName,author,labels,body,additions,deletions,changedFiles --limit 50 2>/dev/null || echo "[]")
  PR_COUNT=$(echo "$OPEN_PRS" | jq 'length')

  if [[ "$PR_COUNT" == "0" ]]; then
    echo "   No open PRs to review."

    # Check if there are any in-progress tickets that might still produce PRs
    IN_PROGRESS=$(jq '[.tickets[] | select(.status == "in_progress")] | length' .ralph-team/team-state.json 2>/dev/null || echo "0")

    if [[ "$IN_PROGRESS" == "0" ]]; then
      echo ""
      echo "✅ No open PRs and no in-progress tickets. Review complete!"

      echo "--- Reviewer Complete ---" >> .ralph-team/progress.txt
      echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> .ralph-team/progress.txt
      echo "Iterations used: $ITERATION" >> .ralph-team/progress.txt
      echo "" >> .ralph-team/progress.txt

      exit 0
    fi

    echo "   ($IN_PROGRESS tickets still in progress — waiting for PRs...)"
    sleep 10
    continue
  fi

  echo "   Found $PR_COUNT open PR(s) to review"

  # Review each PR
  for PR_NUM in $(echo "$OPEN_PRS" | jq -r '.[].number'); do
    PR_TITLE=$(echo "$OPEN_PRS" | jq -r ".[] | select(.number == $PR_NUM) | .title")
    echo ""
    echo "   📝 Reviewing PR #$PR_NUM: $PR_TITLE"

    # Get the PR diff
    PR_DIFF=$(gh pr diff "$PR_NUM" 2>/dev/null || echo "Unable to fetch diff")

    # Get PR review comments (existing)
    PR_COMMENTS=$(gh pr view "$PR_NUM" --json reviews --jq '.reviews[].body' 2>/dev/null || echo "No reviews yet")

    # Get the linked issue(s) for context
    PR_BODY=$(echo "$OPEN_PRS" | jq -r ".[] | select(.number == $PR_NUM) | .body")
    LINKED_ISSUE=""
    if echo "$PR_BODY" | grep -qoP '(?:Closes|Fixes|Resolves) #\d+'; then
      ISSUE_NUM=$(echo "$PR_BODY" | grep -oP '(?:Closes|Fixes|Resolves) #\K\d+' | head -1)
      LINKED_ISSUE=$(gh issue view "$ISSUE_NUM" --json title,body,labels --jq '{title, body, labels: [.labels[].name]}' 2>/dev/null || echo "")
    fi

    # Build the reviewer prompt
    PROMPT=$(cat << PROMPT_EOF
You are the Reviewer agent for a Ralph Team Loop. Your job is to review PRs
for correctness, quality, testing, and security.

## Context
- Repo type: $REPO_TYPE
- Detected stack: $DETECTED_STACK
- Iteration: $ITERATION of $MAX_ITERATIONS

## PR #$PR_NUM: $PR_TITLE

### PR Body
$PR_BODY

### Linked Issue
$LINKED_ISSUE

### Previous Reviews
$PR_COMMENTS

### Diff
$PR_DIFF

## Agent Specification
$(cat "$AGENTS_DIR/reviewer.md")

## Current Progress & Learnings
$(cat .ralph-team/progress.txt 2>/dev/null || echo "No progress log yet")

## Instructions
Review this PR according to your agent specification. You must:

1. Check code correctness — does the implementation match the ticket requirements?
2. Check code quality — clean code, proper naming, no duplication, follows stack conventions
3. Check testing — are there adequate tests? Do they cover edge cases?
4. Check security — no secrets, no injection vulnerabilities, no unsafe operations
5. Check design system compliance (frontend PRs) — proper token usage, accessible markup
6. Check for regressions — does this break existing functionality?

After your review, take ONE of these actions:

**If the PR is APPROVED:**
- Run: gh pr review $PR_NUM --approve --body "Your approval message"
- Run: gh pr merge $PR_NUM --squash --delete-branch
- Output: <promise>PR_${PR_NUM}_APPROVED</promise>

**If the PR needs CHANGES:**
- Run: gh pr review $PR_NUM --request-changes --body "Detailed feedback with specific line references"
- Output: <promise>PR_${PR_NUM}_CHANGES_REQUESTED</promise>

**If the PR should be CLOSED (fundamentally wrong approach):**
- Run: gh pr close $PR_NUM --comment "Reason for closing"
- Output: <promise>PR_${PR_NUM}_CLOSED</promise>

Be thorough but constructive. Reference specific lines. Suggest fixes, don't just point out problems.
PROMPT_EOF
    )

    # Run Codex for review
    OUTPUT=$(codex exec --yolo -p "$PROMPT" 2>&1) || true
    echo "$OUTPUT"

    # Log the review action
    if echo "$OUTPUT" | grep -q "<promise>PR_${PR_NUM}_APPROVED</promise>"; then
      echo "   ✅ PR #$PR_NUM approved and merged"
      echo "PR #$PR_NUM ($PR_TITLE): APPROVED at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> .ralph-team/progress.txt
    elif echo "$OUTPUT" | grep -q "<promise>PR_${PR_NUM}_CHANGES_REQUESTED</promise>"; then
      echo "   🔄 PR #$PR_NUM: changes requested"
      echo "PR #$PR_NUM ($PR_TITLE): CHANGES REQUESTED at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> .ralph-team/progress.txt
    elif echo "$OUTPUT" | grep -q "<promise>PR_${PR_NUM}_CLOSED</promise>"; then
      echo "   ❌ PR #$PR_NUM closed"
      echo "PR #$PR_NUM ($PR_TITLE): CLOSED at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> .ralph-team/progress.txt
    fi

    sleep 2
  done

  # Check if all PRs have been handled (re-check)
  REMAINING_PRS=$(gh pr list --state open --json number --jq 'length' 2>/dev/null || echo "0")
  if [[ "$REMAINING_PRS" == "0" ]]; then
    IN_PROGRESS=$(jq '[.tickets[] | select(.status == "in_progress")] | length' .ralph-team/team-state.json 2>/dev/null || echo "0")
    if [[ "$IN_PROGRESS" == "0" ]]; then
      echo ""
      echo "✅ All PRs reviewed and no in-progress tickets. Review complete!"
      echo "--- All Reviews Complete ---" >> .ralph-team/progress.txt
      echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> .ralph-team/progress.txt
      echo "" >> .ralph-team/progress.txt
      exit 0
    fi
  fi

  echo ""
  echo "   Reviewer loop continuing... ($REMAINING_PRS PRs remaining, checking again)"
  sleep 5
done

echo ""
echo "⚠️  Reviewer hit max iterations ($MAX_ITERATIONS)."
echo "   There may still be open PRs to review."
exit 1
