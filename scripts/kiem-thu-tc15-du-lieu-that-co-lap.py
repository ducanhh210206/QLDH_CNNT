"""Simulate loss of approved backed-up orders in disposable offline MySQL.

Restores the same verified seed into two newly created Docker containers with
no network and no published ports. The targeted delete runs only after the
container identity and isolation have been rechecked. No Aiven or existing
Standby connections are made. Reports contain hashes and counts, not rows.
"""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import json
import subprocess
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('tc15_isolated_lab', ROOT / 'scripts/kiem-thu-tc12-tc15-co-lap.py')
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--backup-dir', required=True, help='Thu muc backup seed co manifest.json')
    parser.add_argument('--order-id', action='append', required=True, help='UUID day du cua don da co trong backup; lap lai de chon nhieu don')
    args = parser.parse_args()
    order_ids = [str(uuid.UUID(value)) for value in args.order_id]
    if len(order_ids) > 10 or len(set(order_ids)) != len(order_ids):
        raise ValueError('Chon tu 1 den 10 UUID don hang khac nhau.')
    order_list = ','.join("'" + value + "'" for value in order_ids)
    folder = Path(args.backup_dir).resolve(strict=True)
    root = (ROOT / 'database/backups').resolve(strict=True)
    if not folder.is_relative_to(root) or folder == root:
        raise ValueError('Thu muc backup phai nam trong database/backups.')
    manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8-sig'))
    if manifest.get('database') != 'order_management' or manifest.get('sql_file') != 'seed.sql':
        raise ValueError('Manifest khong phai backup ung dung mong doi.')
    dump = (folder / 'seed.sql').read_bytes()
    checksum = hashlib.sha256(dump).hexdigest()
    if not dump or len(dump) != manifest.get('size_bytes') or checksum.lower() != str(manifest.get('sha256','')).lower():
        raise ValueError('Backup khong khop kich thuoc hoac checksum.')
    lab.run(['docker','image','inspect',lab.IMAGE])
    suffix = uuid.uuid4().hex[:10]
    output = ROOT / 'docs/evidence' / ('tc15_that_' + lab.datetime.now().strftime('%Y%m%d_%H%M%S') + '_' + suffix)
    output.mkdir(parents=True, exist_ok=False)
    report = {'started_utc': lab.now(), 'backup_started_utc': manifest.get('started_utc'),
              'backup_completed_utc': manifest.get('completed_utc'), 'backup_bytes': len(dump),
              'backup_sha256_verified': True, 'order_ids': order_ids,
              'scope': 'Real backup; deliberately deleted selected rows only in an offline disposable test copy; never modified live database.',
              'rpo': 'Not verified: latest committed transaction at failure and exact commit time not independently established.'}
    active = None
    try:
        print('1/4 Backup hop le. Dang khoi phuc ban thu thu nhat khong noi mang...', flush=True)
        active = lab.start(suffix, 'tc15-real-before')
        lab.mysql(active, dump)
        lab.inspect(active)
        server_uuid = lab.mysql(active, 'SELECT @@server_uuid;').decode().strip().lower()
        if server_uuid in {'c4ee9c9b-d7fc-11f1-ac26-f2d5b3407bc1','89eec56a-df06-11f1-a083-06e5fff3c5aa'}:
            raise RuntimeError('UUID trung voi may that; dung kiem thu.')
        before_count = int(lab.mysql(active, 'SELECT COUNT(*) FROM order_management.orders WHERE id IN (' + order_list + ');'))
        if before_count != len(order_ids):
            raise RuntimeError('Khong tim thay du cac don mau trong backup; dung kiem thu.')
        before = lab.snapshot(active, 'order_management')
        selected = lab.mysql(active, 'SELECT id,product_name,quantity,total_amount,status,version,created_at FROM order_management.orders WHERE id IN (' + order_list + ') ORDER BY id;').decode('utf-8').strip()
        print('Don mau TRUOC mat (id | san pham | so luong | tong tien | trang thai | phien ban | ngay tao):', flush=True)
        print(selected.replace('\t',' | '), flush=True)
        print('2/4 Mo phong xoa cac don mau trong container thu duoc tao rieng...', flush=True)
        if lab.inspect(active) != active: raise RuntimeError('Khong xac minh duoc container thu.')
        report['simulated_failure_started_utc'] = lab.now()
        lab.mysql(active, 'SET SESSION FOREIGN_KEY_CHECKS=0; DELETE FROM order_management.orders WHERE id IN (' + order_list + '); SET SESSION FOREIGN_KEY_CHECKS=1;')
        after_loss = int(lab.mysql(active, 'SELECT COUNT(*) FROM order_management.orders WHERE id IN (' + order_list + ');'))
        if after_loss != 0: raise RuntimeError('Khong xac nhan duoc ban ghi da mat trong ban thu.')
        print('So ban ghi mau sau mo phong mat:', after_loss, flush=True)
        lab.stop(active); active = None

        print('3/4 Khoi phuc cung ban backup vao container thu thu hai...', flush=True)
        active = lab.start(suffix, 'tc15-real-after')
        lab.mysql(active, dump)
        restored = lab.snapshot(active, 'order_management')
        restored_selected = lab.mysql(active, 'SELECT id,product_name,quantity,total_amount,status,version,created_at FROM order_management.orders WHERE id IN (' + order_list + ') ORDER BY id;').decode('utf-8').strip()
        restored_count = int(lab.mysql(active, 'SELECT COUNT(*) FROM order_management.orders WHERE id IN (' + order_list + ');'))
        print('Don mau SAU khoi phuc:', flush=True)
        print(restored_selected.replace('\t',' | ') if restored_selected else 'KHONG TIM THAY DON MAU', flush=True)
        same_tables = set(before) == set(restored)
        tables = {name: before[name] == restored[name] for name in sorted(set(before) & set(restored))}
        selected_match = bool(selected) and restored_count == len(order_ids) and selected == restored_selected
        passed = same_tables and all(tables.values()) and selected_match
        report.update({'completed_utc': lab.now(), 'selected_orders_present_before': before_count,
                       'selected_orders_present_after_loss': after_loss,
                       'selected_orders_restored': restored_count,
                       'selected_order_fields_match': selected_match,
                       'tables_compared': len(tables), 'all_table_counts_data_schema_match': same_tables and all(tables.values()),
                       'per_table_match': tables, 'result': 'PASS' if passed else 'FAIL'})
        (output / 'ket-qua.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print('4/4 Ket qua:', report['result'], '| So bang doi chieu:', len(tables), flush=True)
        print('So don mau phuc hoi:', restored_count, '/', len(order_ids), flush=True)
        print('So don mau thieu sau phuc hoi:', len(order_ids) - restored_count, flush=True)
        print('Doi chieu cac truong cua don mau:', 'KHOP' if selected_match else 'CHUA KHOP', flush=True)
        print('RPO: chua xac minh; chua co moc commit cuoi va thoi diem bat dau loi tren he thong that.', flush=True)
        print('Bao cao (khong chua noi dung don):', output / 'ket-qua.json', flush=True)
        if not passed: raise RuntimeError('Doi chieu chua dat; xem bao cao.')
    finally:
        if active:
            lab.stop(active)
            print('Da dung container thu. Khong thay doi Aiven hoac Standby.', flush=True)

if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.TimeoutExpired) as error:
        print('DUNG KIEM THU:', str(error), file=sys.stderr, flush=True)
        raise SystemExit(1)
