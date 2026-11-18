import { pool } from '../config/database.js';
import { databaseLockName } from '../config/env.js';
export const restoreLockName = () => databaseLockName() + ':restore';
export async function restoreGuard(req, res, next) {
  if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
  // Apply itself uses an exclusive lock and returns a conflict for a second
  // request. Other writes on any updated backend sharing this DB are rejected.
  try {
    const [rows] = await pool.execute('SELECT IS_USED_LOCK(?) AS restore_owner',[restoreLockName()]);
    if (rows[0]?.restore_owner != null) return res.status(503).json({error:{code:'RESTORE_IN_PROGRESS',message:'Hệ thống đang khôi phục dữ liệu. Đợi hoàn tất rồi tải lại trang trước khi thao tác.'}});
    next();
  } catch(e) { next(e); }
}
