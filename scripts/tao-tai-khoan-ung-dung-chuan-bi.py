"""Tao tai khoan backend rieng tren Standby moi, khong ghi binlog."""
import getpass
import re
import subprocess
import sys

CONTAINER = 'omdrs-standby-chuan-bi-mysql-standby-1'
UUID = 'c5a18e6c-dd78-11f1-a8e2-0e26d02007c2'
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
    state = query("SELECT @@server_uuid, @@server_id, @@GLOBAL.read_only, @@GLOBAL.super_read_only, "
                  "(SELECT COUNT(*) FROM mysql.user WHERE user='order_user' AND host='%')")
    if state.split('\t') != [UUID, '493203311', '1', '1', '0']:
        raise RuntimeError('Sai Standby, khong o che do chi doc hoac order_user da ton tai; chua thay doi.')

    secret = getpass.getpass('Nhap mat khau database backend dang su dung cho order_user: ')
    if not 12 <= len(secret) <= 128 or not all(32 <= ord(c) <= 126 for c in secret):
        raise ValueError('Mat khau can 12-128 ky tu ASCII in duoc.')
    if secret != getpass.getpass('Nhap lai mat khau order_user: '):
        raise ValueError('Hai mat khau khong khop; chua thay doi.')

    failure = None
    try:
        escaped = secret.replace('\\', '\\\\').replace("'", "\\'")
        query("SET SESSION sql_mode=''; SET SESSION sql_log_bin=0; "
              "SET GLOBAL super_read_only=OFF; "
              "CREATE USER 'order_user'@'%' IDENTIFIED BY '" + escaped + "'; "
              "GRANT SELECT, INSERT, UPDATE, DELETE ON order_management.* TO 'order_user'@'%';")
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as exc:
        failure = exc
    finally:
        secret = None
        try:
            query('SET GLOBAL super_read_only=ON;')
            if query('SELECT @@GLOBAL.read_only,@@GLOBAL.super_read_only') != '1\t1':
                raise RuntimeError('Khong xac minh duoc che do chi doc.')
        except (OSError, RuntimeError, subprocess.TimeoutExpired) as exc:
            raise RuntimeError('CAN XU LY NGAY: khong xac minh duoc che do chi doc: ' + str(exc)) from exc

    if failure:
        raise RuntimeError('Tao tai khoan that bai: ' + str(failure) +
                           '. Co the da tao mot phan; kiem tra truoc khi thu lai.')
    print('Da tao tai khoan ung dung. Standby da tro lai che do chi doc.')
    print(query("SHOW GRANTS FOR 'order_user'@'%';"))
    print(query('SELECT @@server_uuid,@@GLOBAL.read_only,@@GLOBAL.super_read_only;'))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        print('LOI: ' + str(exc), file=sys.stderr)
        sys.exit(1)
