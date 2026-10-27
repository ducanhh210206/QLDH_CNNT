#!/usr/bin/env bash
set -euo pipefail
curl --fail --silent --show-error "${API_URL:-http://127.0.0.1:5000}/health/live"
curl --fail --silent --show-error "${API_URL:-http://127.0.0.1:5000}/health/ready"
