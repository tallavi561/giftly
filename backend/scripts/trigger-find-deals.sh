#!/bin/bash
# Manually triggers the deal-finder cron job (GET /api/cron/find-deals).
# Reads ADMIN_SECRET straight out of backend/.env so you don't have to paste it anywhere.
# Costs real Gemini quota (search grounding) and writes real rows to deal_alerts —
# the endpoint itself no-ops if it already ran today (see hasRunToday('find_deals')
# in backend/src/routes/cron.ts), so re-running this same-day is safe but pointless.
# Usage: ./scripts/trigger-find-deals.sh   (run from the backend/ directory)
#    or: BASE_URL=https://your-deployed-backend.com ./scripts/trigger-find-deals.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Can't find $ENV_FILE" >&2
  exit 1
fi

ADMIN_SECRET=$(grep -E '^ADMIN_SECRET=' "$ENV_FILE" | cut -d '=' -f2-)
if [ -z "$ADMIN_SECRET" ]; then
  echo "ADMIN_SECRET not set in $ENV_FILE" >&2
  exit 1
fi

BASE_URL="${BASE_URL:-http://localhost:3001}"

echo "GET $BASE_URL/api/cron/find-deals ..."
curl -sS "$BASE_URL/api/cron/find-deals" \
  -H "x-admin-secret: $ADMIN_SECRET" \
  | python -m json.tool 2>/dev/null || true
echo ""
