"""Import one verified COMMENTED-GTID seed into a specific, empty local standby.

This does not configure replication or mark the source GTIDs as executed.
The MySQL password is requested interactively and never written to a file.
"""
from __future__ import annotations

import argparse
import getpass
import hashlib
import json
import os
import re
import subprocess
import sys
import uuid
from pathlib import Path


def mysql(container: str, env: dict[str, str], query: str) -> str:
    result = subprocess.run(
        ['docker', 'exec', '--env', 'MYSQL_PWD', container, 'mysql', '-u', 'root',
         '--batch', '--skip-column-names', f'--execute={query}'],
        env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30,
    )
    if result.returncode:
        match = re.search(rb'ERROR\s+\d+(?:\s+\([A-Z0-9]+\))?', result.stderr)
        raise RuntimeError('MySQL query failed' + (': ' + match.group().decode() if match else '.'))
    return result.stdout.decode('utf-8').strip()


def main() -> None:
    parser = argparse.ArgumentParser(description='Nhập bản seed vào MySQL Standby cục bộ, không khởi động replication.')
    parser.add_argument('seed_directory', type=Path)
    parser.add_argument('--container', required=True)
    parser.add_argument('--standby-uuid', required=True)
    args = parser.parse_args()
    target_uuid = str(uuid.UUID(args.standby_uuid))
    folder = args.seed_directory.resolve(strict=True)
    manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8-sig'))
    if manifest.get('sql_file') != 'seed.sql' or manifest.get('database') != 'order_management' or manifest.get('gtid_setting') != 'COMMENTED':
        raise ValueError('Manifest không khớp định dạng bản khởi tạo được hỗ trợ.')
    data = (folder / 'seed.sql').read_bytes()
    if len(data) != manifest['size_bytes'] or hashlib.sha256(data).hexdigest() != manifest['sha256']:
        raise ValueError('Kích thước hoặc checksum của seed.sql không khớp manifest.')
    text = data.decode('utf-8')
    if not re.search(r'^-- Dump completed on ', text, re.MULTILINE):
        raise ValueError('Không thấy dòng kết thúc dump.')
    matches = re.findall(r"/\*\s*SET\s+@@GLOBAL\.GTID_PURGED\s*=\s*'\+([^']+)'\s*;\s*\*/", text, re.IGNORECASE)
    if len(matches) != 1:
        raise ValueError('Không thấy đúng một GTID nguồn dạng chú thích.')
    snapshot_gtid = ''.join(matches[0].split())
    if not re.fullmatch(r'[A-Za-z0-9_:\-,]+', snapshot_gtid):
        raise ValueError('GTID nguồn có ký tự không hợp lệ.')
    expected_tables = len(re.findall(r'^CREATE TABLE\s+`', text, re.IGNORECASE | re.MULTILINE))
    if not expected_tables:
        raise ValueError('Không tìm thấy định nghĩa bảng trong bản dump.')

    print(f'Nhap mat khau root cua MySQL Standby trong container {args.container} (khong phai mat khau Aiven).')
    password = getpass.getpass('Mat khau Standby: ')
    env = os.environ.copy()
    env['MYSQL_PWD'] = password
    del password
    try:
        query = (
            "SELECT @@server_uuid, @@GLOBAL.read_only, @@GLOBAL.super_read_only, "
            f"GTID_SUBSET(@@GLOBAL.gtid_executed, GTID_SUBTRACT(@@GLOBAL.gtid_executed, '{snapshot_gtid}')), "
            "(SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='order_management')"
        )
        fields = mysql(args.container, env, query).split('\t')
        if len(fields) != 5 or fields[0].lower() != target_uuid or fields[1:] != ['1', '1', '1', '0']:
            raise RuntimeError('Standby khong dung UUID, chua chi doc, GTID bi trung, hoac da co database order_management.')
        if mysql(args.container, env, 'SHOW REPLICA STATUS'):
            raise RuntimeError('Standby da co channel replication; dung va kiem tra truoc.')
        print('Da xac nhan dung Standby, checksum hop le, chua co schema va GTID khong trung.')

        restore_read_only = False
        try:
            restore_read_only = True
            mysql(args.container, env, 'SET GLOBAL super_read_only=OFF; SET GLOBAL read_only=OFF;')
            result = subprocess.run(
                ['docker', 'exec', '-i', '--env', 'MYSQL_PWD', args.container, 'mysql', '-u', 'root',
                 '--default-character-set=utf8mb4', '--batch'],
                input=data, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            )
            if result.returncode:
                match = re.search(rb'ERROR\s+\d+(?:\s+\([A-Z0-9]+\))?', result.stderr)
                raise RuntimeError('Nhap that bai' + (': ' + match.group().decode() if match else '.') +
                                   ' Database co the da duoc tao mot phan; khong chay lai truoc khi kiem tra.')
        finally:
            if restore_read_only:
                try:
                    mysql(args.container, env, 'SET GLOBAL read_only=ON; SET GLOBAL super_read_only=ON;')
                    state = mysql(args.container, env, 'SELECT @@GLOBAL.read_only, @@GLOBAL.super_read_only')
                    if state != '1\t1':
                        raise RuntimeError('Khong xac nhan duoc read_only va super_read_only.')
                    print('Standby da duoc dat lai che do chi doc.')
                except Exception as exc:
                    print('CAN XU LY NGAY: Khong dat/xac minh duoc che do chi doc: ' + str(exc), file=sys.stderr)
                    raise

        actual = int(mysql(args.container, env, "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='order_management' AND TABLE_TYPE='BASE TABLE'"))
        if actual != expected_tables:
            raise RuntimeError(f'So bang sau nhap ({actual}) khong khop dump ({expected_tables}).')
        print(f'Da nhap {actual} bang vao Standby. Chua doi chieu tung ban ghi, chua ap dung GTID va chua bat replication.')
    finally:
        env.pop('MYSQL_PWD', None)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        print('LOI: ' + str(exc), file=sys.stderr)
        sys.exit(1)
