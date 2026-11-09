"""Chuyen mot giao dich failover da doi chieu ve Aiven bang mot transaction.

Can giu TAT CA nguon ghi tren ca hai phia dung. Khong chuyen auth_sessions.
Tu choi chay lai neu da gui transaction, ke ca khi ket qua chua ro.
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


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


live = load('live_check', 'kiem-tra-hien-trang-truoc-failback.py')
tx = load('failback_tx', 'giao-dich-failback-20261108.py')
base = live.base
FOLDER = base.CASES[1][1]
JOURNAL = FOLDER / 'ket-qua-failback-aiven.json'


def write_journal(state):
    data = json.dumps(state, indent=2).encode('utf-8')
    temporary = JOURNAL.with_suffix('.json.partial')
    temporary.write_bytes(data)
    os.replace(temporary, JOURNAL)


def insert_from_standby(table, where):
    args = ['docker', 'exec', '-i', live.CONTAINER, 'sh', '-c',
            'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump "$@"', 'mysqldump-client',
            '--no-defaults', '-u', 'root', '--default-character-set=utf8mb4',
            '--single-transaction', '--skip-lock-tables', '--no-create-info', '--skip-triggers',
            '--compact', '--complete-insert', '--skip-extended-insert', '--hex-blob',
            '--where=' + where, 'order_management', table]
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=45)
    if result.returncode:
        match = re.search(rb'ERROR\s+\d+(?:\s+\([A-Z0-9]+\))?', result.stderr)
        raise RuntimeError('Khong lay duoc ban ghi standby: ' +
                           (match.group().decode('ascii') if match else 'ma thoat ' + str(result.returncode)))
    lines = [line for line in result.stdout.splitlines() if line.startswith(b'INSERT INTO ')]
    if len(lines) != 1 or not lines[0].rstrip().endswith(b';'):
        raise RuntimeError('Khong lay duoc dung mot ban ghi tu bang ' + table)
    return lines[0]


def main():
    if JOURNAL.exists() or JOURNAL.with_suffix('.json.partial').exists():
        raise RuntimeError('Da co bien ban failback hoac ket qua chua ro; khong gui lai transaction.')
    trial = json.loads((FOLDER / 'thu-ke-hoach-failback.json').read_text(encoding='utf-8'))
    builder_hash = hashlib.sha256((ROOT / 'scripts' / 'giao-dich-failback-20261108.py').read_bytes()).hexdigest()
    if (trial.get('status') != 'PASS_ISOLATED_ONLY' or trial.get('transaction_version') != 'guarded-v1' or
            trial.get('transaction_builder_sha256') != builder_hash):
        raise RuntimeError('Chua thu dung phien ban giao dich co dieu kien tren ban sao cach ly.')
    backup_hashes = []
    for _, folder, _ in base.CASES:
        manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8-sig'))
        if manifest.get('sql_file') not in ('seed.sql', 'standby.sql'):
            raise ValueError('Manifest backup khong hop le')
        data = (folder / manifest['sql_file']).read_bytes()
        backup_hashes.append(hashlib.sha256(data).hexdigest())
        if len(data) != manifest['size_bytes'] or backup_hashes[-1] != manifest['sha256']:
            raise ValueError('Checksum backup khong khop')
    if trial.get('backup_sha256') != backup_hashes:
        raise RuntimeError('Backup hien tai khong phai hai backup da thu giao dich')

    secret = getpass.getpass('Mat khau Aiven cua avnadmin: ')
    if not secret:
        raise ValueError('Mat khau khong duoc de trong')
    state = None
    try:
        # Full read-only verification immediately before preparing the transaction.
        live.getpass.getpass = lambda _: secret
        live.main()
        inserts = [insert_from_standby('orders', "id='" + tx.ORDER_ID + "'"),
                   insert_from_standby('order_status_history', "order_id='" + tx.ORDER_ID + "'"),
                   insert_from_standby('idempotency_keys', "order_id='" + tx.ORDER_ID + "'")]
        if hashlib.sha256(b'\n'.join(inserts)).hexdigest() != trial.get('inserts_sha256'):
            raise RuntimeError('Cac ban ghi standby khong khop phuong an da thu tren ban sao')
        sql = tx.build(inserts, live.SOURCE_UUID).decode('utf-8')
        state = {'status':'SUBMITTING_DO_NOT_RETRY', 'started_utc':datetime.now(timezone.utc).isoformat(),
                 'source_uuid':live.SOURCE_UUID, 'standby_uuid':live.STANDBY_UUID,
                 'order_id':tx.ORDER_ID, 'backup_sha256':backup_hashes,
                 'inserts_sha256':trial['inserts_sha256'], 'transaction_version':'guarded-v1'}
        # Exclusive creation prevents accidental retries. No SQL, row content or secrets are stored.
        with JOURNAL.open('x', encoding='utf-8') as out:
            json.dump(state, out, indent=2)
            out.flush()
            os.fsync(out.fileno())
        print('Dang gui mot transaction den Aiven. Neu ket qua khong ro, KHONG chay lai.', flush=True)
        result = live.mysql(sql, source=True, secret=secret).decode('utf-8').strip()
        if result != 'FAILBACK_COMMIT_OK':
            raise RuntimeError('Khong nhan duoc xac nhan COMMIT; ket qua chua ro')
        state.update(status='COMMITTED_VERIFYING', committed_utc=datetime.now(timezone.utc).isoformat())
        write_journal(state)

        comparison = json.loads((FOLDER / 'doi-chieu-2-backup.json').read_text(encoding='utf-8'))
        expected = {row['table']: row for row in comparison['table_comparison']}
        if len(expected) != 13:
            raise ValueError('Bao cao doi chieu khong du 13 bang')
        actual = live.live_snapshot(source=True, secret=secret, expected_tables=set(expected))
        mismatch = [name for name, row in sorted(expected.items())
                    if actual[name] != row['aiven_rows_sha256' if name == 'auth_sessions' else 'standby_rows_sha256']]
        if mismatch:
            state.update(status='COMMITTED_NEEDS_REVIEW', mismatch_tables=mismatch)
            write_journal(state)
            raise RuntimeError('Da COMMIT nhung doi chieu sau ghi chua khop: ' + ', '.join(mismatch))
        state.update(status='COMMITTED_VERIFIED', verified_utc=datetime.now(timezone.utc).isoformat(),
                     checked_tables=13, note='12 bang so voi backup Standby; auth_sessions giu theo backup Aiven')
        write_journal(state)
        print('PASS: Da ghi giao dich len Aiven va doi chieu 12 bang voi Standby; auth_sessions giu nhu Aiven.')
        print('Bao cao:', JOURNAL)
        print('Van giu cac nguon ghi dung; chua bat lai website va chua cau hinh lai replication.')
    finally:
        secret = None


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.TimeoutExpired) as exc:
        print('LOI:', exc, file=sys.stderr)
        if JOURNAL.exists() or JOURNAL.with_suffix('.json.partial').exists():
            print('CO THE DA GUI TRANSACTION: KHONG CHAY LAI; GIU NGUON GHI DUNG VA KIEM TRA BIEN BAN.', file=sys.stderr)
        else:
            print('Chua gui transaction. Giu nguon ghi dung va kiem tra loi.', file=sys.stderr)
        sys.exit(1)
