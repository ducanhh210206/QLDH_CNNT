"""Start the prepared 3308 replica using interactively entered credentials.

The source password is sent to START REPLICA on stdin, not put into argv or a file.
This config deliberately does not automatically restart replication after restart.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import getpass
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

CONTAINER = 'omdrs-standby-3308-chuan-bi-mysql-standby-1'
TARGET_UUID = '499d310a-d869-11f1-aa19-d27522af636a'
TARGET_SERVER_ID = '493203308'
HOST = 'mysql-7b63f20-qldh-demo.b.aivencloud.com'
PORT = '14586'
REPL_USER = 'replica_phuc'
CA_PATH = '/etc/mysql/aiven-ca.pem'
SNAPSHOT = ('4ee3c1e3-d6a4-11f1-a8ab-36f3fcbe0671:1-103,'
            'c4ee9c9b-d7fc-11f1-ac26-f2d5b3407bc1:1-67')
FILTER_HEX = '6F726465725C5F6D616E6167656D656E742E25'
USE_CONTAINER_ROOT_ENV = False
RESULT_PATH: Path | None = None


def save_result(status: str, **fields) -> None:
    if RESULT_PATH is not None:
        RESULT_PATH.write_text(json.dumps({
            'status': status, 'checked_utc': datetime.now(timezone.utc).isoformat(),
            'container': CONTAINER, 'standby_uuid': TARGET_UUID, **fields,
        }, indent=2), encoding='utf-8')


def mysql(query: str, password: str, *, source: bool = False, vertical: bool = False) -> str:
    env = os.environ.copy()
    if USE_CONTAINER_ROOT_ENV and not source:
        env.pop('MYSQL_PWD', None)
        args = ['docker', 'exec', '-i', CONTAINER, 'sh', '-c',
                'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql "$@"', 'mysql-client',
                '--no-defaults', '--default-character-set=utf8mb4']
    else:
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


def channel_filter_needs_restore(password: str) -> bool:
    expected = 'REPLICATE_WILD_DO_TABLE\t' + FILTER_HEX
    global_rules = mysql('SELECT FILTER_NAME,HEX(FILTER_RULE) FROM '
                         'performance_schema.replication_applier_global_filters', password)
    channel_rules = mysql("SELECT FILTER_NAME,HEX(FILTER_RULE) FROM "
                          "performance_schema.replication_applier_filters WHERE CHANNEL_NAME=''", password)
    if global_rules != expected:
        raise RuntimeError('Bo loc khoi dong khong dung order_management. Chua khoi dong.')
    if channel_rules == expected:
        return False
    if not channel_rules:
        return True
    raise RuntimeError('Kenh co bo loc khac du kien; khong tu ghi de. Chua khoi dong.')


def main() -> None:
    global USE_CONTAINER_ROOT_ENV, RESULT_PATH
    parser = argparse.ArgumentParser(description='Khoi dong replication cua standby hien tai tren cong 3308.')
    parser.add_argument('--container-root-env', action='store_true',
                        help='Dung mat khau root da co trong container cuc bo, khong in mat khau.')
    parser.add_argument('--result-file', type=Path, help='Luu ket qua kiem tra, khong luu mat khau.')
    options = parser.parse_args()
    USE_CONTAINER_ROOT_ENV = options.container_root_env
    RESULT_PATH = options.result_file
    local_password = '' if USE_CONTAINER_ROOT_ENV else getpass.getpass('Mat khau root Standby (3308): ')
    source_password = getpass.getpass('Mat khau Aiven cua replica_phuc: ')
    if (not USE_CONTAINER_ROOT_ENV and not local_password) or not source_password:
        raise ValueError('Mat khau khong duoc de trong.')

    target_query = (
        "SELECT @@server_uuid, @@server_id, @@GLOBAL.read_only, @@GLOBAL.super_read_only, "
        "@@GLOBAL.skip_replica_start, "
        "(SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='order_management' AND TABLE_TYPE='BASE TABLE'), "
        "GTID_SUBSET('" + SNAPSHOT + "', @@GLOBAL.gtid_executed), @@GLOBAL.gtid_executed"
    )
    fields = mysql(target_query, local_password).split('\t')
    if len(fields) != 8 or fields[:7] != [TARGET_UUID, TARGET_SERVER_ID, '1', '1', '1', '13', '1']:
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

    restore_filter = channel_filter_needs_restore(local_password)

    status = mysql("SELECT SERVICE_STATE FROM performance_schema.replication_connection_status "
                   "WHERE CHANNEL_NAME=''", local_password)
    applier_status = mysql("SELECT SERVICE_STATE FROM performance_schema.replication_applier_status "
                           "WHERE CHANNEL_NAME=''", local_password)
    if status != 'OFF' or applier_status != 'OFF':
        raise RuntimeError('Kenh khong o trang thai dung. Kiem tra truoc khi khoi dong.')

    # The receiver may already have transactions in relay logs that the SQL
    # thread has not applied. Include both sets when checking source purges.
    received_gtid = ''.join(mysql("SELECT RECEIVED_TRANSACTION_SET FROM "
                                 "performance_schema.replication_connection_status WHERE CHANNEL_NAME=''",
                                 local_password).split())
    if not re.fullmatch(r'[A-Za-z0-9_:\-,]*', received_gtid):
        raise RuntimeError('Khong doc duoc GTID da nhan. Chua khoi dong.')
    available_gtid = ','.join(s for s in (target_gtid, received_gtid) if s)
    source_query = ("SELECT GTID_SUBSET('" + SNAPSHOT + "',@@GLOBAL.gtid_executed), "
                    "GTID_SUBSET(@@GLOBAL.gtid_purged,'" + available_gtid + "'), "
                    "HEX(@@GLOBAL.gtid_executed), @@server_id <> " + TARGET_SERVER_ID + ", "
                    "@@GLOBAL.log_bin, @@GLOBAL.gtid_mode")
    source_fields = mysql(source_query, source_password, source=True).split('\t')
    if len(source_fields) != 6 or source_fields[:2] != ['1', '1'] or source_fields[3:] != ['1','1','ON']:
        raise RuntimeError('Moc GTID hoac binlog Aiven khong con phu hop. Chua khoi dong.')
    source_mark = bytes.fromhex(source_fields[2]).decode('ascii')
    source_mark = ''.join(source_mark.split())
    if not re.fullmatch(r'[A-Za-z0-9_:\-,]+', source_mark):
        raise RuntimeError('Moc GTID nguon khong hop le.')

    # After recreation with skip_replica_start, the inspected channel can have
    # no rules yet although the exact global startup filter exists. Reapply
    # that rule only to the stopped, validated channel and verify it before IO.
    if restore_filter:
        mysql("SET SESSION sql_mode=''; CHANGE REPLICATION FILTER "
              "REPLICATE_WILD_DO_TABLE=(" + sql_literal(r'order\_management.%') +
              ") FOR CHANNEL '';", local_password)
        if channel_filter_needs_restore(local_password):
            raise RuntimeError('Chua xac minh duoc bo loc sau khi dat lai. Chua khoi dong.')
        print('Da dat lai bo loc order_management cho kenh dang dung.')

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
            caught_up = mysql("SELECT WAIT_FOR_EXECUTED_GTID_SET('" + source_mark + "',20)", local_password) == '0'
            text = mysql('SHOW REPLICA STATUS;', local_password, vertical=True)
            io_state, sql_state = field('Replica_IO_Running'), field('Replica_SQL_Running')
            if (io_state != 'Yes' or sql_state != 'Yes' or
                    field('Last_IO_Errno') != '0' or field('Last_SQL_Errno') != '0'):
                break
            final_state = mysql('SELECT @@GLOBAL.read_only,@@GLOBAL.super_read_only', local_password)
            if final_state != '1\t1':
                raise RuntimeError('Standby khong con chi doc. Can kiem tra ngay.')
            print('Replica_IO_Running: Yes')
            print('Replica_SQL_Running: Yes')
            print('Seconds_Behind_Source: ' + field('Seconds_Behind_Source'))
            print('Da ap dung moc GTID Aiven luc kiem tra: ' + ('Yes' if caught_up else 'Chua'))
            save_result('running_caught_up' if caught_up else 'running_catchup_timeout',
                        io_running=io_state, sql_running=sql_state,
                        source_gtid_at_check=source_mark, source_mark_applied=caught_up,
                        seconds_behind_source=field('Seconds_Behind_Source'),
                        read_only=True, super_read_only=True)
            print('Can doi chieu du lieu va thu giao dich de xac nhan dong bo ung dung.')
            if not caught_up:
                sys.exit(2)
            return
        if field('Last_IO_Errno') not in ('0', 'khong_ro') or field('Last_SQL_Errno') not in ('0', 'khong_ro'):
            break
        time.sleep(1)
    print('Chua xac nhan ca hai luong dang chay. Dung chay lai; hay gui ket qua sau:')
    print('Replica_IO_Running: ' + io_state)
    print('Replica_SQL_Running: ' + sql_state)
    print('Last_IO_Errno: ' + field('Last_IO_Errno'))
    print('Last_SQL_Errno: ' + field('Last_SQL_Errno'))
    save_result('not_running', io_running=io_state, sql_running=sql_state,
                last_io_errno=field('Last_IO_Errno'), last_sql_errno=field('Last_SQL_Errno'))
    sys.exit(2)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        save_result('error', error=str(exc))
        print('LOI: ' + str(exc), file=sys.stderr)
        print('Neu lenh da bat dau, kiem tra trang thai truoc khi thu lai.', file=sys.stderr)
        sys.exit(1)
