"""TC12/TC15: restore a verified backup and test data loss in disposable offline MySQLs.

The production/standby containers, volumes, databases and networks are never used.
The production-derived dump is fed over stdin into an unconnected container, never
copied into the evidence folder; reports contain counts and hashes only.
"""
from __future__ import annotations
import hashlib
import json
import re
import subprocess
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / 'database/backups/seed_20261118_011320_dc4e8545'
IMAGE = 'mysql:8.4.13'
LABEL = 'omdrs-isolated-kt3'
IDENT = re.compile(r'^[A-Za-z0-9_]+$')


def now():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds')


def run(args, data=None, timeout=90):
    proc = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    if proc.returncode:
        stderr = proc.stderr.decode('utf-8', 'replace')
        mysql_error = re.search(r'ERROR\s+\d+(?:\s+\([A-Z0-9]+\))?', stderr)
        raise RuntimeError(f'{args[0]} exit {proc.returncode}; {mysql_error.group() if mysql_error else "see local Docker service status"}')
    return proc.stdout


def inspect(container):
    item = json.loads(run(['docker', 'inspect', container]))[0]
    if item['Config'].get('Labels', {}).get('org.omdrs.drill') != LABEL:
        raise RuntimeError('Container label mismatch; refusing operation.')
    if item['HostConfig']['NetworkMode'] != 'none' or item['HostConfig'].get('PortBindings'):
        raise RuntimeError('Container is not network-isolated; refusing operation.')
    if not item['Name'].lstrip('/').startswith('omdrs-drill-'):
        raise RuntimeError('Unexpected container name; refusing operation.')
    return item['Id']


def start(suffix, role):
    name = f'omdrs-drill-{role}-{suffix}'
    cid = run(['docker', 'run', '-d', '--rm', '--pull=never', '--name', name,
               '--network', 'none', '--label', f'org.omdrs.drill={LABEL}',
               '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', IMAGE,
               '--default-time-zone=+00:00']).decode().strip()
    if inspect(cid) != cid:
        raise RuntimeError('Container identity mismatch.')
    deadline = time.monotonic() + 100
    while time.monotonic() < deadline:
        try:
            # The image starts a temporary --skip-networking server while
            # initializing; it must not be mistaken for the final server.
            if mysql(cid, 'SELECT @@GLOBAL.skip_networking;').strip() == b'0':
                return cid
        except (RuntimeError, subprocess.TimeoutExpired):
            pass
        time.sleep(1)
    try:
        stop(cid)
    finally:
        raise RuntimeError('Isolated MySQL did not become ready.')


def stop(cid):
    if inspect(cid) != cid:
        raise RuntimeError('Container changed; cannot clean up.')
    run(['docker', 'stop', '--time', '10', cid], timeout=35)


def mysql(cid, sql, db=None):
    args = ['docker', 'exec', '-i', cid, 'mysql', '--no-defaults', '--user=root',
            '--default-character-set=utf8mb4', '--batch', '--raw', '--skip-column-names']
    if db:
        args += [db]
    return run(args, data=sql if isinstance(sql, bytes) else sql.encode('utf-8'), timeout=120)


def snapshot(cid, db):
    if not IDENT.fullmatch(db): raise RuntimeError('Unexpected database name')
    raw = mysql(cid, "SELECT TABLE_NAME FROM information_schema.TABLES WHERE "
                f"TABLE_SCHEMA='{db}' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME;")
    result = {}
    for table in raw.decode('utf-8').splitlines():
        if not IDENT.fullmatch(table): raise RuntimeError('Unexpected table name')
        cols = mysql(cid, "SELECT COLUMN_NAME FROM information_schema.STATISTICS WHERE "
                     f"TABLE_SCHEMA='{db}' AND TABLE_NAME='{table}' AND INDEX_NAME='PRIMARY' ORDER BY SEQ_IN_INDEX;")
        keys = cols.decode('utf-8').splitlines()
        if not keys or any(not IDENT.fullmatch(k) for k in keys):
            raise RuntimeError('A table lacks a primary key; cannot reliably compare data.')
        ordering = ','.join(f'`{key}`' for key in keys)
        rows = mysql(cid, f'SELECT * FROM `{db}`.`{table}` ORDER BY {ordering};')
        count = int(mysql(cid, f'SELECT COUNT(*) FROM `{db}`.`{table}`;'))
        ddl = mysql(cid, f'SHOW CREATE TABLE `{db}`.`{table}`;')
        result[table] = {'count': count, 'rows_sha256': hashlib.sha256(rows).hexdigest(),
                         'schema_sha256': hashlib.sha256(ddl).hexdigest()}
    return result


