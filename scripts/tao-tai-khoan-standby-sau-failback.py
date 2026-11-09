"""Tao tai khoan ung dung cuc bo tren dung standby da chuan bi."""
import getpass
import re
import subprocess
import sys

CONTAINER = 'omdrs-standby-sau-failback-mysql-standby-1'
UUID = '13bc73d1-db6d-11f1-8c8e-22c586f6983b'
COMMAND = [
    'docker', 'exec', '-i', CONTAINER, 'sh', '-c',
    'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --no-defaults -u root --batch --skip-column-names',
]


def query(sql):
    result = subprocess.run(COMMAND, input=sql.encode('utf-8'), stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=30)
    if result.returncode:
        match = re.search(rb'ERROR\s+\d+(?:\s+\([A-Z0-9]+\))?', result.stderr)
        raise RuntimeError(match.group().decode('ascii') if match else 'MySQL khong thuc thi duoc lenh')
    return result.stdout.decode('utf-8').strip()


def main():
    actual = query("SELECT @@server_uuid,@@server_id,@@GLOBAL.read_only,@@GLOBAL.super_read_only,"
                   "(SELECT COUNT(*) FROM mysql.user WHERE user='order_user' AND host='%')")
    if actual.split('\t') != [UUID, '493203310', '1', '1', '0']:
        raise RuntimeError('UUID, che do chi doc hoac tai khoan khong dung nhu du kien; chua thay doi.')

    secret = getpass.getpass('Dat mat khau MySQL moi cho order_user: ')
    if not re.fullmatch(r'[A-Za-z0-9._-]{12,128}', secret):
        raise ValueError('Mat khau can 12-128 ky tu, chi gom chu khong dau, so, dau cham, gach duoi hoac gach ngang.')
    if secret != getpass.getpass('Nhap lai mat khau order_user: '):
        raise ValueError('Hai lan nhap khong khop; chua thay doi tai khoan.')

    operation_error = None
    try:
        query("SET SESSION sql_log_bin=0; SET GLOBAL super_read_only=OFF; "
              "CREATE USER 'order_user'@'%' IDENTIFIED BY '" + secret + "'; "
              "GRANT SELECT, INSERT, UPDATE, DELETE ON order_management.* TO 'order_user'@'%';")
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as exc:
        operation_error = exc
    finally:
        secret = None
        try:
            query('SET GLOBAL super_read_only=ON;')
            if query('SELECT @@GLOBAL.read_only,@@GLOBAL.super_read_only') != '1\t1':
                raise RuntimeError('Khong xac minh duoc che do chi doc.')
        except (OSError, RuntimeError, subprocess.TimeoutExpired) as exc:
            raise RuntimeError('CAN XU LY NGAY: khong bat hoac xac minh duoc che do chi doc: ' + str(exc)) from exc

    if operation_error:
        raise RuntimeError('Thao tac tai khoan that bai: ' + str(operation_error) +
                           '. Tai khoan co the da duoc tao mot phan; khong chay lai truoc khi kiem tra.')
    print('Da tao tai khoan ung dung. Standby da tro lai che do chi doc.')
    print(query("SHOW GRANTS FOR 'order_user'@'%';"))
    print(query('SELECT @@server_uuid AS uuid_standby,@@GLOBAL.read_only AS read_only,@@GLOBAL.super_read_only AS super_read_only;'))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        print('LOI: ' + str(exc), file=sys.stderr)
        sys.exit(1)
