#!/usr/bin/env bash
# Setup D1 database for FlowState Template Directory
# Usage: ./scripts/setup-d1.sh [local|staging|production]

set -euo pipefail

ENV="${1:-local}"

echo "Setting up D1 for environment: $ENV"

if [ "$ENV" = "local" ]; then
  echo "Applying migrations locally..."
  npx wrangler d1 migrations apply flowstate-templates-db --local
  echo "Running seed..."
  npx tsx src/scripts/seed.ts
  echo "Done! Local D1 is ready."
else
  echo "Creating D1 database (if needed)..."
  npx wrangler d1 create flowstate-templates-db --env "$ENV" 2>/dev/null || true
  echo "Applying migrations..."
  npx wrangler d1 migrations apply flowstate-templates-db --env "$ENV" --remote
  echo "Done! Remember to set secrets:"
  echo "  wrangler secret put AUTH_SECRET --env $ENV"
  echo "  wrangler secret put AUTH_RESEND_KEY --env $ENV"
fi
