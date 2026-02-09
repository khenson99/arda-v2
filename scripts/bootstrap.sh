#!/usr/bin/env bash
# ─── Arda V2 Bootstrap Script ─────────────────────────────────────────
# One-command setup for local development environment.
#
# Usage:
#   ./scripts/bootstrap.sh
#
# What it does:
#   1. Checks prerequisites (Node 20+, Docker, Docker Compose)
#   2. Copies .env.example to .env (if .env does not exist)
#   3. Starts Docker containers (PostgreSQL, Redis)
#   4. Waits for database and Redis readiness
#   5. Installs npm dependencies
#   6. Runs database migrations
#   7. Builds all packages and services
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

# ─── Colors ──────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; }

# ─── Prerequisite Checks ────────────────────────────────────────────
info "Checking prerequisites..."

check_command() {
  if ! command -v "$1" &> /dev/null; then
    error "$1 is not installed. Please install $1 first."
    exit 1
  fi
}

check_version() {
  local cmd="$1"
  local min_version="$2"
  local current_version="$3"

  if [ "$(printf '%s\n' "$min_version" "$current_version" | sort -V | head -n1)" != "$min_version" ]; then
    error "$cmd version $current_version is below minimum $min_version"
    exit 1
  fi
  success "$cmd $current_version (>= $min_version)"
}

# Node.js
check_command node
NODE_VERSION=$(node --version | sed 's/v//')
check_version "Node.js" "20.0.0" "$NODE_VERSION"

# npm
check_command npm
NPM_VERSION=$(npm --version)
check_version "npm" "10.0.0" "$NPM_VERSION"

# Docker
check_command docker
DOCKER_VERSION=$(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
check_version "Docker" "24.0.0" "$DOCKER_VERSION"

# Docker Compose
if ! docker compose version &> /dev/null; then
  error "Docker Compose (v2) is not available. Please install Docker Compose."
  exit 1
fi
COMPOSE_VERSION=$(docker compose version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
check_version "Docker Compose" "2.20.0" "$COMPOSE_VERSION"

# Git
check_command git

echo ""

# ─── Environment File ────────────────────────────────────────────────
if [ ! -f .env ]; then
  info "Creating .env from .env.example..."
  cp .env.example .env
  success ".env file created. Edit it if you need custom values."
else
  success ".env file already exists."
fi

echo ""

# ─── Docker Containers ──────────────────────────────────────────────
info "Starting Docker containers (PostgreSQL, Redis)..."
docker compose up -d postgres redis

# ─── Wait for PostgreSQL ─────────────────────────────────────────────
info "Waiting for PostgreSQL to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0
until docker compose exec -T postgres pg_isready -U arda -d arda_v2 &> /dev/null; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]; then
    error "PostgreSQL did not become ready after $MAX_RETRIES attempts."
    error "Check logs: docker compose logs postgres"
    exit 1
  fi
  sleep 1
done
success "PostgreSQL is ready."

# ─── Wait for Redis ──────────────────────────────────────────────────
info "Waiting for Redis to be ready..."
RETRY_COUNT=0
until docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]; then
    error "Redis did not become ready after $MAX_RETRIES attempts."
    error "Check logs: docker compose logs redis"
    exit 1
  fi
  sleep 1
done
success "Redis is ready."

echo ""

# ─── Install Dependencies ───────────────────────────────────────────
info "Installing npm dependencies..."
npm ci
success "Dependencies installed."

echo ""

# ─── Database Migrations ────────────────────────────────────────────
info "Running database migrations..."
if [ -f scripts/migrate.sh ]; then
  bash scripts/migrate.sh push
  success "Database schema pushed."
else
  warn "migrate.sh not found. Skipping migrations."
fi

echo ""

# ─── Build ───────────────────────────────────────────────────────────
info "Building all packages and services..."
npm run build
success "Build complete."

echo ""

# ─── Done ────────────────────────────────────────────────────────────
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Arda V2 environment is ready!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "  Start development:  npm run dev"
echo "  Frontend only:      npm run dev --filter=@arda/web"
echo "  Database studio:    npm run db:studio"
echo ""
echo "  Services:"
echo "    API Gateway:      http://localhost:3000"
echo "    Auth:             http://localhost:3001"
echo "    Catalog:          http://localhost:3002"
echo "    Kanban:           http://localhost:3003"
echo "    Orders:           http://localhost:3004"
echo "    Notifications:    http://localhost:3005"
echo "    Frontend:         http://localhost:5173"
echo ""
