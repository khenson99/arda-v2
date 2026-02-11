#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# run-all.sh — Full Ralph Team Loop Orchestrator
#
# Chains: Planner → Team → Reviewer in sequence.
# Can also run individual phases or resume from a specific phase.
#
# Usage:
#   ./scripts/run-all.sh --prd ./PRD.md [OPTIONS]
#
# Options:
#   --prd PATH              Path to PRD file (required)
#   --phase PHASE           Start from phase: planner|team|reviewer (default: planner)
#   --planner-iterations N  Max planner iterations (default: 10)
#   --team-iterations N     Max team iterations (default: 50)
#   --reviewer-iterations N Max reviewer iterations (default: 10)
#   --cycles N              Number of full team→reviewer cycles (default: 3)
#   --skip-init             Skip init.sh (if already initialized)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Defaults
PRD_PATH=""
START_PHASE="planner"
PLANNER_ITERATIONS=10
TEAM_ITERATIONS=50
REVIEWER_ITERATIONS=10
CYCLES=3
SKIP_INIT=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --prd) PRD_PATH="$2"; shift 2 ;;
    --phase) START_PHASE="$2"; shift 2 ;;
    --planner-iterations) PLANNER_ITERATIONS="$2"; shift 2 ;;
    --team-iterations) TEAM_ITERATIONS="$2"; shift 2 ;;
    --reviewer-iterations) REVIEWER_ITERATIONS="$2"; shift 2 ;;
    --cycles) CYCLES="$2"; shift 2 ;;
    --skip-init) SKIP_INIT=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$PRD_PATH" ]]; then
  echo "Error: --prd is required"
  echo "Usage: ./scripts/run-all.sh --prd ./PRD.md [OPTIONS]"
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# Banner
# ─────────────────────────────────────────────────────────────────────────────

echo ""
echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║                    🔁 Ralph Team Loop Orchestrator                   ║"
echo "╠═══════════════════════════════════════════════════════════════════════╣"
echo "║  PRD:              $(basename "$PRD_PATH")                           "
echo "║  Starting phase:   $START_PHASE                                     "
echo "║  Planner iters:    $PLANNER_ITERATIONS                              "
echo "║  Team iters:       $TEAM_ITERATIONS                                 "
echo "║  Reviewer iters:   $REVIEWER_ITERATIONS                             "
echo "║  Cycles:           $CYCLES                                          "
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Phase 0: Initialize
# ─────────────────────────────────────────────────────────────────────────────

if [[ "$SKIP_INIT" == "false" && ! -f ".ralph-team/config.json" ]]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Phase 0: Initialization"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  bash "$SCRIPT_DIR/init.sh"
  echo ""
elif [[ -f ".ralph-team/config.json" ]]; then
  echo "✓ Already initialized (found .ralph-team/config.json)"
  echo ""
fi

# ─────────────────────────────────────────────────────────────────────────────
# Phase 1: Planner
# ─────────────────────────────────────────────────────────────────────────────

run_planner() {
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Phase 1: Planner (Codex)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if bash "$SCRIPT_DIR/run-planner.sh" --prd "$PRD_PATH" --max-iterations "$PLANNER_ITERATIONS"; then
    echo ""
    echo "✅ Planner phase complete"
    return 0
  else
    echo ""
    echo "⚠️  Planner did not complete within $PLANNER_ITERATIONS iterations"
    echo "   You can resume with: ./scripts/run-all.sh --prd $PRD_PATH --phase planner"
    return 1
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Phase 2 & 3: Team → Reviewer Cycle
# ─────────────────────────────────────────────────────────────────────────────

run_team() {
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Phase 2: Team (Claude Code)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if bash "$SCRIPT_DIR/run-team.sh" --max-iterations "$TEAM_ITERATIONS"; then
    echo ""
    echo "✅ Team phase complete"
    return 0
  else
    echo ""
    echo "⚠️  Team did not complete within $TEAM_ITERATIONS iterations"
    return 1
  fi
}

run_reviewer() {
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Phase 3: Reviewer (Codex)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if bash "$SCRIPT_DIR/run-reviewer.sh" --max-iterations "$REVIEWER_ITERATIONS"; then
    echo ""
    echo "✅ Reviewer phase complete"
    return 0
  else
    echo ""
    echo "⚠️  Reviewer did not complete within $REVIEWER_ITERATIONS iterations"
    return 1
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Execute phases based on start point
# ─────────────────────────────────────────────────────────────────────────────

PHASE_ORDER=("planner" "team" "reviewer")
START_INDEX=0

for i in "${!PHASE_ORDER[@]}"; do
  if [[ "${PHASE_ORDER[$i]}" == "$START_PHASE" ]]; then
    START_INDEX=$i
    break
  fi
done

# Run planner if we're starting from it
if [[ $START_INDEX -le 0 ]]; then
  run_planner || exit 1
fi

# Run team→reviewer cycles
CYCLE=0
while [[ $CYCLE -lt $CYCLES ]]; do
  CYCLE=$((CYCLE + 1))
  echo ""
  echo "╔═══════════════════════════════════════════════════════════════════════╗"
  echo "║               🔄 Cycle $CYCLE / $CYCLES (Team → Reviewer)                    ║"
  echo "╚═══════════════════════════════════════════════════════════════════════╝"
  echo ""

  # Run team (skip first cycle if starting from reviewer)
  if [[ $CYCLE -gt 1 || $START_INDEX -le 1 ]]; then
    run_team || true  # Don't exit on team failure; reviewer may still have work
  fi

  # Run reviewer
  run_reviewer || true

  # Check if everything is done
  OPEN_ISSUES=$(gh issue list --state open --json number --jq 'length' 2>/dev/null || echo "0")
  OPEN_PRS=$(gh pr list --state open --json number --jq 'length' 2>/dev/null || echo "0")

  if [[ "$OPEN_ISSUES" == "0" && "$OPEN_PRS" == "0" ]]; then
    echo ""
    echo "╔═══════════════════════════════════════════════════════════════════════╗"
    echo "║            🎉 Sprint Complete! All work done.                        ║"
    echo "╠═══════════════════════════════════════════════════════════════════════╣"
    echo "║  Cycles used:      $CYCLE / $CYCLES                                 "
    echo "║  Open issues:      0                                                "
    echo "║  Open PRs:         0                                                "
    echo "╚═══════════════════════════════════════════════════════════════════════╝"

    echo "--- Sprint Complete ---" >> .ralph-team/progress.txt
    echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> .ralph-team/progress.txt
    echo "Cycles used: $CYCLE / $CYCLES" >> .ralph-team/progress.txt
    echo "" >> .ralph-team/progress.txt

    exit 0
  fi

  echo ""
  echo "   Remaining: $OPEN_ISSUES open issues, $OPEN_PRS open PRs"
  if [[ $CYCLE -lt $CYCLES ]]; then
    echo "   Starting next cycle..."
  fi
done

echo ""
echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║  ⚠️  Completed $CYCLES cycles but work remains                      ║"
echo "╠═══════════════════════════════════════════════════════════════════════╣"
echo "║  Run again with: ./scripts/run-all.sh --prd $PRD_PATH --phase team  "
echo "╚═══════════════════════════════════════════════════════════════════════╝"
exit 1
