#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "${OMDRS_LAB_CONFIRM:-}" == 'backend-only' ]] || { echo 'Chỉ lab ứng dụng: đặt OMDRS_LAB_CONFIRM=backend-only. Không tác động MySQL.'; exit 1; }
trap 'docker compose --env-file .env -f docker/compose.app.yml start backend-primary' EXIT
docker compose --env-file .env -f docker/compose.app.yml stop backend-primary
curl --fail --silent --show-error http://127.0.0.1:8080/health/ready
read -r -p 'Kiểm tra gateway và monitoring, Enter để khởi động lại Primary.' _
