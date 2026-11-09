#!/usr/bin/env bash
# The repo's checks. Exit 0 only when the branch is fit to review.
#
# The gate runs this script from the main checkout with the job's worktree as
# the working directory. Keep it fast, deterministic and non-interactive: no
# watch modes, no prompts, nothing that rewrites files.
#
# Mirrors .github/workflows/ci.yml, plus the desktop typecheck.
set -euo pipefail

npm ci --prefer-offline --no-audit --no-fund

# Integration tests wipe their database before each test, so every checkout
# gets its own. Exported vars take precedence over apps/web/.env.test.
db="screen_record_test_$(basename "$PWD" | tr -c 'A-Za-z0-9_' '_')"
export DATABASE_URL="mongodb://localhost:27018/${db}?replicaSet=rs0&directConnection=true"
export DESKTOP_INGEST_SECRET="factory-test-secret"
export APP_URL="http://localhost:3000"

# Reuse a Mongo replica set already on 27018; otherwise start the test one.
if ! nc -z localhost 27018 >/dev/null 2>&1; then
  docker compose -p screen-record-test -f docker-compose.test.yml up -d --wait
fi

# Web
npm run lint -w screen-record-web
npm run test:unit
npm run test:integration

# Desktop (the native Swift helper is not built here)
npm run test:desktop
(cd apps/desktop && npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tsconfig.node.json)

npm run build:web
