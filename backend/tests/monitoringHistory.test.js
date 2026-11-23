import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {pool} from '../src/config/database.js';
import {loadMonitoringWithHistory,saveMonitoringHistory} from '../src/services/monitoringHistory.js';
after(()=>pool.end());
const at='2026-11-23T07:00:00.000Z';
const incident={id:'old-drill',timeline:[{stage:'detected',at}],api_recovered_at:at};
const saved={checked_at:at,components:[{name:'Primary',status:'Healthy'}],active_instance:'primary'};
const row=x=>({payload:JSON.stringify(x)});
function archiveDb({fail=false}={}){return {async query(sql){if(fail)throw Error('offline');if(sql.includes("kind='snapshot'"))return [[row(saved)]];if(sql.includes("kind='incident'"))return [[row(incident)]];if(sql.includes("kind='event'"))return [[row({id:'event-1',created_at:at})]];return [{}];}};}
test('offline archive retains measured history but never claims current primary/healthy',async()=>{
 const r=await loadMonitoringWithHistory(async()=>{throw Error('tunnel down');},archiveDb());
 assert.equal(r.history_only,true);assert.equal(r.active_instance,null);assert.equal(r.status,'Unknown');assert.equal(r.checked_at,at);assert.equal(r.incidents[0].id,'old-drill');assert.equal(r.events.length,1);
});
test('live monitoring after a restart merges old drills instead of deleting them',async()=>{
 const r=await loadMonitoringWithHistory(async()=>({...saved,events:[],incidents:[],active_instance:'standby'}),archiveDb());
 assert.equal(r.history_only,false);assert.equal(r.active_instance,'standby');assert.equal(r.incidents.length,1);
});
test('archive failure does not hide live monitoring and is visible to user',async()=>{
 const r=await loadMonitoringWithHistory(async()=>({...saved,incidents:[],events:[]}),archiveDb({fail:true}));assert.equal(r.history_only,false);assert.equal(r.archive_error,true);
 const offline=await loadMonitoringWithHistory(async()=>{throw Error();},archiveDb({fail:true}));assert.equal(offline.archive_error,true);assert.deepEqual(offline.incidents,[]);
});
test('invalid monitoring response uses history; duplicate ids upsert and older polls cannot overwrite',async()=>{
 const invalid=await loadMonitoringWithHistory(async()=>({status:'Healthy'}),archiveDb());assert.equal(invalid.history_only,true);
 let called=false;await saveMonitoringHistory({...saved,incidents:[incident],events:[]},{async query(sql,args){called=true;assert.match(sql,/ON DUPLICATE KEY UPDATE/);assert.match(sql,/GREATEST/);assert.match(sql,/VALUES\(observed_at\)>=observed_at/);assert.equal(args[0],'snapshot');}});assert.ok(called);
});
