"""Khoi dong replication cho standby va ban seed sau failback 08/11/2026."""
import importlib.util
from pathlib import Path
import subprocess
import sys

script_path = Path(__file__).with_name('khoi-dong-replication-aiven.py')
spec = importlib.util.spec_from_file_location('replication_aiven', script_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

module.CONTAINER = 'omdrs-standby-sau-failback-mysql-standby-1'
module.TARGET_UUID = '13bc73d1-db6d-11f1-8c8e-22c586f6983b'
module.TARGET_SERVER_ID = '493203310'
module.SNAPSHOT = ('4ee3c1e3-d6a4-11f1-a8ab-36f3fcbe0671:1-103,'
                   'c4ee9c9b-d7fc-11f1-ac26-f2d5b3407bc1:1-78')

if __name__ == '__main__':
    try:
        module.main()
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        module.save_result('error', error=str(exc))
        print('LOI: ' + str(exc), file=sys.stderr)
        print('Neu lenh da bat dau, kiem tra trang thai truoc khi thu lai.', file=sys.stderr)
        sys.exit(1)
