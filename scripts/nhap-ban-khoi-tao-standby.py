"""Import one verified COMMENTED-GTID seed into a specific, empty local standby.

This does not configure replication or mark the source GTIDs as executed.
The MySQL password is requested interactively, or reused inside the explicitly
selected local container with --container-root-env; never written to a file.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import getpass
import hashlib
import json
import os
import re
import subprocess
import sys
import uuid
from pathlib import Path


def mysql_command(container: str, *, container_root_env: bool = False) -> list[str]:
    if container_root_env:
        # Expand the bootstrap secret only inside this exact local container.
        # Neither argv on Windows nor tool output contains its value.
        return ['docker', 'exec', '-i', container, 'sh', '-c',
                'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --no-defaults -u root '
                '--default-character-set=utf8mb4 --batch --skip-column-names']
    return ['docker', 'exec', '-i', '--env', 'MYSQL_PWD', container,
            'mysql', '--no-defaults', '-u', 'root', '--default-character-set=utf8mb4',
            '--batch', '--skip-column-names']


def mysql(container: str, env: dict[str, str], query: str, *, container_root_env: bool = False) -> str:
    result = subprocess.run(
        mysql_command(container, container_root_env=container_root_env),
        input=query.encode('utf-8'), env=env,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30,
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
    parser.add_argument('--container-root-env', action='store_true',
                        help='Dùng mật khẩu root đã có trong container Docker cục bộ, không in mật khẩu.')
    args = parser.parse_args()
    target_uuid = str(uuid.UUID(args.standby_uuid))
    folder = args.seed_directory.resolve(strict=True)
    if (folder / 'import-result.json').exists():
        raise ValueError('Ban seed da co bien ban import. Kiem tra trang thai thay vi nhap lai.')
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

    env = os.environ.copy()
    if args.container_root_env:
        env.pop('MYSQL_PWD', None)
    else:
        print(f'Nhap mat khau root cua MySQL Standby trong container {args.container} (khong phai mat khau Aiven).')
        env['MYSQL_PWD'] = getpass.getpass('Mat khau Standby: ')

    def run_sql(query: str) -> str:
        return mysql(args.container, env, query, container_root_env=args.container_root_env)

    try:
        query = (
            "SELECT @@server_uuid, @@GLOBAL.read_only, @@GLOBAL.super_read_only, "
            f"GTID_SUBSET(@@GLOBAL.gtid_executed, GTID_SUBTRACT(@@GLOBAL.gtid_executed, '{snapshot_gtid}')), "
            "(SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='order_management')"
        )
        fields = run_sql(query).split('\t')
        if len(fields) != 5 or fields[0].lower() != target_uuid or fields[1:] != ['1', '1', '1', '0']:
            raise RuntimeError('Standby khong dung UUID, chua chi doc, GTID bi trung, hoac da co database order_management.')
        if run_sql('SHOW REPLICA STATUS'):
            raise RuntimeError('Standby da co channel replication; dung va kiem tra truoc.')
        print('Da xac nhan dung Standby, checksum hop le, chua co schema va GTID khong trung.')

        restore_read_only = False
        try:
            restore_read_only = True
            run_sql('SET GLOBAL super_read_only=OFF; SET GLOBAL read_only=OFF;')
            result = subprocess.run(
                mysql_command(args.container, container_root_env=args.container_root_env),
                input=data, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            )
            if result.returncode:
                match = re.search(rb'ERROR\s+\d+(?:\s+\([A-Z0-9]+\))?', result.stderr)
                raise RuntimeError('Nhap that bai' + (': ' + match.group().decode() if match else '.') +
                                   ' Database co the da duoc tao mot phan; khong chay lai truoc khi kiem tra.')
        finally:
            if restore_read_only:
                try:
                    run_sql('SET GLOBAL read_only=ON; SET GLOBAL super_read_only=ON;')
                    state = run_sql('SELECT @@GLOBAL.read_only, @@GLOBAL.super_read_only')
                    if state != '1\t1':
                        raise RuntimeError('Khong xac nhan duoc read_only va super_read_only.')
                    print('Standby da duoc dat lai che do chi doc.')
                except Exception as exc:
                    print('CAN XU LY NGAY: Khong dat/xac minh duoc che do chi doc: ' + str(exc), file=sys.stderr)
                    raise

        actual = int(run_sql("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='order_management' AND TABLE_TYPE='BASE TABLE'"))
        if actual != expected_tables:
            raise RuntimeError(f'So bang sau nhap ({actual}) khong khop dump ({expected_tables}).')
        receipt = {
            'status': 'imported_read_only_gtid_not_applied',
            'completed_utc': datetime.now(timezone.utc).isoformat(),
            'container': args.container,
            'standby_uuid': target_uuid,
            'seed_sha256': manifest['sha256'],
            'snapshot_gtid': snapshot_gtid,
            'base_tables': actual,
        }
        with (folder / 'import-result.json').open('x', encoding='utf-8') as output:
            json.dump(receipt, output, indent=2)
        print(f'Da nhap {actual} bang vao Standby. Chua doi chieu tung ban ghi, chua ap dung GTID va chua bat replication.')
    finally:
        env.pop('MYSQL_PWD', None)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        print('LOI: ' + str(exc), file=sys.stderr)
        sys.exit(1)
