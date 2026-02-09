#!/bin/bash
# git-auto-sync.sh — Watches for file changes and auto-commits/pushes to GitHub.
# Usage: .scripts/git-auto-sync.sh [repo-path]
#
# This script uses fswatch to monitor the repo for changes, debounces
# for a short period, then stages all changes, commits with an auto-generated
# message, and pushes to the current branch on origin.

set -euo pipefail

REPO_DIR="${1:-/Users/kylehenson/arda-v2}"
DEBOUNCE_SECONDS=10
LOG_FILE="$REPO_DIR/.scripts/auto-sync.log"

cd "$REPO_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

sync_to_github() {
  cd "$REPO_DIR"

  # Check if there are any changes to commit
  if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
    return 0
  fi

  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  CHANGED_FILES=$(git status --porcelain | head -5 | awk '{print $2}' | tr '\n' ', ' | sed 's/,$//')
  TOTAL_CHANGED=$(git status --porcelain | wc -l | tr -d ' ')

  if [ "$TOTAL_CHANGED" -gt 5 ]; then
    COMMIT_MSG="auto-sync: ${TOTAL_CHANGED} files changed (${CHANGED_FILES}...)"
  else
    COMMIT_MSG="auto-sync: ${CHANGED_FILES}"
  fi

  log "Syncing: $COMMIT_MSG"

  git add -A
  git commit -m "$COMMIT_MSG" --no-verify 2>&1 | tee -a "$LOG_FILE"
  git push origin "$BRANCH" 2>&1 | tee -a "$LOG_FILE"

  log "✅ Pushed to origin/$BRANCH"
}

log "🚀 Starting auto-sync watcher on $REPO_DIR"
log "   Debounce: ${DEBOUNCE_SECONDS}s | Branch: $(git rev-parse --abbrev-ref HEAD)"

# Do an initial sync of any pending changes
sync_to_github || log "⚠️  Initial sync had no changes or failed"

# Watch for changes, excluding common non-code dirs
# fswatch flags:
#   -o: output number of events (batch mode)
#   -l $DEBOUNCE: latency / debounce in seconds
#   -e: exclude patterns
fswatch -o -l "$DEBOUNCE_SECONDS" \
  -e "\.git/" \
  -e "node_modules/" \
  -e "\.next/" \
  -e "dist/" \
  -e "\.scripts/auto-sync\.log" \
  -e "__pycache__/" \
  -e "\.DS_Store" \
  "$REPO_DIR" | while read -r _num_events; do
    sync_to_github || log "⚠️  Sync failed, will retry on next change"
done
