"""Kiem tra frontend proxy -> backend -> MySQL rieng chi voi du lieu gia.

Moi lan chay tao network Docker rieng va container tam ten ngau nhien, chi mo cong
tren loopback. Khong dung Aiven, standby 3308, volume hay mat khau cua du an.
Ket thuc se dung cac tien trinh va container mang dung ten do lan chay tao ra.
Day chua phai phep thu replication, failover hoac failback.
"""
from __future__ import annotations

import http.cookiejar
import json
import os
import secrets
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IMAGE = 'mysql:8.4.13'
DB = 'task5_lab_gia'


def command(args: list[str], *, data: bytes | None = None, timeout: int = 100) -> bytes:
    result = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f'{args[0]} that bai: {result.stderr.decode("utf-8", errors="replace")[:600]}')
    return result.stdout


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def wait_until(check, name: str, seconds: int = 90) -> None:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            if check():
                return
        except (OSError, urllib.error.URLError, RuntimeError, subprocess.TimeoutExpired):
            pass
        time.sleep(1)
    raise RuntimeError(f'{name} chua san sang sau {seconds} giay.')


def main() -> None:
    node = shutil.which('node')
    if not node or not shutil.which('docker'):
        raise RuntimeError('Can Node.js va Docker Desktop dang hoat dong.')
    vite = ROOT / 'node_modules' / 'vite' / 'bin' / 'vite.js'
    if not vite.is_file() or not (ROOT / 'node_modules' / 'mysql2').is_dir():
        raise RuntimeError('Thieu dependencies cua du an; kiem tra node_modules truoc khi chay.')
    command(['docker', 'image', 'inspect', IMAGE], timeout=30)

    tag = uuid.uuid4().hex[:10]
    network = f'task5-gia-net-{tag}'
    container = f'task5-gia-db-{tag}'
    root_pw, app_pw, login_pw, jwt = (secrets.token_hex(18) for _ in range(4))
    app_user = 'task5_app'
    db_port, backend_port, frontend_port = free_port(), free_port(), free_port()
    if len({db_port, backend_port, frontend_port, 3306, 3307, 3308}) != 6:
        raise RuntimeError('Cong thu trung nhau hoac trung cong dang dung; vui long chay lai.')
    processes: list[subprocess.Popen] = []
    network_created = False
    container_started = False
    started = datetime.now(timezone(timedelta(hours=7)))
    creation_flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)

    def mysql(sql: str | bytes, database: str | None = None) -> bytes:
        args = ['docker', 'exec', '-i', '-e', 'MYSQL_PWD=' + root_pw, container,
                'mysql', '--no-defaults', '-uroot', '--default-character-set=utf8mb4',
                '--batch', '--skip-column-names']
        if database:
            args.append(database)
        return command(args, data=sql.encode('utf-8') if isinstance(sql, str) else sql)

    try:
        print('1/4 Tao MySQL du lieu gia trong mang Docker rieng...', flush=True)
        command(['docker', 'network', 'create', network], timeout=30)
        network_created = True
        command(['docker', 'run', '-d', '--rm', '--pull=never', '--name', container,
                 '--network', network, '-p', f'127.0.0.1:{db_port}:3306',
                 '-e', 'MYSQL_ROOT_PASSWORD=' + root_pw,
                 '-e', 'MYSQL_DATABASE=' + DB, IMAGE], timeout=60)
        container_started = True
        wait_until(lambda: mysql('SELECT 1;').strip() == b'1', 'MySQL du lieu gia')
        try:
            port_info = command(['docker', 'port', container, '3306/tcp'], timeout=30).decode().strip()
        except RuntimeError as exc:
            details = command(['docker', 'inspect', '--format',
                               '{{json .NetworkSettings.Ports}} {{.State.Status}}', container], timeout=30)
            raise RuntimeError('Khong lay duoc cong MySQL thu: ' + details.decode().strip()) from exc
        if not port_info.startswith('127.0.0.1:') or '\n' in port_info:
            raise RuntimeError('Cong MySQL thu khong chi gioi han o 127.0.0.1.')
        if int(port_info.rsplit(':', 1)[1]) != db_port:
            raise RuntimeError('Cong MySQL thu khong dung voi cong vua tao.')
        mysql((ROOT / 'database' / 'init' / 'schema.sql').read_bytes(), DB)
        mysql(f"CREATE USER '{app_user}'@'%' IDENTIFIED BY '{app_pw}'; "
              f"GRANT SELECT, INSERT, UPDATE, DELETE ON `{DB}`.* TO '{app_user}'@'%';")

        env = {k: v for k, v in os.environ.items()
               if not k.startswith(('DB_', 'VITE_', 'API_', 'GOOGLE_', 'NEW_'))}
        env.update({'DB_HOST': '127.0.0.1', 'DB_PORT': str(db_port), 'DB_NAME': DB,
                    'DB_USER': app_user, 'DB_PASSWORD': app_pw, 'DB_SSL': 'false',
                    'JWT_SECRET': jwt, 'HOST': '127.0.0.1', 'PORT': str(backend_port),
                    'INSTANCE_NAME': 'task5-lab-gia', 'NODE_ENV': 'development',
                    'BACKUP_INTERVAL_HOURS': '0', 'MONITOR_URL': 'http://127.0.0.1:9',
                    'MONITOR_TOKEN': '', 'SERVE_FRONTEND': 'false',
                    'CORS_ORIGINS': f'http://127.0.0.1:{frontend_port}',
                    'API_PROXY_TARGET': f'http://127.0.0.1:{backend_port}',
                    'VITE_API_BASE': '', 'NEW_USERNAME': 'task5_lab_admin',
                    'NEW_PASSWORD': login_pw, 'NEW_ROLE': 'Admin'})
        print('2/4 Tao tai khoan va du lieu kiem thu gia...', flush=True)
        created = subprocess.run([node, str(ROOT / 'scripts' / 'create-user.js')],
                                 cwd=ROOT, env=env, stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, timeout=45, creationflags=creation_flags)
        if created.returncode:
            raise RuntimeError('Khong tao duoc tai khoan gia trong database thu: ' +
                               created.stderr.decode('utf-8', errors='replace')[:600])
        for key in ('NEW_USERNAME', 'NEW_PASSWORD', 'NEW_ROLE'):
            env.pop(key, None)

        print('3/4 Khoi dong backend va frontend cuc bo...', flush=True)
        processes.append(subprocess.Popen([node, str(ROOT / 'backend' / 'src' / 'server.js')],
                                         cwd=ROOT, env=env, stdout=subprocess.DEVNULL,
                                         stderr=subprocess.DEVNULL, creationflags=creation_flags))
        processes.append(subprocess.Popen([node, str(vite), '--host', '127.0.0.1',
                                          '--port', str(frontend_port), '--strictPort'],
                                         cwd=ROOT / 'frontend', env=env, stdout=subprocess.DEVNULL,
                                         stderr=subprocess.DEVNULL, creationflags=creation_flags))
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}),
                                            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        base = f'http://127.0.0.1:{frontend_port}'

        def request(path: str, payload: dict | None = None, headers: dict | None = None):
            data = json.dumps(payload).encode('utf-8') if payload is not None else None
            supplied = {'Content-Type': 'application/json', **(headers or {})}
            with opener.open(urllib.request.Request(base + path, data=data, headers=supplied), timeout=5) as response:
                return response.status, response.read()

        wait_until(lambda: request('/health/ready')[0] == 200, 'Frontend proxy va backend')
        status, html = request('/')
        if status != 200 or b'id="root"' not in html:
            raise RuntimeError('Frontend khong tra trang React du kien.')
        status, body = request('/health/ready')
        health = json.loads(body)
        if health.get('database') != 'Healthy' or health.get('instance') != 'task5-lab-gia':
            raise RuntimeError('Backend thu khong xac nhan dung database va instance.')
        print('4/4 Dang nhap va tao don gia thong qua proxy frontend...', flush=True)
        status, _ = request('/api/auth/login', {'username': 'task5_lab_admin', 'password': login_pw})
        if status != 200:
            raise RuntimeError('Dang nhap gia khong thanh cong.')
        status, body = request('/api/products', {'name': 'San pham gia task 5',
                                                'unit_price': '100.00', 'stock_quantity': 5})
        if status != 201:
            raise RuntimeError('Khong tao duoc san pham gia.')
        product_id = json.loads(body)['id']
        status, body = request('/api/orders', {'product_id': product_id,
                                               'customer_name': 'Khach gia task 5',
                                               'product_name': 'San pham gia task 5',
                                               'quantity': 2, 'total_amount': '200.00',
                                               'status': 'Pending'},
                               {'Idempotency-Key': str(uuid.uuid4())})
        if status != 201:
            raise RuntimeError('Khong tao duoc don gia.')
        order = json.loads(body)['order']
        result = mysql(f"SELECT COUNT(*), (SELECT stock_quantity FROM products WHERE id='{product_id}') "
                       f"FROM orders WHERE id='{order['id']}' AND product_id='{product_id}';", DB)
        if result.strip() != b'1\t3':
            raise RuntimeError('Du lieu don gia hoac ton kho sau giao dich khong dung.')

        finished = datetime.now(timezone(timedelta(hours=7)))
        evidence = ROOT / 'database-deliverables' / '05_CHUYEN_DOI' / 'minh-chung'
        evidence.mkdir(parents=True, exist_ok=True)
        report = evidence / ('kiem-tra-duong-di-' + started.strftime('%Y%m%d-%H%M%S') + '-' + tag + '.md')
        report.write_text('# Task 5 — Kiểm tra đường đi với dữ liệu giả\n\n'
                          '- Kết quả: **PASS**.\n'
                          f'- Bắt đầu: {started:%d/%m/%Y %H:%M:%S %z}; hoàn thành: {finished:%d/%m/%Y %H:%M:%S %z}.\n'
                          '- Phạm vi: một MySQL 8.4.13 tạm trong mạng Docker riêng, cổng MySQL, backend và Vite trên loopback. '
                          'Mạng Docker này không được cấu hình chặn mọi kết nối ra ngoài.\n'
                          '- Đã kiểm tra trang React được phục vụ, `/health/ready` qua Vite, đăng nhập giả, '
                          'tạo sản phẩm giả tồn 5, tạo đơn giả số lượng 2 và kiểm tra tồn còn 3 trong MySQL.\n'
                          '- Kiểm tra HTTP/proxy; chưa kiểm tra thao tác bằng trình duyệt.\n'
                          '- Không kết nối Aiven hoặc MySQL standby 3308; không dùng dữ liệu thật.\n'
                          '- Chưa kiểm tra replication hai máy, failover, failback hoặc RTO/RPO.\n', encoding='utf-8')
        print('KET QUA: PASS — giao dien/proxy, backend va MySQL gia.', flush=True)
        print('BAO CAO: ' + str(report), flush=True)
    finally:
        for process in reversed(processes):
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=8)
        if container_started:
            subprocess.run(['docker', 'stop', '--time', '10', container], stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, timeout=30)
        if network_created:
            subprocess.run(['docker', 'network', 'rm', network], stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, timeout=30)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('LOI: ' + str(exc), file=sys.stderr)
        sys.exit(1)
