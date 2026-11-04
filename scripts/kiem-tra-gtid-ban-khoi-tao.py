"""Tạo hai câu SELECT để kiểm tra mốc GTID trong bản dump, không import dữ liệu."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import uuid
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('seed_directory', type=Path)
    parser.add_argument('--standby-uuid', required=True)
    args = parser.parse_args()

    folder = args.seed_directory.resolve(strict=True)
    manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8-sig'))
    if manifest.get('sql_file') != 'seed.sql' or manifest.get('database') != 'order_management':
        raise ValueError('Manifest không chỉ tới bản seed order_management được mong đợi.')
    data = (folder / 'seed.sql').read_bytes()
    if len(data) != manifest['size_bytes'] or hashlib.sha256(data).hexdigest() != manifest['sha256']:
        raise ValueError('Kích thước hoặc SHA-256 của seed.sql không khớp manifest.')
    text = data.decode('utf-8')
    if not re.search(r'^-- Dump completed on ', text, re.MULTILINE):
        raise ValueError('Không thấy dấu kết thúc dump.')
    matches = re.findall(r"/\*\s*SET\s+@@GLOBAL\.GTID_PURGED\s*=\s*'\+([^']+)'\s*;\s*\*/", text, re.IGNORECASE)
    if len(matches) != 1:
        raise ValueError('Không tìm thấy đúng một mốc GTID dạng chú thích trong dump.')
    gtid_set = ''.join(matches[0].split())
    if not re.fullmatch(r'[A-Za-z0-9_:\-,]+', gtid_set):
        raise ValueError('Mốc GTID có ký tự không hợp lệ.')
    standby_uuid = str(uuid.UUID(args.standby_uuid))

    source_sql = f"""-- CHỈ chạy trên kết nối Aiven - Primary. Chỉ đọc, không sửa dữ liệu.
SELECT @@server_uuid AS uuid_aiven,
       GTID_SUBSET('{gtid_set}', @@GLOBAL.gtid_executed) AS moc_co_trong_aiven,
       GTID_SUBSET(@@GLOBAL.gtid_purged, '{gtid_set}') AS co_so_de_kiem_tra_binlog;

-- Số đối tượng ngoài bảng thường trong defaultdb; 0 không chứng minh toàn server không có đối tượng khác.
SELECT 'views' AS loai, COUNT(*) AS so_luong
FROM information_schema.VIEWS WHERE TABLE_SCHEMA = 'defaultdb'
UNION ALL
SELECT 'routines', COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = 'defaultdb'
UNION ALL
SELECT 'events', COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA = 'defaultdb';
"""
    standby_sql = f"""-- CHỈ chạy trên kết nối MySQL Standby - 3307. Chỉ đọc, không sửa dữ liệu.
SELECT @@server_uuid = '{standby_uuid}' AS dung_standby,
       @@GLOBAL.read_only AS read_only,
       @@GLOBAL.super_read_only AS super_read_only,
       GTID_SUBSET(@@GLOBAL.gtid_executed,
                   GTID_SUBTRACT(@@GLOBAL.gtid_executed, '{gtid_set}')) AS gtid_standby_khong_trung_ban_sao,
       (SELECT COUNT(*) FROM information_schema.SCHEMATA
        WHERE SCHEMA_NAME = 'order_management') AS da_co_database_ung_dung;

SHOW REPLICA STATUS;
"""
    for name, content in (
        ('kiem-tra-gtid-aiven.sql', source_sql),
        ('kiem-tra-gtid-standby.sql', standby_sql),
    ):
        path = folder / name
        with path.open('x', encoding='utf-8', newline='\n') as output:
            output.write(content)
        print(path)


if __name__ == '__main__':
    main()
