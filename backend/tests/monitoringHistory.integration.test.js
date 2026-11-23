import test from 'node:test';import assert from 'node:assert/strict';import mysql from 'mysql2/promise';import {readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';
import {saveMonitoringHistory,readMonitoringHistory,loadMonitoringWithHistory} from '../src/services/monitoringHistory.js';
import {pool} from '../src/config/database.js';
test('durable archive survives reconnect, merges history, and rejects out-of-order writes',{skip:!process.env.RUN_HISTORY_INTEGRATION},async()=>{
 const c=await mysql.createConnection({host:'127.0.0.1',port:Number(process.env.TEST_HISTORY_PORT),user:'root'});const db='monitor_history_test_'+randomUUID().replaceAll('-','');
 try{
 await c.query('CREATE DATABASE `'+db+'`');await c.changeUser({database:db});await c.query(await readFile(new URL('../../database/migrations/007_monitoring_history.sql',import.meta.url),'utf8'));
 const old='2026-11-23T06:00:00.000Z',now='2026-11-23T07:00:00.000Z';
 const value={checked_at:now,components:[{name:'primary',status:'Healthy'}],incidents:[{id:'one',timeline:[{stage:'detected',at:old}],api_recovered_at:now}],events:[{id:'ev1',created_at:old}]};
 await saveMonitoringHistory(value,c);await saveMonitoringHistory(value,c);await saveMonitoringHistory({...value,checked_at:old,incidents:[{id:'one',timeline:[{stage:'detected',at:old}]}]},c);
 const a=await readMonitoringHistory(c);assert.equal(a.incidents.length,1);assert.equal(a.events.length,1);assert.equal(a.incidents[0].api_recovered_at,now);assert.equal(a.snapshot.checked_at,now);
 const offline=await loadMonitoringWithHistory(async()=>{throw Error();},c);assert.equal(offline.history_only,true);assert.equal(offline.active_instance,null);assert.equal(offline.incidents[0].api_recovered_at,now);
 const reconnect=await loadMonitoringWithHistory(async()=>({...value,incidents:[],events:[]}),c);assert.equal(reconnect.incidents.length,1);assert.equal(reconnect.history_only,false);
 }finally{await c.query('DROP DATABASE `'+db+'`');await c.end();await pool.end();}
});
