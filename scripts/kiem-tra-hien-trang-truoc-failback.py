"""Doc va doi chieu hai database dang chay voi hai backup truoc failback.

Khong ghi MySQL, khong in ban ghi hoac mat khau. Nguoi van hanh van phai
giu tat ca nguon ghi dung trong suot qua trinh doi chieu va chuyen doi.
"""
from datetime import datetime, timezone
import getpass
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('backup_compare', ROOT / 'scripts' / 'kiem-tra-2-backup-failback.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

CONTAINER = 'omdrs-standby-20261108-mysql-standby-1'
SOURCE_HOST = 'mysql-7b63f20-qldh-demo.b.aivencloud.com'
SOURCE_UUID = 'c4ee9c9b-d7fc-11f1-ac26-f2d5b3407bc1'
STANDBY_UUID = '99807877-db5e-11f1-b2db-a20c76b38e25'
IDENT = re.compile(r'^[A-Za-z0-9_]+$')


def mysql(sql, *, source, secret):
    env = os.environ.copy()
    if source:
        env['MYSQL_PWD'] = secret
        args = ['docker', 'exec', '-i', '--env', 'MYSQL_PWD', CONTAINER, 'mysql', '--no-defaults',
                '--default-character-set=utf8mb4', '--batch', '--raw', '--skip-column-names', '--skip-reconnect',
                '--protocol=TCP', '--host=' + SOURCE_HOST, '--port=14586', '--user=avnadmin',
                '--ssl-mode=VERIFY_IDENTITY', '--ssl-ca=/etc/mysql/aiven-ca.pem']
    else:
        env.pop('MYSQL_PWD', None)
        args = ['docker', 'exec', '-i', CONTAINER, 'sh', '-c',
                'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --no-defaults --user=root '
                '--default-character-set=utf8mb4 --batch --raw --skip-column-names --skip-reconnect']
    try:
        result = subprocess.run(args, input=sql.encode('utf-8'), stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, env=env, timeout=45)
    finally:
        env.pop('MYSQL_PWD', None)
    if result.returncode:
        match = re.search(rb'ERROR\s+\d+(?:\s+\([A-Z0-9]+\))?', result.stderr)
        raise RuntimeError(('Aiven' if source else 'Standby') + ': ' +
                           (match.group().decode('ascii') if match else 'Khong doc duoc MySQL'))
    return result.stdout


def live_snapshot(*, source, secret, expected_tables):
    execute = lambda sql: mysql(sql, source=source, secret=secret)
    names = execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='order_management' "
                    "AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME;").decode('utf-8').splitlines()
    if set(names) != expected_tables or any(not IDENT.fullmatch(name) for name in names):
        raise RuntimeError(('Aiven' if source else 'Standby') + ': danh sach bang da thay doi')
    result = {}
    for name in names:
        keys = execute("SELECT COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='order_management' "
                       "AND TABLE_NAME='" + name + "' AND INDEX_NAME='PRIMARY' ORDER BY SEQ_IN_INDEX;").decode('utf-8').splitlines()
        if not keys or any(not IDENT.fullmatch(key) for key in keys):
            raise RuntimeError('Khong xac dinh duoc khoa chinh: ' + name)
        order = ', '.join('`' + key + '`' for key in keys)
        rows = execute('SELECT * FROM `order_management`.`' + name + '` ORDER BY ' + order + ';')
        result[name] = hashlib.sha256(rows).hexdigest()
    return result


def main():
    proof_folder = base.CASES[1][1]
    comparison = json.loads((proof_folder / 'doi-chieu-2-backup.json').read_text(encoding='utf-8'))
    trial = json.loads((proof_folder / 'thu-ke-hoach-failback.json').read_text(encoding='utf-8'))
    if trial.get('status') != 'PASS_ISOLATED_ONLY':
        raise ValueError('Chua co ket qua thu failback dat yeu cau')
    rows = comparison.get('table_comparison', [])
    expected = {row['table']: row for row in rows}
    if len(expected) != 13 or any(not IDENT.fullmatch(name) for name in expected):
        raise ValueError('Bao cao doi chieu bang khong hop le')
    for label, folder, _ in base.CASES:
        manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8-sig'))
        if manifest.get('sql_file') not in ('seed.sql', 'standby.sql'):
            raise ValueError('Ten file backup khong hop le')
        content = (folder / manifest['sql_file']).read_bytes()
        digest = hashlib.sha256(content).hexdigest()
        recorded = next((r for r in comparison['results'] if r['source'] == label), None)
        if len(content) != manifest['size_bytes'] or digest != manifest['sha256'] or not recorded or digest != recorded['sha256']:
            raise ValueError('Backup ' + label + ' da thay doi hoac checksum khong khop')

    secret = getpass.getpass('Mat khau Aiven cua avnadmin: ')
    if not secret:
        raise ValueError('Mat khau khong duoc de trong')
    try:
        source_uuid = mysql('SELECT @@server_uuid;', source=True, secret=secret).decode('ascii').strip()
        standby_state = mysql("SELECT @@server_uuid,@@GLOBAL.read_only,@@GLOBAL.super_read_only,"
                              "(SELECT SERVICE_STATE FROM performance_schema.replication_connection_status WHERE CHANNEL_NAME=''),"
                              "(SELECT SERVICE_STATE FROM performance_schema.replication_applier_status WHERE CHANNEL_NAME='');",
                              source=False, secret=secret).decode('ascii').strip().split('\t')
        if source_uuid != SOURCE_UUID or standby_state != [STANDBY_UUID, '0', '0', 'OFF', 'OFF']:
            raise RuntimeError('Sai UUID hoac trang thai standby; dung de kiem tra')
        engine_sql = ("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='order_management' "
                      "AND TABLE_TYPE='BASE TABLE' AND COALESCE(ENGINE,'') <> 'InnoDB';")
        for label, is_source in (('Aiven', True), ('Standby', False)):
            if mysql(engine_sql, source=is_source, secret=secret).decode('ascii').strip() != '0':
                raise RuntimeError(label + ': co bang khong phai InnoDB; dung de kiem tra')
        differences = []
        for label, is_source in (('Aiven', True), ('Standby', False)):
            print('Dang doi chieu hien trang', label, 'voi backup...', flush=True)
            actual = live_snapshot(source=is_source, secret=secret, expected_tables=set(expected))
            key = 'aiven_rows_sha256' if is_source else 'standby_rows_sha256'
            mismatch = [name for name in sorted(expected) if actual[name] != expected[name][key]]
            differences.extend(label + ':' + name for name in mismatch)
            print(label + ':', 'KHOP 13 BANG' if not mismatch else 'KHAC ' + ', '.join(mismatch), flush=True)
        if differences:
            raise RuntimeError('Du lieu da khac backup; khong ap dung ke hoach cu')
        output = proof_folder / 'kiem-tra-hien-trang.json'
        output.write_text(json.dumps({'status':'PASS_READ_ONLY', 'checked_utc':datetime.now(timezone.utc).isoformat(),
                                      'source_uuid':source_uuid, 'standby_uuid':STANDBY_UUID,
                                      'tables_checked':13, 'backup_hashes':[r['sha256'] for r in comparison['results']],
                                      'scope':'current rows versus backup restore row hashes; not a write fence or schema proof'},
                                     indent=2), encoding='utf-8')
        print('PASS: Noi dung 13 bang moi phia khop backup tuong ung.')
        print('Bao cao:', output)
        print('Chua thay doi du lieu; van can giu moi nguon ghi dung.')
    finally:
        secret = None


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.TimeoutExpired) as exc:
        print('LOI:', exc, file=sys.stderr)
        sys.exit(1)
