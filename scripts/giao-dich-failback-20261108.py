"""Tao SQL giao dich failback co dieu kien; khong tu ket noi database."""
import re

ORDER_ID = 'a7536c2b-8416-4057-932d-a056a1d770f5'
PRODUCT_ID = '30f21275-466c-4d30-98ca-d37e1b2ff8ae'
UUID_PATTERN = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
EXPECTED_TABLES = (b'orders', b'order_status_history', b'idempotency_keys')


def build(inserts, expected_uuid, *, expected_stock=10, test_abort_after_update=False):
    if not UUID_PATTERN.fullmatch(expected_uuid) or expected_stock not in (10, 11):
        raise ValueError('UUID hoac dieu kien thu khong hop le')
    if len(inserts) != 3:
        raise ValueError('Can dung ba cau insert')
    for line, table in zip(inserts, EXPECTED_TABLES):
        if (not line.startswith(b'INSERT INTO `' + table + b'` ') or
                not line.rstrip().endswith(b';') or b'\n' in line or b'\r' in line):
            raise ValueError('Cau insert khong dung bang hoac dinh dang')

    def guard(condition):
        # PREPARE aborts on invalid SQL; mysql batch mode exits and rolls back.
        return ("SET @fb_guard=IF(" + condition + ",'DO 0','THIS IS NOT SQL'); "
                "PREPARE fb_assert FROM @fb_guard; EXECUTE fb_assert; DEALLOCATE PREPARE fb_assert;\n")

    header = ("USE order_management; SET SESSION time_zone='+00:00'; "
              "SET SESSION sql_mode='STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION'; START TRANSACTION;\n")
    header += guard("@@server_uuid='" + expected_uuid + "' AND @@GLOBAL.read_only=0 AND @@GLOBAL.super_read_only=0")
    header += ("UPDATE products SET stock_quantity=9,version=2 WHERE id='" + PRODUCT_ID +
               "' AND stock_quantity=" + str(expected_stock) + " AND version=1;\n"
               "SET @fb_changed=ROW_COUNT();\n")
    header += guard('@fb_changed=1')
    if test_abort_after_update:
        header += guard('0')
    tail = ("\nSET @fb_orders=(SELECT COUNT(*) FROM orders WHERE id='" + ORDER_ID + "'); "
            "SET @fb_history=(SELECT COUNT(*) FROM order_status_history WHERE order_id='" + ORDER_ID + "'); "
            "SET @fb_keys=(SELECT COUNT(*) FROM idempotency_keys WHERE order_id='" + ORDER_ID + "');\n")
    tail += guard('@fb_orders=1 AND @fb_history=1 AND @fb_keys=1')
    tail += "COMMIT; SELECT 'FAILBACK_COMMIT_OK';\n"
    return header.encode('utf-8') + b'\n'.join(inserts) + tail.encode('utf-8')
