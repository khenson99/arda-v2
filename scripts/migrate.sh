#!/usr/bin/env bash
# ─── Arda V2 Database Migration Helper ───────────────────────────────
# Usage:
#   ./scripts/migrate.sh generate  — Generate migration SQL from schema changes
#   ./scripts/migrate.sh migrate   — Apply pending migrations
#   ./scripts/migrate.sh push      — Push schema directly (dev only, no migration files)
#   ./scripts/migrate.sh status    — Show current migration status
#
# Requires: DATABASE_URL environment variable
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set."
  echo "  export DATABASE_URL=postgresql://arda:arda_dev_password@localhost:5432/arda_v2"
  exit 1
fi

cd "$ROOT_DIR"

case "${1:-help}" in
  generate)
    echo "Generating migration from schema diff..."
    npm run db:generate
    echo "Done. Check packages/db/drizzle/ for new migration files."
    ;;
  migrate)
    echo "Applying pending migrations..."
    npm run db:migrate
    echo "Migrations applied."
    ;;
  push)
    echo "Pushing schema directly to database (dev mode)..."
    npx turbo run db:push --filter=@arda/db
    echo "Schema pushed."
    ;;
  status)
    echo "Migration files in packages/db/drizzle/:"
    ls -la packages/db/drizzle/ 2>/dev/null || echo "  (no migrations generated yet)"
    ;;
  help|*)
    echo "Usage: $0 {generate|migrate|push|status}"
    echo ""
    echo "  generate  — Generate migration SQL from schema changes"
    echo "  migrate   — Apply pending migrations to DATABASE_URL"
    echo "  push      — Push schema directly (dev only)"
    echo "  status    — Show migration file status"
    ;;
esac
