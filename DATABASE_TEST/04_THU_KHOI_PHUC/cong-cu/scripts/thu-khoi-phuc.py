"""Thử mysqldump/restore bằng dữ liệu giả trong hai MySQL Docker không nối mạng.

Không kết nối Aiven, không dùng container/volume của dự án và không xóa dữ liệu thật.
Các container thử được tạo tuần tự với tên ngẫu nhiên rồi tự xóa sau khi dừng.
"""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMAGE = 'mysql:8.4.13'
DATABASE = 'task4_don_hang_gia'
TZ = timezone(timedelta(hours=7))
IDENT = re.compile(r'^[A-Za-z0-9_]+$')


def run(args: list[str], *, data: bytes | None = None, timeout: int = 90) -> bytes:
    result = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    if result.returncode:
        message = result.stderr.decode('utf-8', errors='replace').strip()
        raise RuntimeError(f"Lenh {args[0]} khong thanh cong: {message[:1000]}")
    return result.stdout


def mysql(container: str, sql: str | bytes, *, database: str | None = None) -> bytes:
    args = ['docker', 'exec', '-i', container, 'mysql', '--no-defaults', '--user=root',
            '--default-character-set=utf8mb4', '--batch', '--raw', '--skip-column-names']
    if database:
        args.append(database)
    return run(args, data=sql.encode('utf-8') if isinstance(sql, str) else sql)


def start_container(name: str, server_id: int) -> None:
    run(['docker', 'run', '-d', '--rm', '--pull=never', '--name', name, '--network', 'none',
         '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', IMAGE, f'--server-id={server_id}',
         '--log-bin=mysql-bin', '--gtid-mode=ON', '--enforce-gtid-consistency=ON'])


def wait_ready(name: str) -> None:
    deadline = time.monotonic() + 100
    while time.monotonic() < deadline:
        try:
            if mysql(name, 'SELECT @@GLOBAL.skip_networking;').strip() == b'0':
                return
        except (RuntimeError, subprocess.TimeoutExpired):
            pass
        time.sleep(1)
    raise RuntimeError(f'MySQL thu {name} chua san sang sau 100 giay.')


def stop_container(name: str) -> None:
    run(['docker', 'stop', '--time', '10', name], timeout=30)


def snapshot(name: str) -> dict[str, dict[str, object]]:
    tables = mysql(name, "SELECT TABLE_NAME FROM information_schema.TABLES "
                   f"WHERE TABLE_SCHEMA='{DATABASE}' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME;")
    result: dict[str, dict[str, object]] = {}
    for table in tables.decode('utf-8').splitlines():
        if not IDENT.fullmatch(table):
            raise RuntimeError('Ten bang thu khong hop le.')
        keys = mysql(name, "SELECT COLUMN_NAME FROM information_schema.STATISTICS "
                     f"WHERE TABLE_SCHEMA='{DATABASE}' AND TABLE_NAME='{table}' "
                     "AND INDEX_NAME='PRIMARY' ORDER BY SEQ_IN_INDEX;").decode('utf-8').splitlines()
        if not keys or any(not IDENT.fullmatch(key) for key in keys):
            raise RuntimeError(f'Bang {table} khong co khoa chinh hop le de doi chieu.')
        order = ', '.join(f'`{key}`' for key in keys)
        count = int(mysql(name, f'SELECT COUNT(*) FROM `{DATABASE}`.`{table}`;').strip())
        rows = mysql(name, f'SELECT * FROM `{DATABASE}`.`{table}` ORDER BY {order};')
        ddl = mysql(name, f'SHOW CREATE TABLE `{DATABASE}`.`{table}`;')
        result[table] = {'count': count, 'rows_sha256': hashlib.sha256(rows).hexdigest(),
                         'schema_sha256': hashlib.sha256(ddl).hexdigest()}
    return result


