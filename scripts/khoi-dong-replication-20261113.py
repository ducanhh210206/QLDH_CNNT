"""Start the replacement standby prepared from the verified 2026-11-13 seed."""
import importlib.util
from pathlib import Path
import subprocess
import sys

path = Path(__file__).with_name('khoi-dong-replication-aiven.py')
spec = importlib.util.spec_from_file_location('replication_aiven', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

module.CONTAINER = 'omdrs-standby-20261113-3308'
module.TARGET_UUID = '89eec56a-df06-11f1-a083-06e5fff3c5aa'
module.TARGET_SERVER_ID = '493203312'
# This standby now includes recovery_probes alongside the original 13 tables.
module.EXPECTED_TABLE_COUNT = '14'
module.SNAPSHOT = ('4ee3c1e3-d6a4-11f1-a8ab-36f3fcbe0671:1-103,'
                   'c4ee9c9b-d7fc-11f1-ac26-f2d5b3407bc1:1-129')

if __name__ == '__main__':
    try:
        module.main()
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        module.save_result('error', error=str(exc))
        print('LOI: ' + str(exc), file=sys.stderr)
        print('Neu lenh da bat dau, kiem tra trang thai truoc khi thu lai.', file=sys.stderr)
        sys.exit(1)
