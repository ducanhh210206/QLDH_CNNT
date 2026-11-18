import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {applyVerifiedRestore,retainedTables} from '../src/services/applyRestore.js';
import {digest} from '../src/utils/integrity.js';

test('full restore removes later orders, restores stock, blocks concurrent writers and rolls back failures', {skip:!process.env.RUN_RESTORE_INTEGRATION,timeout:60000}, async()=>{
 const c=await mysql.createConnection({host:'127.0.0.1',port:Number(process.env.TEST_RESTORE_PORT),user:'root',multipleStatements:true,dateStrings:true});
 const suffix=randomUUID().replaceAll('-','');const live='tc15_live_'+suffix, target='tc15_backup_'+suffix;
 const schema=await readFile(new URL('../../database/init/schema.sql',import.meta.url),'utf8');
 const fixture=await readFile(new URL('../../database/seeds/task4_du_lieu_gia.sql',import.meta.url),'utf8');
 try{
  for(const db of [live,target]){await c.query('CREATE DATABASE `'+db+'`');await c.changeUser({database:db});await c.query("SET time_zone='+00:00'");await c.query(schema);await c.query(fixture);await c.query('UPDATE products SET stock_quantity=10');await c.query("UPDATE users SET role='Admin',account_status='Active'");}
  async function snapshot(db){const [tables]=await c.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=?',[db]);const result={tables:{}};for(const {TABLE_NAME:t} of tables){const [rows]=await c.query('SELECT * FROM `'+db+'`.`'+t+'`');result.tables[t]={sha256:digest(rows),count:rows.length};}return result;}
  // Seed timestamps must be identical for reproducible backup snapshots.
  for(const db of [live,target])for(const t of ['schema_migrations','products','users','orders','order_status_history'])await c.query('UPDATE `'+db+'`.`'+t+"` SET created_at='2026-01-01 00:00:00'").catch(async e=>{if(e.code!=='ER_BAD_FIELD_ERROR')throw e;});
  await c.changeUser({database:live});
  const [[user]]=await c.query('SELECT id FROM users LIMIT 1');
  const [[product]]=await c.query('SELECT id,stock_quantity FROM products LIMIT 1');
  const oldStock=Number(product.stock_quantity);
  const manifest=await snapshot(target);
  const newer=randomUUID();
  await c.execute("INSERT INTO orders(id,customer_name,product_name,quantity,total_amount,status,product_id) VALUES(?,'TC15_AFTER_BACKUP','sample',1,1000,'Pending',?)",[newer,product.id]);
  await c.execute('UPDATE products SET stock_quantity=stock_quantity-1 WHERE id=?',[product.id]);
  await assert.rejects(applyVerifiedRestore(c,live,target,manifest,manifest,user.id),e=>e.code==='RESTORE_CONCURRENT_CHANGE');
  const safety=await snapshot(live);
  let injected=false;
  const failing=new Proxy(c,{get(obj,key){if(key==='execute')return async(sql,args)=>{if(sql.startsWith('INSERT INTO `'+live+'`.`orders`')){injected=true;throw Error('injected');}return obj.execute(sql,args);};const v=obj[key];return typeof v==='function'?v.bind(obj):v;}});
  await assert.rejects(applyVerifiedRestore(failing,live,target,manifest,safety,user.id),/injected/);
  assert.equal(injected,true);
  assert.deepEqual(await snapshot(live),safety,'failure must restore all original rows');
  const writer=await mysql.createConnection({host:'127.0.0.1',port:Number(process.env.TEST_RESTORE_PORT),user:'root',database:live});
  let writerPromise,writerDone=false;
  const gated=new Proxy(c,{get(obj,key){if(key==='query')return async(sql,...args)=>{
    if(sql.startsWith('DELETE FROM')&&!writerPromise){
      writerPromise=writer.execute('UPDATE products SET stock_quantity=stock_quantity WHERE id=?',[product.id]).then(()=>{writerDone=true;});
      await new Promise(r=>setTimeout(r,100));assert.equal(writerDone,false,'second backend write must wait');
    }
    return obj.query(sql,...args);
   };const v=obj[key];return typeof v==='function'?v.bind(obj):v;}});
  try{const result=await applyVerifiedRestore(gated,live,target,manifest,safety,user.id);assert.ok(result.applied_tables.includes('orders'));await writerPromise;}finally{await writer.end();}
  const [[count]]=await c.execute('SELECT COUNT(*) n FROM orders WHERE id=?',[newer]);assert.equal(Number(count.n),0);
  const [[stock]]=await c.execute('SELECT stock_quantity FROM products WHERE id=?',[product.id]);assert.equal(Number(stock.stock_quantity),oldStock);
  const after=await snapshot(live);for(const t of Object.keys(manifest.tables).filter(t=>!retainedTables.includes(t)))assert.equal(after.tables[t].sha256,manifest.tables[t].sha256,t);
 // Exercise the actual service orchestration, including safety backup and
  // metadata retention, not just the transactional replacement helper.
  const backupDir=await mkdtemp(join(tmpdir(),'omdrs-full-restore-'));
  Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:String(process.env.TEST_RESTORE_PORT),DB_USER:'root',DB_PASSWORD:'',DB_NAME:live,DB_SSL:'false',BACKUP_DIR:backupDir});
  const service=await import('../src/services/backupService.js');
  const {pool}=await import('../src/config/database.js');
  try {
    await assert.rejects(service.restoreCurrentDatabase(randomUUID(),user.id,'wrong-confirmation'),e=>e.code==='CONFIRMATION_REQUIRED');
    const saved=await service.createBackup(user.id);
    await c.execute("INSERT INTO orders(id,customer_name,product_name,quantity,total_amount,status,product_id) VALUES(?,'LATER_SERVICE','sample',1,1000,'Pending',?)",[newer,product.id]);
    await c.execute('UPDATE products SET stock_quantity=stock_quantity-1 WHERE id=?',[product.id]);
    const applied=await service.restoreCurrentDatabase(saved.id,user.id,'RESTORE_CURRENT_DATABASE:'+saved.id);
    assert.equal(applied.status,'Applied');assert.equal(applied.audit_saved,true);
    const [[later]]=await c.execute('SELECT COUNT(*) n FROM orders WHERE id=?',[newer]);assert.equal(Number(later.n),0);
    const [[restoredStock]]=await c.execute('SELECT stock_quantity FROM products WHERE id=?',[product.id]);assert.equal(Number(restoredStock.stock_quantity),oldStock);
    const rollback=await service.restoreBackup(applied.report.rollback_backup_id,user.id,'RESTORE_TO_ISOLATED_DATABASE');assert.equal(rollback.status,'Verified');
    const [[oldOrder]]=await c.execute('SELECT COUNT(*) n FROM `'+rollback.target_database+'`.orders WHERE id=?',[newer]);assert.equal(Number(oldOrder.n),1,'rollback backup must include the later order');
    const [[audit]]=await c.execute('SELECT status FROM restore_records WHERE id=?',[applied.id]);assert.equal(audit.status,'Applied');
    await c.query('DROP DATABASE `'+applied.target_database+'`');await c.query('DROP DATABASE `'+rollback.target_database+'`');
  } finally {await pool.end();await rm(backupDir,{recursive:true,force:true});}
 }finally{await c.query('DROP DATABASE IF EXISTS `'+live+'`');await c.query('DROP DATABASE IF EXISTS `'+target+'`');await c.end();}
});
