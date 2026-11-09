"""Thu nhap hai backup failback vao MySQL tam, cach ly, khong mo cong."""
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
BACKUPS = ROOT / 'database' / 'backups'
CASES = [
    ('Aiven', BACKUPS / 'seed_20261108_110737_5415cc75', (13, 8, 13, 8, 0, 0, 0, 10, 1)),
    ('Standby', BACKUPS / 'failback_standby_20261108_110655_1b0868ef', (13, 9, 14, 8, 1, 1, 1, 9, 2)),
]
ORDER_ID = 'a7536c2b-8416-4057-932d-a056a1d770f5'
PRODUCT_ID = '30f21275-466c-4d30-98ca-d37e1b2ff8ae'

spec = importlib.util.spec_from_file_location('restore_tools', ROOT / 'scripts' / 'thu-khoi-phuc.py')
restore = importlib.util.module_from_spec(spec)
spec.loader.exec_module(restore)


def safe_run(args, *, data=None, timeout=90):
    result = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    if result.returncode:
        match = re.search(rb'ERROR\s+\d+(?:\s+\([A-Z0-9]+\))?', result.stderr)
        detail = match.group().decode('ascii') if match else 'ma thoat ' + str(result.returncode)
        raise RuntimeError('Lenh Docker/MySQL that bai: ' + detail)
    return result.stdout


restore.run = safe_run
restore.DATABASE = 'order_management'


def main():
    results = []
    snapshots = {}
    for index, (label, folder, expected) in enumerate(CASES):
        manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8-sig'))
        if manifest.get('database') != 'order_management' or manifest.get('sql_file') not in ('seed.sql', 'standby.sql'):
            raise ValueError(label + ': manifest khong hop le')
        backup = (folder / manifest['sql_file']).read_bytes()
        sha = hashlib.sha256(backup).hexdigest()
        if len(backup) != manifest['size_bytes'] or sha != manifest['sha256']:
            raise ValueError(label + ': checksum khong khop')
        name = 'failback-restore-check-' + uuid.uuid4().hex[:12]
        active = False
        try:
            # No port publication, no network, no bind mount, no existing data volume.
            restore.start_container(name, 493204000 + index)
            active = True
            restore.wait_ready(name)
            print('Dang thu khoi phuc', label, flush=True)
            restore.mysql(name, backup)
            statement = (
                "SELECT (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='order_management' AND TABLE_TYPE='BASE TABLE'),"
                "(SELECT COUNT(*) FROM order_management.orders),"
                "(SELECT COUNT(*) FROM order_management.order_status_history),"
                "(SELECT COUNT(*) FROM order_management.products),"
                "(SELECT COUNT(*) FROM order_management.orders WHERE id='" + ORDER_ID + "'),"
                "(SELECT COUNT(*) FROM order_management.order_status_history WHERE order_id='" + ORDER_ID + "'),"
                "(SELECT COUNT(*) FROM order_management.idempotency_keys WHERE order_id='" + ORDER_ID + "'),"
                "(SELECT stock_quantity FROM order_management.products WHERE id='" + PRODUCT_ID + "'),"
                "(SELECT version FROM order_management.products WHERE id='" + PRODUCT_ID + "');"
            )
            values = tuple(int(x) for x in restore.mysql(name, statement).decode('utf-8').strip().split('\t'))
            print(label, ':', values, flush=True)
            if values != expected:
                raise RuntimeError(label + ': ket qua khoi phuc khong khop cac gia tri da doi chieu')
            snapshots[label] = restore.snapshot(name)
            results.append({'source': label, 'sha256': sha, 'checked_values': values, 'status': 'PASS'})
        finally:
            if active:
                restore.stop_container(name)
    aiven, standby = snapshots['Aiven'], snapshots['Standby']
    tables = sorted(set(aiven) | set(standby))
    comparison = []
    for table in tables:
        left, right = aiven.get(table), standby.get(table)
        same = left is not None and right is not None and left['rows_sha256'] == right['rows_sha256']
        comparison.append({'table': table,
                           'aiven_count': left['count'] if left else None,
                           'standby_count': right['count'] if right else None,
                           'rows_match': same,
                           'aiven_rows_sha256': left['rows_sha256'] if left else None,
                           'standby_rows_sha256': right['rows_sha256'] if right else None})
        print(table, ': Aiven=', left['count'] if left else 'khong co',
              'Standby=', right['count'] if right else 'khong co',
              'noi dung=', 'KHOP' if same else 'KHAC', flush=True)
    output = CASES[1][1] / 'doi-chieu-2-backup.json'
    output.write_text(json.dumps({'completed_utc': datetime.now(timezone.utc).isoformat(),
                                  'scope': 'isolated restore; all table rows ordered by primary key and hashed; not a reconciliation plan',
                                  'results': results, 'table_comparison': comparison}, indent=2), encoding='utf-8')
    print('PASS: Da thu khoi phuc ca hai backup trong container cach ly.')
    print('Da doi chieu noi dung cac bang; KHAC la chenh lech can phan tich, khong phai loi restore.')
    print('Bao cao:', output)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        print('LOI:', exc, file=sys.stderr)
        sys.exit(1)
