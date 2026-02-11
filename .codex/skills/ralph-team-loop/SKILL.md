---
name: ralph-team-loop
description: >
  Orchestrate a multi-agent Ralph Loop team that executes GitHub Project tickets
  through the full software lifecycle. Spins up specialized agents — Architect,
  Planner, Backend Engineer, Frontend Engineer, QA, Design System Enforcer, and
  Reviewer — each running in fresh-context Ralph iterations. Codex handles ticket
  creation from PRDs and code review in its own loop. Claude Code agents handle
  implementation. Use this skill whenever someone mentions: agent team, ralph loop,
  multi-agent development, autonomous coding team, agent orchestration, spinning up
  agents, or automated software development pipeline. Also trigger when users want
  to set up autonomous coding workflows, run agents against GitHub projects, or
  coordinate multiple AI coding agents.
---

# Ralph Team Loop

An autonomous multi-agent development team that runs in Ralph Loops, pulling
tickets from a GitHub Project and shipping code through the full lifecycle:
planning → architecture → implementation → testing → design enforcement → review.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CODEX OUTER LOOP                          │
│  ┌─────────────┐                      ┌──────────────────┐  │
│  │   Planner    │──── creates ────────▶│  GitHub Issues   │  │
│  │  (Codex App) │     tickets          │  on Project Board│  │
│  └─────────────┘                      └────────┬─────────┘  │
│                                                 │            │
│  ┌──────────────────────────────────────────────┼─────────┐  │
│  │              CLAUDE CODE RALPH LOOP          │         │  │
│  │                                              ▼         │  │
│  │  ┌─────────────┐    assigns    ┌────────────────────┐  │  │
│  │  │  Architect   │─────────────▶│  Agent Workforce    │  │  │
│  │  │ (orchestrator)│             │                    │  │  │
│  │  └──────┬──────┘              │ ┌────────────────┐ │  │  │
│  │         │                     │ │Backend Engineer│ │  │  │
│  │    reads state,               │ ├────────────────┤ │  │  │
│  │    delegates work             │ │Frontend Engineer││  │  │
│  │         │                     │ ├────────────────┤ │  │  │
│  │         │                     │ │   QA Agent     │ │  │  │
│  │         │                     │ ├────────────────┤ │  │  │
│  │         │                     │ │Design Enforcer │ │  │  │
│  │         │                     │ └────────────────┘ │  │  │
│  │         │                     └────────┬───────────┘  │  │
│  │         │                              │              │  │
│  │         │      commits, opens PRs      │              │  │
│  │         ▼                              ▼              │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │                  Git Repository                  │  │  │
│  │  │  (branches, commits, PRs, AGENTS.md, state)     │  │  │
│  │  └──────────────────────┬──────────────────────────┘  │  │
│  └─────────────────────────┼─────────────────────────────┘  │
│                            │                                 │
│  ┌─────────────────┐       │                                 │
│  │    Reviewer      │◀──── PRs ready ──────────────────────  │
│  │   (Codex App)    │                                        │
│  └────────┬────────┘                                         │
│           │ approves / requests changes                      │
│           ▼                                                  │
│     merge or loop back                                       │
└─────────────────────────────────────────────────────────────┘
```

## How It Works

The system uses **three nested loops**:

1. **Codex Planner Loop** — Reads the PRD, creates well-structured GitHub issues
   with labels for agent routing, acceptance criteria, and dependencies.

2. **Claude Code Team Loop** — The Architect reads open tickets, assigns them to
   the right agent based on labels, and each agent runs its own Ralph sub-loop
   until the ticket's acceptance criteria are met. State persists via files.

3. **Codex Reviewer Loop** — Monitors open PRs, reviews code against the PRD and
   acceptance criteria, and approves or requests changes with actionable feedback.

Each loop runs with fresh context per iteration. Memory persists through:
- Git history and branches
- `team-state.json` — ticket assignments and status
- `progress.txt` — cumulative learnings across all agents
- `AGENTS.md` per role — role-specific accumulated knowledge
- `architecture-decisions.md` — Architect's decisions log
- GitHub Issues and PR comments

## Prerequisites

Before using this skill, ensure you have:

- **Claude Code** installed and authenticated (`npm install -g @anthropic-ai/claude-code`)
- **Codex CLI** installed and authenticated (`npm install -g @openai/codex`)
- **GitHub CLI** installed and authenticated (`gh auth login`)
- **jq** installed (`brew install jq` on macOS)
- A GitHub repository with a GitHub Project board
- A PRD document (markdown) describing what to build

## Quick Start

### 1. Initialize the project

```bash
# From your project root (run in both frontend and backend repos)
./scripts/init.sh --repo-type backend --project-url "https://github.com/orgs/YOUR_ORG/projects/1"
# OR
./scripts/init.sh --repo-type frontend --project-url "https://github.com/orgs/YOUR_ORG/projects/1"
```

This creates the `.ralph-team/` directory with all config, state files, and
agent prompts.

### 2. Run the Planner (Codex)

```bash
./scripts/run-planner.sh --prd ./PRD.md --max-iterations 10
```

Codex reads your PRD and creates GitHub issues with proper labels, acceptance
criteria, and dependency ordering.

### 3. Run the Team (Claude Code)

```bash
./scripts/run-team.sh --max-iterations 20
```

The Architect picks up tickets and delegates to the agent team. Each agent
works in its own Ralph sub-loop.

### 4. Run the Reviewer (Codex)

```bash
./scripts/run-reviewer.sh --max-iterations 10
```

Codex reviews open PRs and approves or requests changes.

### 5. Or run everything in one shot

```bash
./scripts/run-all.sh --prd ./PRD.md --max-iterations 20
```

This chains all three loops automatically, with the Planner running first,
then the Team loop, then the Reviewer loop, cycling until all tickets are
done or max iterations are hit.

## Agent Roles

Read the full agent specifications in the `agents/` directory. Summary:

| Agent | Tool | Role | Trigger Label |
|-------|------|------|---------------|
| **Architect** | Claude Code | Orchestrates team, assigns tickets, makes technical decisions. Never writes code. | N/A (always runs) |
| **Planner** | Codex | Reads PRD, creates GitHub issues with acceptance criteria and labels. | N/A (runs first) |
| **Backend Engineer** | Claude Code | Implements server-side code, APIs, DB migrations, business logic. | `agent:backend` |
| **Frontend Engineer** | Claude Code | Implements UI components, pages, client-side logic, styling. | `agent:frontend` |
| **QA Agent** | Claude Code | Writes and runs tests, reports failures, verifies acceptance criteria. | `agent:qa` |
| **Design System Enforcer** | Claude Code | Validates component usage, token adherence, accessibility, consistency. | `agent:design-system` |
| **Reviewer** | Codex | Reviews PRs against PRD and acceptance criteria, approves or requests changes. | N/A (runs on open PRs) |

## State Files

All state lives in `.ralph-team/` at the repo root:

```
.ralph-team/
├── config.json              # Project configuration
├── team-state.json          # Ticket assignments, agent status, iteration counts
├── progress.txt             # Cumulative learnings (appended each iteration)
├── architecture-decisions.md # Architect's ADR log
├── design-system.json       # Design system rules (tokens, components, patterns)
├── agents/                  # Per-role AGENTS.md files
│   ├── architect.md
│   ├── backend.md
│   ├── frontend.md
│   ├── qa.md
│   ├── design-enforcer.md
│   └── reviewer.md
└── prompts/                 # Agent prompt templates
    ├── architect.md
    ├── backend.md
    ├── frontend.md
    ├── qa.md
    ├── design-enforcer.md
    └── reviewer.md
