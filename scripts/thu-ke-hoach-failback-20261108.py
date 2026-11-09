"""Thu doi chieu failback tren hai ban khoi phuc cach ly, khong ghi Aiven."""
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('backup_compare', ROOT / 'scripts' / 'kiem-tra-2-backup-failback.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
restore = base.restore
EXPECTED_DIFFERENCES = {'auth_sessions', 'idempotency_keys', 'order_status_history', 'orders', 'products'}
tx_spec = importlib.util.spec_from_file_location('failback_tx', ROOT / 'scripts' / 'giao-dich-failback-20261108.py')
tx = importlib.util.module_from_spec(tx_spec)
tx_spec.loader.exec_module(tx)


def check_backups():
    dumps = []
    for label, folder, _ in base.CASES:
        manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8-sig'))
        if manifest.get('database') != 'order_management' or manifest.get('sql_file') not in ('seed.sql', 'standby.sql'):
            raise ValueError('Manifest ' + label + ' khong dung')
        data = (folder / manifest['sql_file']).read_bytes()
        if len(data) != manifest['size_bytes'] or hashlib.sha256(data).hexdigest() != manifest['sha256']:
            raise ValueError('Checksum backup ' + label + ' khong khop')
        dumps.append(data)
    return dumps


def get_insert(container, table, where):
    args = ['docker', 'exec', container, 'mysqldump', '--no-defaults', '-u', 'root',
            '--default-character-set=utf8mb4', '--single-transaction', '--skip-lock-tables',
            '--no-create-info', '--skip-triggers', '--compact', '--complete-insert',
            '--skip-extended-insert', '--hex-blob', '--where=' + where, 'order_management', table]
    dump = restore.run(args)
    lines = [line for line in dump.splitlines() if line.startswith(b'INSERT INTO ')]
    if len(lines) != 1 or not lines[0].rstrip().endswith(b';'):
        raise RuntimeError('Khong lay duoc dung mot ban ghi tu bang ' + table)
    return lines[0]


def main():
    backups = check_backups()
    containers = []
    try:
        for index, label in enumerate(('Aiven', 'Standby')):
            name = 'failback-plan-check-' + uuid.uuid4().hex[:12]
            restore.start_container(name, 493205000 + index)
            containers.append(name)
            restore.wait_ready(name)
            print('Dang nap ban sao cach ly:', label, flush=True)
            restore.mysql(name, backups[index])

        source, standby = containers
        print('Dang doi chieu toan bo bang truoc khi thu...', flush=True)
        before_source, before_standby = restore.snapshot(source), restore.snapshot(standby)
        if len(before_source) != 13 or set(before_source) != set(before_standby):
            raise RuntimeError('Danh sach bang khong dung; khong thu ap dung')
        changed = {name for name in before_source
                   if before_source[name]['rows_sha256'] != before_standby[name]['rows_sha256']}
        if changed != EXPECTED_DIFFERENCES:
            raise RuntimeError('Bang thay doi khac voi dot doi chieu truoc; dung de kiem tra')

        def scalar(container, query):
            return restore.mysql(container, query).decode('utf-8').strip()

        product_sql = ("SELECT CONCAT(stock_quantity,':',version) FROM order_management.products WHERE id='"
                       + base.PRODUCT_ID + "';")
        if scalar(source, product_sql) != '10:1' or scalar(standby, product_sql) != '9:2':
            raise RuntimeError('Ton kho hoac phien ban san pham khong dung')
        for container, expected in ((source, '0\t0\t0'), (standby, '1\t1\t1')):
            checks = ("SELECT (SELECT COUNT(*) FROM order_management.orders WHERE id='" + base.ORDER_ID + "'),"
                      "(SELECT COUNT(*) FROM order_management.order_status_history WHERE order_id='" + base.ORDER_ID + "'),"
                      "(SELECT COUNT(*) FROM order_management.idempotency_keys WHERE order_id='" + base.ORDER_ID + "');")
            if scalar(container, checks) != expected:
                raise RuntimeError('Don thu hoac bang lien quan khong dung')

        inserts = [get_insert(standby, 'orders', "id='" + base.ORDER_ID + "'"),
                   get_insert(standby, 'order_status_history', "order_id='" + base.ORDER_ID + "'"),
                   get_insert(standby, 'idempotency_keys', "order_id='" + base.ORDER_ID + "'")]
        source_uuid = scalar(source, 'SELECT @@server_uuid;')
        # A deliberately wrong stock precondition must abort and leave every row unchanged.
        try:
            restore.mysql(source, tx.build(inserts, source_uuid, expected_stock=11))
        except RuntimeError:
            pass
        else:
            raise RuntimeError('Dieu kien bao ve sai khong dung giao dich')
        after_rejected = restore.snapshot(source)
        if any(after_rejected[name]['rows_sha256'] != before_source[name]['rows_sha256'] for name in before_source):
            raise RuntimeError('Giao dich bi tu choi da thay doi du lieu ban sao thu')
        print('Da thu dieu kien sai: giao dich dung va khong thay doi du lieu.', flush=True)

        # Force an error after UPDATE to verify the uncommitted update is rolled back.
        try:
            restore.mysql(source, tx.build(inserts, source_uuid, test_abort_after_update=True))
        except RuntimeError:
            pass
        else:
            raise RuntimeError('Loi gia lap sau UPDATE khong dung giao dich')
        after_rollback = restore.snapshot(source)
        if any(after_rollback[name]['rows_sha256'] != before_source[name]['rows_sha256'] for name in before_source):
            raise RuntimeError('Sau loi gia lap, du lieu ban sao thu khong duoc rollback')
        print('Da thu loi sau UPDATE: du lieu duoc rollback.', flush=True)

        sql = tx.build(inserts, source_uuid)
        if restore.mysql(source, sql).decode('utf-8').strip() != 'FAILBACK_COMMIT_OK':
            raise RuntimeError('Khong xac nhan duoc giao dich ban sao thu')

        print('Dang doi chieu sau khi thu...', flush=True)
        after_source = restore.snapshot(source)
        remaining = sorted(name for name in before_standby
                           if after_source[name]['rows_sha256'] != before_standby[name]['rows_sha256'])
        if remaining != ['auth_sessions']:
            raise RuntimeError('Sau thu van con chenhlech ngoai phien dang nhap: ' + ', '.join(remaining))
        output = base.CASES[1][1] / 'thu-ke-hoach-failback.json'
        output.write_text(json.dumps({
            'completed_utc': datetime.now(timezone.utc).isoformat(),
            'status': 'PASS_ISOLATED_ONLY', 'initial_changed_tables': sorted(changed),
            'business_tables_rows_match': 12, 'excluded_table': 'auth_sessions',
            'transaction_version': 'guarded-v1',
            'inserts_sha256': hashlib.sha256(b'\n'.join(inserts)).hexdigest(),
            'transaction_builder_sha256': hashlib.sha256((ROOT / 'scripts' / 'giao-dich-failback-20261108.py').read_bytes()).hexdigest(),
            'backup_sha256': [hashlib.sha256(data).hexdigest() for data in backups],
            'note': 'Thu tren ban sao; phien JWT tam khong chuyen; chua ghi Aiven that.',
        }, indent=2), encoding='utf-8')
        print('PASS: 12 bang co noi dung khop sau khi thu tren ban sao cach ly.')
        print('auth_sessions van khac co chu y; chua ghi vao Aiven that.')
        print('Bao cao:', output)
    finally:
        errors = []
        for name in reversed(containers):
            try:
                restore.stop_container(name)
            except (OSError, RuntimeError, subprocess.TimeoutExpired) as exc:
                errors.append(name + ': ' + str(exc))
        if errors:
            raise RuntimeError('Khong dung duoc container thu: ' + '; '.join(errors))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        print('LOI:', exc, file=sys.stderr)
        sys.exit(1)
