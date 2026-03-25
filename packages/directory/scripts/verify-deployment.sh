#!/usr/bin/env bash
# Deployment verification script for FlowState Marketplace
# Usage: ./scripts/verify-deployment.sh <base-url>
# Example: ./scripts/verify-deployment.sh https://marketplace-staging.epicflowstate.com

set -euo pipefail

BASE_URL="${1:?Usage: $0 <base-url>}"

echo "Verifying deployment at: ${BASE_URL}"
echo "========================================="

PASS=0
FAIL=0

check() {
  local method="$1"
  local path="$2"
  local expected_status="$3"
  local description="$4"

  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "${BASE_URL}${path}")

  if [ "$status" = "$expected_status" ]; then
    echo "  PASS  ${method} ${path} -> ${status} (${description})"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  ${method} ${path} -> ${status} (expected ${expected_status}) (${description})"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "Public API Routes"
echo "-----------------"
check GET  "/api/templates"           200 "List templates"
check GET  "/api/listings"            200 "List listings"
check GET  "/api/templates/categories" 200 "Template categories"
check GET  "/api/listings/categories"  200 "Listing categories"

echo ""
echo "Auth-Protected Routes (expect 401)"
echo "-----------------------------------"
check GET  "/api/admin/templates"     401 "Admin templates (no auth)"
check GET  "/api/admin/analytics"     401 "Admin analytics (no auth)"
check GET  "/api/developer/apps"      401 "Developer apps (no auth)"

echo ""
echo "Cron Route (expect 401 without token)"
echo "--------------------------------------"
check GET  "/api/cron/sync-downloads" 401 "Cron sync (no token)"

echo ""
echo "Media Route (expect 404 for missing key)"
echo "-----------------------------------------"
check GET  "/api/media/nonexistent"   404 "Media not found"

echo ""
echo "========================================="
echo "Results: ${PASS} passed, ${FAIL} failed"

if [ "$FAIL" -gt 0 ]; then
  echo "DEPLOYMENT VERIFICATION FAILED"
  exit 1
fi

echo "DEPLOYMENT VERIFIED"
