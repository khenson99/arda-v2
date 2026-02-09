# CI Quality Gates Runbook

Documentation for the Arda V2 CI/CD pipeline quality gates, debugging failures, and required checks.

## Pipeline Overview

The CI pipeline runs on every push to `main` and every pull request targeting `main`. It consists of five sequential/parallel gates.

```
Gate 1: Lint & Typecheck  (required)
    |
    +---> Gate 2: Unit Tests       (required, parallel per workspace)
    +---> Gate 3: Integration Tests (required, parallel with Gate 2)
    +---> Gate 4: Migration Safety  (PR only, advisory)
              |
              v
Gate 5: Docker Builds (main only, parallel per service)
```

## Gate Descriptions

### Gate 1: Lint & Typecheck

| Property | Value |
|----------|-------|
| **Job name** | `lint-typecheck` |
| **Timeout** | 10 minutes |
| **Required** | Yes |
| **Triggers** | All pushes and PRs |

**What it checks:**
- All packages build successfully (TypeScript compilation)
- No type errors across the entire monorepo
- ESLint rules pass (currently advisory via `continue-on-error`)

**Common failures:**
- Type errors from interface changes not propagated to consumers
- Missing exports in package index files
- Import path errors after file moves

**How to debug:**
```bash
# Reproduce locally
npm ci
npx turbo build
npx turbo lint
```

### Gate 2: Unit Tests

| Property | Value |
|----------|-------|
| **Job name** | `unit-tests` |
| **Timeout** | 10 minutes per workspace |
| **Required** | Yes |
| **Triggers** | All pushes and PRs |
| **Strategy** | Parallel matrix across workspaces |

**Workspaces tested:**
- `@arda/jobs`, `@arda/storage`, `@arda/search`, `@arda/observability`
- `@arda/kanban`, `@arda/orders`, `@arda/notifications`

**What it checks:**
- Vitest unit tests pass for each workspace
- Tests run in isolation (no external dependencies)

**Common failures:**
- Mock setup issues (use `vi.hoisted()` for mock declarations)
- Snapshot mismatches after intentional changes
- Flaky tests due to timing or random data

**How to debug:**
```bash
# Run specific workspace tests
npx turbo test --filter=@arda/orders

# Run with verbose output
cd services/orders && npx vitest run --reporter=verbose
```

### Gate 3: Integration Tests

| Property | Value |
|----------|-------|
| **Job name** | `integration-tests` |
| **Timeout** | 15 minutes |
| **Required** | Yes |
| **Triggers** | All pushes and PRs |
| **Services** | PostgreSQL 16, Redis 7 |

**What it checks:**
- Tests that require database connectivity pass
- Tests that require Redis pass
- Database schema can be applied cleanly

**Common failures:**
- Schema drift (migration not generated for model changes)
- Port conflicts with service containers
- Database connection timeouts

**How to debug:**
```bash
# Reproduce locally with Docker services running
docker compose up -d postgres redis
export DATABASE_URL=postgresql://arda:arda_dev_password@localhost:5432/arda_v2
export REDIS_URL=redis://localhost:6379
npx turbo test
```

### Gate 4: Migration Safety

| Property | Value |
|----------|-------|
| **Job name** | `migration-check` |
| **Timeout** | 10 minutes |
| **Required** | No (advisory) |
| **Triggers** | Pull requests only |

**What it checks:**
- Drizzle Kit can apply migrations cleanly
- No destructive schema changes without explicit migration

**Common failures:**
- Schema changes without corresponding migration files
- Conflicting migration sequences

**How to debug:**
```bash
# Check migration status
./scripts/migrate.sh status

# Generate missing migration
./scripts/migrate.sh generate
```

### Gate 5: Docker Builds

| Property | Value |
|----------|-------|
| **Job name** | `docker-build` |
| **Timeout** | 10 minutes per service |
| **Required** | Yes (on main only) |
| **Triggers** | Push to main only |
| **Strategy** | Parallel matrix across 6 services |

**Services built:**
- api-gateway, auth, catalog, kanban, notifications, orders

**What it checks:**
- Docker images build successfully for all services
- No missing dependencies or build-time errors
- GHA layer cache is maintained for build speed

**Common failures:**
- Missing `package.json` dependencies
- Build context issues (files not included in Docker context)
- Base image pull failures

**How to debug:**
```bash
# Build specific service locally
docker build --build-arg SERVICE=orders -t arda/orders:test .
```

## Required vs Optional Checks

| Check | Required for Merge | Blocking |
|-------|--------------------|----------|
| Lint & Typecheck | Yes | Yes |
| Unit Tests (all) | Yes | Yes |
| Integration Tests | Yes | Yes |
| Migration Safety | No | Advisory |
| Docker Builds | N/A (main only) | N/A |

## Pipeline Timing Expectations

| Gate | Expected Duration | Notes |
|------|-------------------|-------|
| Lint & Typecheck | 2-4 minutes | Depends on cache hit |
| Unit Tests | 1-3 minutes each | Run in parallel |
| Integration Tests | 3-5 minutes | Includes DB setup |
| Migration Safety | 2-3 minutes | |
| Docker Builds | 3-6 minutes each | GHA cache helps |
| **Total (PR)** | **5-8 minutes** | Gates 2-4 run in parallel |
| **Total (main push)** | **10-15 minutes** | Including Docker builds |

## Concurrency

The pipeline uses concurrency groups with `cancel-in-progress: true`. This means:
- New pushes to the same branch cancel in-progress runs
- Different branches run independently
- This prevents resource waste on rapidly updated PRs

## Troubleshooting

### "Node modules not found" errors

The `npm ci` step uses the npm lockfile. If it fails:
1. Ensure `package-lock.json` is committed
2. Run `npm ci` locally to verify

### Timeout failures

If a gate times out:
1. Check for infinite loops or hanging processes
2. Look for network requests that may be timing out
3. Consider if the test suite has grown too large

### Flaky tests

If tests pass locally but fail in CI:
1. Check for timing-dependent assertions
2. Verify no reliance on local system state
3. Look for port conflicts between parallel jobs
4. Ensure database cleanup between test suites
