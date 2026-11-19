"""Tao tai khoan doc trang thai replication tren Standby 3308 cua nhom."""
import getpass
import importlib.util
from pathlib import Path
import re
import subprocess
import sys

source = Path(__file__).with_name('tao-tai-khoan-standby-sau-failback.py')
spec = importlib.util.spec_from_file_location('standby_account', source)
standby = importlib.util.module_from_spec(spec)
spec.loader.exec_module(standby)

SERVER_ID = '493203310'


def main():
    current = standby.query(
        "SELECT @@server_uuid, @@server_id, @@GLOBAL.read_only, "
        "@@GLOBAL.super_read_only, "
        "(SELECT COUNT(*) FROM mysql.user WHERE user='monitor_user' AND host='%')"
    )
    if current.split('\t') != [standby.UUID, SERVER_ID, '1', '1', '0']:
        raise RuntimeError('Sai Standby, chua chi doc hoac tai khoan da ton tai; chua thay doi.')

    password = getpass.getpass('Dat mat khau moi cho monitor_user: ')
    if not re.fullmatch(r'[A-Za-z0-9._-]{12,128}', password):
        raise ValueError('Mat khau can 12-128 ky tu, gom chu khong dau, so, dau cham, gach duoi hoac gach ngang.')
    if password != getpass.getpass('Nhap lai mat khau monitor_user: '):
        raise ValueError('Hai mat khau khong khop; chua thay doi.')

    operation_error = None
    try:
        standby.query(
            "SET SESSION sql_log_bin=0; SET GLOBAL super_read_only=OFF; "
            "CREATE USER 'monitor_user'@'%' IDENTIFIED BY '" + password + "'; "
            "GRANT REPLICATION CLIENT ON *.* TO 'monitor_user'@'%'; "
            "GRANT SELECT ON performance_schema.replication_applier_status_by_worker "
            "TO 'monitor_user'@'%';"
        )
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as exc:
        operation_error = exc
    finally:
        password = None
        try:
            standby.query('SET GLOBAL super_read_only=ON;')
            if standby.query('SELECT @@GLOBAL.read_only, @@GLOBAL.super_read_only') != '1\t1':
                raise RuntimeError('Khong xac minh duoc che do chi doc.')
        except (OSError, RuntimeError, subprocess.TimeoutExpired) as exc:
            raise RuntimeError('CAN XU LY NGAY: khong bat hoac xac minh duoc chi doc: ' + str(exc)) from exc

    if operation_error:
        raise RuntimeError('Tao tai khoan that bai: ' + str(operation_error) +
                           '. Co the da tao mot phan; kiem tra truoc khi thu lai.')
    print('Da tao tai khoan giam sat; Standby da tro lai che do chi doc.')
    print(standby.query("SHOW GRANTS FOR 'monitor_user'@'%';"))
    print(standby.query('SELECT @@server_uuid, @@GLOBAL.read_only, @@GLOBAL.super_read_only;'))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        print('LOI: ' + str(exc), file=sys.stderr)
        sys.exit(1)