```

For detailed file schemas, read `references/state-schemas.md`.

## Stack Detection

The skill auto-detects the project's tech stack by scanning:
- `package.json` (dependencies, devDependencies, scripts)
- Lock files (`yarn.lock`, `package-lock.json`, `pnpm-lock.yaml`)
- Config files (`tsconfig.json`, `next.config.*`, `vite.config.*`, etc.)
- Directory structure (`src/`, `app/`, `pages/`, `components/`, etc.)
- Docker/compose files
- Database config or migration directories

Detection results are stored in `.ralph-team/config.json` and inform each
agent's prompt with stack-specific instructions.

## Multi-Repo Coordination

For separate frontend and backend repos, the system coordinates via:

1. **Shared GitHub Project** — Both repos' issues live on the same project board
2. **API contract files** — The Architect maintains a shared API contract
   (OpenAPI spec or similar) that both sides reference
3. **Cross-repo labels** — Issues tagged `repo:frontend` or `repo:backend`
4. **Dependency ordering** — Backend API issues are prioritized before frontend
   consumption issues

Run the team loop in each repo separately, pointed at the same GitHub Project:

```bash
# Terminal 1 — backend repo
cd backend && ./scripts/run-team.sh --max-iterations 20

# Terminal 2 — frontend repo  
cd frontend && ./scripts/run-team.sh --max-iterations 20
```

## The Completion Promise

Each agent loop exits when one of these conditions is met:

1. The agent outputs `<promise>TICKET_DONE</promise>` — acceptance criteria met
2. Max iterations (20) reached — escalate to Architect
3. The agent outputs `<promise>BLOCKED</promise>` — dependency not met, skip

The Architect's loop exits when:
- All tickets on the board are `Done` → `<promise>SPRINT_COMPLETE</promise>`
- Max iterations reached → outputs status report
- All remaining tickets are blocked → `<promise>BLOCKED_SPRINT</promise>`

The full orchestration loop exits when:
- Planner has no more tickets to create AND Team has no more work AND Reviewer
  has approved all PRs → `<promise>COMPLETE</promise>`

## Customization

### Adding a new agent role

1. Create `agents/new-role.md` with the agent specification
2. Create `templates/prompts/new-role.md` with the prompt template
3. Add the role to `scripts/run-team.sh` agent dispatch
4. Add a trigger label (`agent:new-role`) to the routing table

### Changing iteration limits

Edit `.ralph-team/config.json`:
```json
{
  "max_iterations": {
    "planner": 10,
    "architect": 20,
    "agent": 20,
    "reviewer": 10,
    "full_cycle": 3
  }
}
```

### Design system configuration

Edit `.ralph-team/design-system.json` to define:
- Color tokens and their valid uses
- Typography scale
- Spacing scale
- Component inventory (which components exist and when to use them)
- Accessibility requirements
- Naming conventions

Read `references/design-system-config.md` for the full schema.

## Troubleshooting

Read `references/troubleshooting.md` for common issues and solutions.
