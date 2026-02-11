# State Schemas Reference

All state files live in `.ralph-team/` at the repo root.

---

## config.json

Created by `init.sh`. Read-only after initialization.

```json
{
  "project_url": "https://github.com/orgs/OWNER/projects/N",
  "repo_type": "monorepo | frontend | backend | fullstack",
  "repos": {
    "frontend": "owner/frontend-repo",
    "backend": "owner/backend-repo"
  },
  "detected_stack": {
    "package_manager": "npm | yarn | pnpm | pip | poetry | go | cargo",
    "language": "typescript | javascript | python | go | rust",
    "framework": "nextjs | nuxt | react | vue | express | fastify | django | fastapi | flask | gin | actix",
    "styling": "tailwind | styled-components | emotion | css-modules | none",
    "testing": "vitest | jest | pytest | go-test | none",
    "orm": "prisma | drizzle | typeorm | sequelize | sqlalchemy | none",
    "containerized": true
  },
  "created_at": "2026-01-15T10:00:00Z"
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `project_url` | string | GitHub Projects URL for the sprint board |
| `repo_type` | enum | `monorepo`, `frontend`, `backend`, `fullstack` |
| `repos` | object | Map of role → repo identifier (multi-repo only) |
| `detected_stack` | object | Auto-detected technology stack |
| `created_at` | ISO 8601 | When init was run |

---

## team-state.json

Managed by the Architect agent. Updated after each agent action.

```json
{
  "sprint": {
    "id": "sprint-001",
    "started_at": "2026-01-15T10:00:00Z",
    "status": "in_progress"
  },
  "tickets": [
    {
      "issue_number": 5,
      "title": "Implement user auth API",
      "assigned_to": "backend-engineer",
      "status": "in_progress",
      "branch": "feat/5-user-auth-api",
      "pr_number": null,
      "started_at": "2026-01-15T10:05:00Z",
      "completed_at": null,
      "iterations_used": 3,
      "blocked_reason": null
    }
  ],
  "agents": {
    "architect": { "status": "idle", "last_action_at": "2026-01-15T10:05:00Z" },
    "backend-engineer": { "status": "working", "last_action_at": "2026-01-15T10:10:00Z", "current_ticket": 5 },
    "frontend-engineer": { "status": "idle", "last_action_at": null },
    "qa-agent": { "status": "idle", "last_action_at": null },
    "design-enforcer": { "status": "idle", "last_action_at": null }
  },
  "last_updated": "2026-01-15T10:10:00Z"
}
```

### Ticket Status Values

| Status | Description |
|--------|-------------|
| `todo` | Not yet assigned |
| `assigned` | Assigned to an agent but not started |
| `in_progress` | Agent is actively working |
| `pr_open` | PR created, awaiting review |
| `changes_requested` | Reviewer requested changes |
| `done` | PR merged |
| `blocked` | Agent hit a blocker |

### Agent Status Values

| Status | Description |
|--------|-------------|
| `idle` | Available for work |
| `working` | Currently executing on a ticket |
| `blocked` | Encountered an issue |

---

## progress.txt

Append-only log. Each agent appends learnings after completing work.

```
--- Planner Complete ---
Timestamp: 2026-01-15T10:02:00Z
Iterations used: 3
Created 8 issues: #1-#8

--- Backend Engineer: Ticket #5 ---
Timestamp: 2026-01-15T11:30:00Z
Iterations used: 7
Learnings:
- Used Prisma for user model, migrations auto-generated
- JWT auth pattern: access token (15min) + refresh token (7d)
- Added rate limiting middleware to auth routes

--- QA Agent: Ticket #5 Tests ---
Timestamp: 2026-01-15T12:00:00Z
Iterations used: 4
Learnings:
- Test DB uses SQLite in-memory for speed
- Found edge case: empty email string passes validation (filed #12)
```

### Format

Each entry follows:
```
--- {Agent Role}: {Context} ---
Timestamp: {ISO 8601}
Iterations used: {N}
Learnings:
- {key insight 1}
- {key insight 2}
```

---

## agents/{role}.md

Per-role accumulated knowledge. Agents read their file before starting work.

```markdown
# Backend Engineer — Accumulated Knowledge

## Patterns Discovered
- Auth uses JWT with refresh tokens stored in httpOnly cookies
- All API routes are prefixed with /api/v1
- Error responses follow { error: string, code: string, details?: object }

## Gotchas
- Prisma requires `npx prisma generate` after schema changes
- The test DB teardown is async — use afterAll, not afterEach

## Conventions
- Service layer pattern: controller → service → repository
- All services are injected via constructor (DI pattern)
```

---

## architecture-decisions.md

ADR (Architecture Decision Record) log maintained by the Architect.

```markdown
# Architecture Decision Records

## ADR-001: JWT Authentication with Refresh Tokens
**Date:** 2026-01-15
**Status:** Accepted
**Context:** Need user authentication for the API
**Decision:** Use JWT access tokens (15min) with httpOnly refresh tokens (7d)
**Consequences:** Requires token rotation endpoint, cookie handling on frontend

## ADR-002: Prisma ORM
**Date:** 2026-01-15
**Status:** Accepted
**Context:** Need database ORM for PostgreSQL
**Decision:** Use Prisma for type-safe queries and auto-generated migrations
**Consequences:** Schema-first approach, requires generate step in CI
```

---

## design-system.json

Frontend repos only. See `references/design-system-config.md` for full schema.

Managed by the Design Enforcer and read by the Frontend Engineer.
