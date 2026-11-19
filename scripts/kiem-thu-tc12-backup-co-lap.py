"""Verify a seed backup and inspect a selected order in disposable offline MySQL.

Run only for approved backup files from this project. The tested copy is loaded
into a newly created Docker container without network access or published ports.
The script never connects to Aiven or the existing MySQL Standby.
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
SOURCE = ROOT / 'scripts/kiem-thu-tc12-tc15-co-lap.py'
spec = importlib.util.spec_from_file_location('isolated_restore', SOURCE)
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--backup-dir', required=True, help='Duong dan thu muc seed chua seed.sql va manifest.json')
    parser.add_argument('--order-id', required=True, help='UUID day du cua don mau da doi chieu tren Aiven')
    args = parser.parse_args()
    order_id = str(uuid.UUID(args.order_id))
    folder = Path(args.backup_dir).resolve(strict=True)
    root = (ROOT / 'database/backups').resolve(strict=True)
    if not folder.is_relative_to(root) or folder == root:
        raise ValueError('Thu muc backup phai nam trong database/backups.')
    manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8-sig'))
    if manifest.get('database') != 'order_management' or manifest.get('sql_file') != 'seed.sql':
        raise ValueError('Manifest khong phai backup order_management mong doi.')
    dump = (folder / 'seed.sql').read_bytes()
    digest = hashlib.sha256(dump).hexdigest()
    if not dump or len(dump) != manifest.get('size_bytes') or digest.lower() != str(manifest.get('sha256','')).lower():
        raise ValueError('Kich thuoc hoac checksum backup khong khop manifest.')
    lab.run(['docker','image','inspect',lab.IMAGE])
    print('BACKUP HOP LE: kich thuoc va SHA-256 khop manifest', flush=True)
    print('Bat dau backup (UTC):', manifest.get('started_utc'), flush=True)
    print('Ket thuc backup (UTC):', manifest.get('completed_utc'), flush=True)
    print('Dang khoi phuc vao MySQL thu moi khong noi mang...', flush=True)
    cid = None
    try:
        cid = lab.start(uuid.uuid4().hex[:10], 'tc12-user')
        lab.mysql(cid, dump)
        counts = lab.mysql(cid, "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='order_management' AND TABLE_TYPE='BASE TABLE';").decode().strip()
        orders = lab.mysql(cid, 'SELECT COUNT(*) FROM order_management.orders;').decode().strip()
        selected = lab.mysql(cid, "SELECT id,product_name,quantity,total_amount,status,version,created_at FROM order_management.orders WHERE id='" + order_id + "';").decode('utf-8').strip()
        print('So bang khoi phuc:', counts, flush=True)
        print('So don hang khoi phuc:', orders, flush=True)
        print('Don mau (id | san pham | so luong | tong tien | trang thai | phien ban | ngay tao):', flush=True)
        print(selected.replace('\t', ' | ') if selected else 'KHONG TIM THAY DON TRONG BAN BACKUP', flush=True)
        print('Doi chieu don mau voi ket qua Aiven da ghi truoc thoi diem backup.', flush=True)
    finally:
        if cid:
            try:
                lab.stop(cid)
                print('Da dung container thu; khong thay doi Aiven hoac Standby.', flush=True)
            except (RuntimeError, subprocess.TimeoutExpired) as error:
                print('Khong dung duoc container thu:', str(error), file=sys.stderr, flush=True)
                raise

if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.TimeoutExpired) as error:
        print('DUNG KIEM THU:', str(error), file=sys.stderr)
        raise SystemExit(1)
