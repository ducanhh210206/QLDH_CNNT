"""Tao tai khoan monitoring cho standby 3308 duoc khoi tao ngay 13/11."""
import importlib.util
from pathlib import Path
import subprocess
import sys

path = Path(__file__).with_name('tao-tai-khoan-monitoring.py')
spec = importlib.util.spec_from_file_location('monitor_account', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.standby.UUID = '89eec56a-df06-11f1-a083-06e5fff3c5aa'
module.standby.COMMAND[3] = 'omdrs-standby-20261113-3308'
module.SERVER_ID = '493203312'

if __name__ == '__main__':
    try:
        module.main()
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        print('LOI: ' + str(exc), file=sys.stderr)
        sys.exit(1)