def main():
    run(['docker', 'image', 'inspect', IMAGE])
    suffix = uuid.uuid4().hex[:10]
    output = ROOT / 'docs/evidence' / ('kt3_' + datetime.now().strftime('%Y%m%d_%H%M%S') + '_' + suffix)
    output.mkdir(parents=True, exist_ok=False)
    manifest = json.loads((SEED / 'manifest.json').read_text(encoding='utf-8-sig'))
    dump = (SEED / 'seed.sql').read_bytes()
    sha = hashlib.sha256(dump).hexdigest()
    if manifest['sql_file'] != 'seed.sql' or manifest['database'] != 'order_management' or \
       sha != manifest['sha256'].lower() or len(dump) != manifest['size_bytes']:
        raise RuntimeError('Backup metadata or checksum mismatch; no import attempted.')
    report = {'started_utc': now(), 'scope': 'Disposable MySQL containers, network none, no published ports.',
              'tc12': {'backup_started_utc': manifest['started_utc'], 'backup_completed_utc': manifest['completed_utc'],
                       'backup_bytes': len(dump), 'checksum_matches_manifest': True}, 'tc15': {}}
    print('TC12: backup checksum OK; restoring into network-isolated MySQL...', flush=True)
    active = None
    try:
        active = start(suffix, 'tc12')
        mysql(active, dump)
        result = snapshot(active, 'order_management')
        if 'orders' not in result or not result:
            raise RuntimeError('Restored backup does not contain expected tables.')
        report['tc12'].update({'restored_tables': len(result), 'restored_order_count': result['orders']['count'],
                               'order_rows_sha256': result['orders']['rows_sha256'],
                               'restore_readable': True,
                               'source_at_backup_comparison': 'not available: no independent table snapshot at backup time'})
        stop(active); active = None

        print('TC15: creating fake orders, independent backup, and isolated data-loss simulation...', flush=True)
        active = start(suffix, 'tc15-source')
        db = 'omdrs_test_loss'
        mysql(active, f'CREATE DATABASE `{db}` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;')
        mysql(active, (ROOT / 'database/init/schema.sql').read_bytes(), db)
        ids = [str(uuid.uuid4()), str(uuid.uuid4())]
        sql = ('INSERT INTO orders (id,customer_name,product_name,quantity,total_amount,status,version) VALUES '
               f"('{ids[0]}','TC15_FAKE_A','SP_GIA',1,120000,'Pending',1),"
               f"('{ids[1]}','TC15_FAKE_B','SP_GIA',2,240000,'Completed',1);")
        mysql(active, sql, db)
        commit_ack = now()
        before = snapshot(active, db)
        generated_dump = run(['docker','exec',active,'mysqldump','--no-defaults','--user=root',
                              '--default-character-set=utf8mb4','--single-transaction','--set-gtid-purged=OFF',
                              '--quick','--no-tablespaces','--routines','--events','--triggers','--databases',db], timeout=120)
        fake_backup = output / 'tc15-backup-du-lieu-gia.sql'
        fake_backup.write_bytes(generated_dump)
        fake_hash = hashlib.sha256(generated_dump).hexdigest()
        if hashlib.sha256(fake_backup.read_bytes()).hexdigest() != fake_hash: raise RuntimeError('Fake backup checksum mismatch')
        failure_started = now()
        # Last safety check immediately before intentionally deleting ONLY rows with locally generated UUIDs.
        inspect(active)
        mysql(active, f"DELETE FROM `{db}`.`orders` WHERE id IN ('{ids[0]}','{ids[1]}');")
        after_delete = int(mysql(active, f"SELECT COUNT(*) FROM `{db}`.`orders` WHERE id IN ('{ids[0]}','{ids[1]}');"))
        if after_delete != 0: raise RuntimeError('Did not observe simulated deletion.')
        stop(active); active = None
        active = start(suffix, 'tc15-restore')
        mysql(active, fake_backup.read_bytes())
        after = snapshot(active, db)
        same_tables = set(before) == set(after)
        results = {t: before[t] == after[t] for t in sorted(set(before) & set(after))}
        passes = same_tables and all(results.values()) and before['orders']['count'] == 2
        report['tc15'] = {'result': 'PASS' if passes else 'FAIL', 'test_data': 'two synthetic orders',
                          'last_commit_ack_utc': commit_ack, 'failure_start_observed_utc': failure_started,
                          'backup_size_bytes': len(generated_dump), 'backup_sha256': fake_hash,
                          'deleted_test_orders': 2, 'present_after_delete': after_delete,
                          'recovered_test_orders': after.get('orders', {}).get('count'),
                          'table_hashes_match': passes, 'tables_compared': len(results),
                          'rpo_note': 'Commit acknowledgement and failure timestamps bound this synthetic test; not production RPO.'}
        stop(active); active = None
        report['completed_utc'] = now()
        (output / 'ket-qua.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        lines = ['# Kết quả kiểm thử khôi phục cô lập', '',
                 'Nguồn thực tế và Standby đang chạy không bị thay đổi. Các MySQL thử không có mạng và không mở cổng.', '',
                 '## TC12 — Bản backup độc lập', '',
                 f"- Backup Aiven bắt đầu {manifest['started_utc']}, hoàn thành {manifest['completed_utc']}; {len(dump)} byte.",
                 f"- SHA-256 khớp manifest; nạp và đọc được {len(result)} bảng, gồm {result['orders']['count']} đơn.",
                 '- Chưa có snapshot nội dung độc lập được ghi tại thời điểm backup để đối chiếu từng đơn với nguồn lúc đó; chưa kết luận toàn bộ TC12 đạt.', '',
                 '## TC15 — Mất dữ liệu giả và phục hồi', '',
                 f"- Kết quả: {report['tc15']['result']}. Tạo và commit 2 đơn giả; backup độc lập, xóa 2 đơn trong MySQL thử rồi phục hồi vào MySQL thử khác.",
                 f"- Hai đơn phục hồi; {len(results)} bảng khớp số lượng, nội dung và cấu trúc theo SHA-256.",
                 f"- Thời điểm xác nhận commit gần nhất: {commit_ack}; bắt đầu mô phỏng lỗi: {failure_started}.",
                 '- Các mốc chỉ phản ánh dữ liệu giả của phép thử; không phải RPO thực tế của Aiven hay website.', '']
        (output / 'ket-qua.md').write_text('\n'.join(lines), encoding='utf-8')
        print(f'TC12: restored {len(result)} tables, {result["orders"]["count"]} orders; source-at-backup comparison pending.')
        print(f'TC15: {report["tc15"]["result"]}; compared {len(results)} tables; two fake orders restored.')
        print('Evidence:', output / 'ket-qua.md')
        return 0 if passes else 2
    finally:
        if active:
            try: stop(active)
            except Exception as error: print('Isolated container cleanup needs attention:', str(error), flush=True)


if __name__ == '__main__':
    try: raise SystemExit(main())
    except (OSError, RuntimeError, ValueError, KeyError, subprocess.TimeoutExpired) as exc:
        print('TEST STOPPED:', str(exc), flush=True)
        raise SystemExit(1)
