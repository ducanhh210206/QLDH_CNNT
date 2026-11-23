import {z} from 'zod';
import {pool} from '../config/database.js';
const timestamp=z.iso.datetime();
const identifier=z.string().regex(/^[a-zA-Z0-9-]{1,64}$/);
const incident=z.object({id:identifier,timeline:z.array(z.object({stage:z.string(),at:timestamp}).passthrough())}).passthrough();
const event=z.object({id:identifier,created_at:timestamp}).passthrough();
const snapshotSchema=z.object({checked_at:timestamp,components:z.array(z.object({name:z.string()}).passthrough()),incidents:z.array(incident).default([]),events:z.array(event).default([])}).passthrough();
const decode=x=>typeof x==='string'?JSON.parse(x):x;
const sqlTime=x=>new Date(x).toISOString().slice(0,23).replace('T',' ');
export function validMonitoringSnapshot(value){return snapshotSchema.parse(value);}
export async function saveMonitoringHistory(value,db=pool){
 const snapshot=validMonitoringSnapshot(value);
 const observed=sqlTime(snapshot.checked_at);
 const records=[['snapshot','latest',snapshot.checked_at,{
   checked_at:snapshot.checked_at,server_time:snapshot.server_time,components:snapshot.components,
   replication:snapshot.replication,poll_interval_ms:snapshot.poll_interval_ms,rpo_probe:snapshot.rpo_probe,
 }],...snapshot.incidents.map(i=>['incident',i.id,i.timeline.find(e=>e.stage==='detected')?.at||snapshot.checked_at,i]),
 ...snapshot.events.map(e=>['event',e.id,e.created_at,e])];
 // A single atomic upsert preserves history missing from a later Monitoring
 // restart and rejects updates from older in-flight polls on another backend.
 for(let index=0;index<records.length;index+=100){
  const batch=records.slice(index,index+100);
  await db.query('INSERT INTO monitoring_history(kind,record_id,observed_at,event_at,payload) VALUES '+batch.map(()=>'(?,?,?,?,?)').join(',')+
   ' ON DUPLICATE KEY UPDATE payload=IF(VALUES(observed_at)>=observed_at,VALUES(payload),payload),event_at=IF(VALUES(observed_at)>=observed_at,VALUES(event_at),event_at),observed_at=GREATEST(observed_at,VALUES(observed_at))',
   batch.flatMap(([kind,id,at,payload])=>[kind,id,observed,sqlTime(at),JSON.stringify(payload)]));
 }
}
export async function readMonitoringHistory(db=pool){
 const [snapshots]=await db.query("SELECT payload FROM monitoring_history WHERE kind='snapshot' AND record_id='latest'");
 const [incidents]=await db.query("SELECT payload FROM monitoring_history WHERE kind='incident' ORDER BY event_at DESC,record_id DESC LIMIT 1000");
 const [events]=await db.query("SELECT payload FROM monitoring_history WHERE kind='event' ORDER BY event_at DESC,record_id DESC LIMIT 200");
 return {snapshot:snapshots[0]?decode(snapshots[0].payload):null,incidents:incidents.map(x=>decode(x.payload)),events:events.map(x=>decode(x.payload)).reverse()};
}
export function historicalMonitoring(archive){
 return {...(archive.snapshot||{}),status:'Unknown',active_instance:null,history_only:true,source:'database_history',
  incidents:archive.incidents,events:archive.events,
  message:archive.snapshot?'Monitoring mất kết nối — đang xem lịch sử đã lưu.':'Monitoring mất kết nối; chưa có lịch sử lưu trên database.'};
}
export async function loadMonitoringWithHistory(fetchLive,db=pool){
 let live;
 try{live=validMonitoringSnapshot(await fetchLive());}catch{
  try{return historicalMonitoring(await readMonitoringHistory(db));}
  catch{return {status:'Unknown',components:[],incidents:[],events:[],history_only:true,archive_error:true,message:'Không kết nối được Monitoring và chưa đọc được kho lịch sử.'};}
 }
 let archiveError=false;
 try{await saveMonitoringHistory(live,db);}catch{archiveError=true;}
 let archive;
 try{archive=await readMonitoringHistory(db);}catch{archiveError=true;}
 const merge=(old,current)=>{const map=new Map((old||[]).map(x=>[x.id,x]));for(const x of current)map.set(x.id,x);return [...map.values()];};
 return {...live,history_only:false,source:'live',archive_error:archiveError,
  incidents:merge(archive?.incidents,live.incidents).sort((a,b)=>Date.parse(b.timeline.find(e=>e.stage==='detected')?.at||0)-Date.parse(a.timeline.find(e=>e.stage==='detected')?.at||0)),
  events:merge(archive?.events,live.events).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)).slice(-200)};
}
