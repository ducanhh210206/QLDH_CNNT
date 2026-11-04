"""Start the prepared 3308 replica using interactively entered credentials.

The source password is sent to START REPLICA on stdin, not put into argv or a file.
This config deliberately does not automatically restart replication after restart.
"""
from __future__ import annotations

import getpass
import os
import re
import subprocess
import sys
import time

CONTAINER = 'omdrs-standby-moi-mysql-standby-1'
TARGET_UUID = '3c576ca3-d816-11f1-a7ff-c2ef45c616b5'
HOST = 'mysql-7b63f20-qldh-demo.b.aivencloud.com'
PORT = '14586'
REPL_USER = 'replica_phuc'
CA_PATH = '/etc/mysql/aiven-ca.pem'
SNAPSHOT = ('4ee3c1e3-d6a4-11f1-a8ab-36f3fcbe0671:1-103,'
            'c4ee9c9b-d7fc-11f1-ac26-f2d5b3407bc1:1-39')
FILTER_HEX = '6F726465725C5F6D616E6167656D656E742E25'


def mysql(query: str, password: str, *, source: bool = False, vertical: bool = False) -> str:
    env = os.environ.copy()
    env['MYSQL_PWD'] = password
    args = ['docker', 'exec', '-i', '--env', 'MYSQL_PWD', CONTAINER,
            'mysql', '--no-defaults', '--default-character-set=utf8mb4']
    if source:
        args += ['--protocol=TCP', f'--host={HOST}', f'--port={PORT}',
                 f'--user={REPL_USER}', '--ssl-mode=VERIFY_IDENTITY', f'--ssl-ca={CA_PATH}']
    else:
        args += ['--user=root']
    args += ['--vertical'] if vertical else ['--batch', '--raw', '--skip-column-names']
    try:
        result = subprocess.run(args, input=query.encode('utf-8'), env=env,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=45)
    finally:
        env.pop('MYSQL_PWD', None)
    if result.returncode:
        match = re.search(rb'ERROR\s+\d+(?:\s+\([A-Z0-9]+\))?', result.stderr)
        code = match.group().decode('ascii') if match else f'ma thoat {result.returncode}'
        raise RuntimeError(('Ket noi Aiven' if source else 'MySQL Standby') + ' that bai: ' + code)
    return result.stdout.decode('utf-8').strip()


def sql_literal(value: str) -> str:
    if not value or any(ord(c) < 32 or ord(c) > 126 for c in value):
        raise ValueError('Mat khau replication phai gom ky tu ASCII in duoc.')
    return "'" + value.replace('\\', '\\\\').replace("'", "\\'") + "'"


def main() -> None:
    local_password = getpass.getpass('Mat khau root Standby moi (3308): ')
    source_password = getpass.getpass('Mat khau Aiven cua replica_phuc: ')
    if not local_password or not source_password:
        raise ValueError('Mat khau khong duoc de trong.')

    target_query = (
        "SELECT @@server_uuid, @@server_id, @@GLOBAL.read_only, @@GLOBAL.super_read_only, "
        "@@GLOBAL.skip_replica_start, "
        "(SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='order_management' AND TABLE_TYPE='BASE TABLE'), "
        "GTID_SUBSET('" + SNAPSHOT + "', @@GLOBAL.gtid_executed), @@GLOBAL.gtid_executed"
    )
    fields = mysql(target_query, local_password).split('\t')
    if len(fields) != 8 or fields[:7] != [TARGET_UUID, '3', '1', '1', '1', '13', '1']:
        raise RuntimeError('Standby, che do chi doc, so bang hoac moc GTID khong dung. Chua khoi dong.')
    target_gtid = ''.join(fields[7].split())
    if not re.fullmatch(r'[A-Za-z0-9_:\-,]+', target_gtid):
        raise RuntimeError('Khong doc duoc tap GTID cua standby. Chua khoi dong.')

    config = mysql("SELECT HOST,PORT,USER,AUTO_POSITION,SSL_ALLOWED,SSL_CA_FILE,"
                   "SSL_VERIFY_SERVER_CERTIFICATE FROM performance_schema.replication_connection_configuration "
                   "WHERE CHANNEL_NAME=''", local_password).split('\t')
    if len(config) != 7 or config[:4] != [HOST, PORT, REPL_USER, '1'] or \
            config[4].upper() != 'YES' or config[5] != CA_PATH or config[6].upper() != 'YES':
        raise RuntimeError('Cau hinh kenh hoac TLS khong dung. Chua khoi dong.')

    filter_count = mysql("SELECT COUNT(*) FROM performance_schema.replication_applier_filters "
                         "WHERE CHANNEL_NAME='' AND FILTER_NAME='REPLICATE_WILD_DO_TABLE' "
                         f"AND HEX(FILTER_RULE)='{FILTER_HEX}'", local_password)
    if filter_count != '1':
        raise RuntimeError('Khong xac nhan duoc bo loc cua kenh. Chua khoi dong.')

    status = mysql("SELECT SERVICE_STATE FROM performance_schema.replication_connection_status "
                   "WHERE CHANNEL_NAME=''", local_password)
    if status != 'OFF':
        raise RuntimeError('Kenh khong o trang thai dung. Kiem tra truoc khi khoi dong.')

    source_query = ("SELECT GTID_SUBSET('" + SNAPSHOT + "',@@GLOBAL.gtid_executed), "
                    "GTID_SUBSET(@@GLOBAL.gtid_purged,'" + target_gtid + "')")
    if mysql(source_query, source_password, source=True) != '1\t1':
        raise RuntimeError('Moc GTID hoac binlog Aiven khong con phu hop. Chua khoi dong.')

    print('Da kiem tra standby, bo loc, TLS va moc GTID. Dang khoi dong...')
    sql = "SET SESSION sql_mode=''; START REPLICA USER='replica_phuc' PASSWORD=" + sql_literal(source_password) + ';'
    mysql(sql, local_password)
    for _ in range(12):
        text = mysql('SHOW REPLICA STATUS;', local_password, vertical=True)
        def field(name: str) -> str:
            match = re.search(r'^\s*' + re.escape(name) + r':\s*(.*)$', text, re.MULTILINE)
            return match.group(1).strip() if match else 'khong_ro'
        io_state = field('Replica_IO_Running')
        sql_state = field('Replica_SQL_Running')
        if io_state == 'Yes' and sql_state == 'Yes':
            print('Replica_IO_Running: Yes')
            print('Replica_SQL_Running: Yes')
            print('Seconds_Behind_Source: ' + field('Seconds_Behind_Source'))
            print('Hai luong da chay. Can doi chieu du lieu va thu giao dich de xac nhan dong bo.')
            return
        if field('Last_IO_Errno') not in ('0', 'khong_ro') or field('Last_SQL_Errno') not in ('0', 'khong_ro'):
            break
        time.sleep(1)
    print('Chua xac nhan ca hai luong dang chay. Dung chay lai; hay gui ket qua sau:')
    print('Replica_IO_Running: ' + io_state)
    print('Replica_SQL_Running: ' + sql_state)
    print('Last_IO_Errno: ' + field('Last_IO_Errno'))
    print('Last_SQL_Errno: ' + field('Last_SQL_Errno'))
    sys.exit(2)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        print('LOI: ' + str(exc), file=sys.stderr)
        print('Neu lenh da bat dau, kiem tra trang thai truoc khi thu lai.', file=sys.stderr)
        sys.exit(1)