def main() -> int:
    started = datetime.now(TZ)
    suffix = uuid.uuid4().hex[:10]
    folder = ROOT / 'docs' / 'evidence' / 'restore' / (started.strftime('%Y%m%d_%H%M%S') + '_' + suffix)
    source = 'task4-gia-source-' + suffix
    target = 'task4-gia-restore-' + suffix
    active: str | None = None
    fixture = (ROOT / 'database' / 'seeds' / 'task4_du_lieu_gia.sql').read_bytes()
    schema = (ROOT / 'database' / 'init' / 'schema.sql').read_bytes()
    run(['docker', 'image', 'inspect', IMAGE], timeout=30)
    folder.mkdir(parents=True, exist_ok=False)
    backup = folder / 'backup-du-lieu-gia.sql'
    print('Dang tao MySQL nguon thu khong co mang...', flush=True)
    try:
        start_container(source, 91)
        active = source
        wait_ready(source)
        mysql(source, f'CREATE DATABASE `{DATABASE}` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;')
        mysql(source, schema, database=DATABASE)
        mysql(source, fixture, database=DATABASE)
        before = snapshot(source)
        if len(before) != 13 or before.get('orders', {}).get('count') != 2 or before.get('order_status_history', {}).get('count') != 3:
            raise RuntimeError('Du lieu nguon gia khong dung so bang/ban ghi du kien.')
        print('Dang sao luu bang mysqldump...', flush=True)
        dump = run(['docker', 'exec', source, 'mysqldump', '--no-defaults', '--user=root',
                    '--default-character-set=utf8mb4', '--single-transaction', '--source-data=2',
                    '--set-gtid-purged=COMMENTED', '--quick', '--no-tablespaces',
                    '--routines', '--events', '--triggers', '--skip-add-drop-table', '--skip-add-locks',
                    '--databases', DATABASE], timeout=120)
        dump_text = dump.decode('utf-8')
        if not re.search(r'^-- Dump completed on ', dump_text, re.MULTILINE) or \
           not re.search(r'^USE\s+`task4_don_hang_gia`;', dump_text, re.MULTILINE) or \
           re.search(r'^DROP\s+(DATABASE|SCHEMA)', dump_text, re.MULTILINE | re.IGNORECASE):
            raise RuntimeError('File dump gia khong dat kiem tra an toan/co dau ket thuc.')
        backup.write_bytes(dump)
        backup_hash = hashlib.sha256(dump).hexdigest()
        disk_dump = backup.read_bytes()
        if len(disk_dump) != len(dump) or hashlib.sha256(disk_dump).hexdigest() != backup_hash:
            raise RuntimeError('File backup gia tren dia khong khop checksum; dung restore.')
        stop_container(source)
        active = None

        print('Dang khoi phuc vao MySQL thu moi khong co mang...', flush=True)
        start_container(target, 92)
        active = target
        wait_ready(target)
        mysql(target, disk_dump)
        after = snapshot(target)
        completed = datetime.now(TZ)
        names = sorted(set(before) | set(after))
        rows = []
        passed = set(before) == set(after)
        for table in names:
            old, new = before.get(table), after.get(table)
            count_match = old is not None and new is not None and old['count'] == new['count']
            content_match = old is not None and new is not None and old['rows_sha256'] == new['rows_sha256']
            schema_match = old is not None and new is not None and old['schema_sha256'] == new['schema_sha256']
            match = count_match and content_match and schema_match
            passed = passed and match
            rows.append({'table': table, 'before': old, 'after': new, 'count_match': count_match,
                         'content_match': content_match, 'schema_match': schema_match, 'pass': match})

        report = {'result': 'PASS' if passed else 'FAIL', 'started_at': started.isoformat(),
                  'completed_at': completed.isoformat(), 'source_database': DATABASE, 'target_database': DATABASE,
                  'source_and_target': 'separate sequential disposable Docker containers, network none',
                  'mysql_image': IMAGE, 'backup_file': backup.name, 'backup_size_bytes': len(dump),
                  'backup_sha256': backup_hash, 'tables': rows}
        (folder / 'ket-qua.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

        lines = [
            '# Task 4 — Kết quả thử khôi phục dữ liệu giả', '',
            f"- Kết quả: **{report['result']}**.",
            f"- Bắt đầu: {started.strftime('%d/%m/%Y %H:%M:%S %z')}; hoàn thành: {completed.strftime('%d/%m/%Y %H:%M:%S %z')}.",
            '- Nguồn và đích: hai container MySQL 8.4.13 tạo lần lượt, riêng biệt, không nối mạng và không mở cổng.',
            '- Database thử: `task4_don_hang_gia`; cấu trúc từ `database/init/schema.sql`, dữ liệu từ `database/seeds/task4_du_lieu_gia.sql`.',
            '- Không truy cập Aiven, MySQL standby hoặc dữ liệu thật trong phép thử này.',
            f'- Bản sao: [backup-du-lieu-gia.sql]({backup.name}); kích thước {len(dump)} byte; SHA-256: `{backup_hash}`.',
            '- Bản sao dùng mysqldump với cùng các tùy chọn snapshot/GTID cơ bản như script khởi tạo; GTID trong dump là chú thích, không thiết lập replication.',
            '- Nội dung mỗi bảng được đọc đầy đủ, sắp xếp theo khóa chính và so sánh SHA-256; cấu trúc được so bằng SHA-256 của `SHOW CREATE TABLE`.',
            '', '| Bảng | Trước backup | Sau restore | Nội dung | Cấu trúc |',
            '|---|---:|---:|---|---|',
        ]
        for item in rows:
            old, new = item['before'], item['after']
            lines.append(f"| `{item['table']}` | {old['count'] if old else 'thiếu'} | {new['count'] if new else 'thiếu'} | "
                         f"{'Khớp' if item['content_match'] else 'Không khớp'} | {'Khớp' if item['schema_match'] else 'Không khớp'} |")
        lines += ['', 'Dữ liệu mẫu gồm 2 đơn, 3 dòng lịch sử trạng thái, 1 sản phẩm và 1 tài khoản giả; '
                  'hai đơn có số lượng, giá trị và trạng thái khác nhau, tên có tiếng Việt. '
                  'Đây là thử nghiệm với dữ liệu giả và MySQL cô lập; không chứng minh khả năng khôi phục bản backup dữ liệu thật, '
                  'ứng dụng, failover hoặc mọi trường hợp sự cố.', '',
                  'Xem chi tiết kết quả và mã băm từng bảng tại [ket-qua.json](ket-qua.json).', '']
        (folder / 'ket-qua.md').write_text('\n'.join(lines), encoding='utf-8')
        print(f"Ket qua: {report['result']}; so bang: {len(rows)}; orders: {before['orders']['count']} -> {after.get('orders', {}).get('count', 'thieu')}", flush=True)
        print(f'Bang doi chieu: {folder / "ket-qua.md"}', flush=True)
        print(f'File backup gia: {backup}', flush=True)
        return 0 if passed else 2
    finally:
        if active:
            try:
                stop_container(active)
            except (RuntimeError, subprocess.TimeoutExpired) as exc:
                print(f'Khong the dung container thu {active}: {exc}', file=sys.stderr)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, RuntimeError, ValueError, subprocess.TimeoutExpired) as exc:
        print('LOI: ' + str(exc), file=sys.stderr)
        sys.exit(1)
