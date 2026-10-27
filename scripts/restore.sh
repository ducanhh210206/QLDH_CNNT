#!/usr/bin/env bash
set -euo pipefail
: "${COOKIE_FILE:?Provide private Admin cookie jar}"
: "${BACKUP_ID:?Provide backup UUID}"
[[ "$BACKUP_ID" =~ ^[a-f0-9-]{36}$ ]] || exit 1
read -r -p 'Restore into a NEW isolated database? Type RESTORE: ' answer
[[ "$answer" == RESTORE ]] || exit 1
curl --fail-with-body --silent --show-error --cookie "$COOKIE_FILE" -H 'Content-Type: application/json' -d "{\"backup_id\":\"$BACKUP_ID\",\"confirmation\":\"RESTORE_TO_ISOLATED_DATABASE\"}" "${API_URL:-http://127.0.0.1:5000}/api/admin/restores"
