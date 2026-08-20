#!/bin/bash
# Manually triggers the self-recommendations batch job (POST /api/self-recommendations/generate).
# Reads ADMIN_SECRET straight out of backend/.env so you don't have to paste it anywhere.
# Usage: ./scripts/generate-self-recs.sh   (run from the backend/ directory)
#    or: BASE_URL=https://your-deployed-backend.com ./scripts/generate-self-recs.sh

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

echo "POST $BASE_URL/api/self-recommendations/generate ..."
curl -sS -X POST "$BASE_URL/api/self-recommendations/generate" \
  -H "x-admin-secret: $ADMIN_SECRET" \
  | python -m json.tool 2>/dev/null || true
echo ""
