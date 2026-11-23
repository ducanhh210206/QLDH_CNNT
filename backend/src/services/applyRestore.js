import { digest } from '../utils/integrity.js';
import { fail } from '../utils/errors.js';
const ident = value => { if (!/^[A-Za-z0-9_]+$/.test(value)) throw Error('Invalid SQL identifier'); return '`'+value+'`'; };
export const retainedTables = ['backup_records', 'restore_records', 'schema_migrations', 'recovery_probes', 'monitoring_history'];

// InnoDB full-index locking reads also lock insertion gaps. Competing writers
// on either backend block until commit; a deadlock rolls the entire restore back.
export async function applyVerifiedRestore(c, sourceDb, targetDb, manifest, safetyManifest, userId) {
  const names = Object.keys(manifest.tables).filter(t => !retainedTables.includes(t));
  const [liveTables] = await c.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE=?',[sourceDb,'BASE TABLE']);
  if(liveTables.some(t => !retainedTables.includes(t.TABLE_NAME) && !names.includes(t.TABLE_NAME)))
    fail(409,'RESTORE_SCHEMA_CHANGED','Backup thiếu bảng nghiệp vụ hiện tại; cần backup tương thích.');
  const live = ident(sourceDb), restored = ident(targetDb);
  const desired = {};
  for (const t of names) {
    const [columns] = await c.execute('SELECT TABLE_SCHEMA,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA IN (?,?) AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',[sourceDb,targetDb,t]);
    const shape = db => columns.filter(x=>x.TABLE_SCHEMA===db).map(({TABLE_SCHEMA,...x})=>x);
    if(!shape(sourceDb).length || !shape(targetDb).length) fail(409,'RESTORE_SCHEMA_CHANGED','Thiếu bảng cần phục hồi.');
    if(JSON.stringify(shape(sourceDb))!==JSON.stringify(shape(targetDb))) fail(409,'RESTORE_SCHEMA_CHANGED','Cấu trúc đã thay đổi; cần backup tương thích phiên bản hiện tại.');
    const [engines] = await c.execute('SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?',[sourceDb,t]);
    if(engines[0]?.ENGINE!=='InnoDB') fail(409,'RESTORE_ENGINE','Chỉ phục hồi trực tiếp bảng InnoDB.');
    const [rows] = await c.query('SELECT * FROM '+restored+'.'+ident(t));
    if(digest(rows)!==manifest.tables[t].sha256) fail(409,'RESTORE_CHANGED','Database phục hồi không còn khớp backup.');
    desired[t]=rows;
  }
  if(!desired.users?.some(u=>u.id===userId && u.role==='Admin' && u.account_status==='Active')) fail(409,'RESTORE_ADMIN_MISSING','Tài khoản quản trị hiện tại không có trong backup.');
  await c.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
  await c.beginTransaction();
  try {
    for(const t of [...names].sort()) {
      const [rows]=await c.query('SELECT * FROM '+live+'.'+ident(t)+' FOR UPDATE');
      if(digest(rows)!==safetyManifest.tables[t]?.sha256) fail(409,'RESTORE_CONCURRENT_CHANGE','Dữ liệu vừa thay đổi sau backup quay lui. Tạm dừng thao tác rồi thử lại.');
    }
    await c.query('SET FOREIGN_KEY_CHECKS=0');
    for(const t of names) await c.query('DELETE FROM '+live+'.'+ident(t));
    for(const t of names) for(const row of desired[t]) {
      const keys=Object.keys(row);
      await c.execute('INSERT INTO '+live+'.'+ident(t)+' ('+keys.map(ident).join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')', keys.map(k=>row[k]!==null&&typeof row[k]==='object'?JSON.stringify(row[k]):row[k]));
    }
    // Re-enabling FK checks does not validate existing rows. Validate every FK
    // explicitly before committing, including relationships from retained tables.
    const [keys]=await c.execute('SELECT TABLE_NAME,CONSTRAINT_NAME,COLUMN_NAME,REFERENCED_TABLE_SCHEMA,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION',[sourceDb]);
    const groups=new Map();
    for(const k of keys){const id=k.TABLE_NAME+'/'+k.CONSTRAINT_NAME;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(k);}
    for(const group of groups.values()) {
      const k=group[0];
      const join=group.map(x=>'c.'+ident(x.COLUMN_NAME)+'=p.'+ident(x.REFERENCED_COLUMN_NAME)).join(' AND ');
      const nonnull=group.map(x=>'c.'+ident(x.COLUMN_NAME)+' IS NOT NULL').join(' AND ');
      const [bad]=await c.query('SELECT 1 FROM '+live+'.'+ident(k.TABLE_NAME)+' c LEFT JOIN '+ident(k.REFERENCED_TABLE_SCHEMA)+'.'+ident(k.REFERENCED_TABLE_NAME)+' p ON '+join+' WHERE '+nonnull+' AND p.'+ident(k.REFERENCED_COLUMN_NAME)+' IS NULL LIMIT 1');
      if(bad.length) fail(409,'RESTORE_FOREIGN_KEY','Dữ liệu backup có liên kết không hợp lệ; đã hủy phục hồi.');
    }
    for(const t of names){const [rows]=await c.query('SELECT * FROM '+live+'.'+ident(t));if(digest(rows)!==manifest.tables[t].sha256)throw Error('RESTORE_VERIFY_FAILED');}
    await c.query('SET FOREIGN_KEY_CHECKS=1');
    await c.commit();
    return {applied_tables:names,retained_tables:retainedTables,orders_after:desired.orders?.length||0};
  } catch(e) { await c.rollback(); throw e; }
  finally { await c.query('SET FOREIGN_KEY_CHECKS=1'); }
}
