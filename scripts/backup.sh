#!/usr/bin/env bash
set -euo pipefail
: "${COOKIE_FILE:?Provide private cookie jar from an authenticated Admin session}"
curl --fail-with-body --silent --show-error --cookie "$COOKIE_FILE" -H 'Content-Type: application/json' -d '{}' "${API_URL:-http://127.0.0.1:5000}/api/admin/backups"
