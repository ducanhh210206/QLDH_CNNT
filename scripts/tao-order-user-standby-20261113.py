"""Tao tai khoan order_user tren standby moi tai cong 3308."""
import importlib.util
from pathlib import Path
import subprocess
import sys

path = Path(__file__).with_name('tao-tai-khoan-standby-sau-failback.py')
spec = importlib.util.spec_from_file_location('standby_account', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.UUID = '89eec56a-df06-11f1-a083-06e5fff3c5aa'
module.SERVER_ID = '493203312'
module.COMMAND[3] = 'omdrs-standby-20261113-3308'

if __name__ == '__main__':
    try:
        module.main()
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        print('LOI: ' + str(exc), file=sys.stderr)
        sys.exit(1)
