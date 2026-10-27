#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' 'Demo an toàn: mở DevTools > Network > Offline để cắt riêng kết nối trình duyệt.' 'Nhập bản nháp, gửi yêu cầu, kiểm tra không báo thành công giả; Online rồi gửi lại cùng Idempotency-Key.' 'Không thay đổi Docker Network của MySQL thật. Xem docs/incident-runbook.md cho lab backend → DB.'
