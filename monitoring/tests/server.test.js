import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
const delay = (ms) => new Promise(resolve => setTimeout(resolve,ms));
test('independent monitor persists outage milestones across restart and protects writes', {timeout:25000}, async () => {
  const dir = await mkdtemp(join(tmpdir(),'omdrs-monitor-test-'));
  let primary = true, standby = false, processHandle;
  const fake = http.createServer((req,res)=>{
    res.setHeader('content-type','application/json');
    const isPrimary = req.url.startsWith('/primary');
    const healthy = isPrimary ? primary : true;
    res.writeHead(healthy?200:503);
    res.end(JSON.stringify({status:healthy?'Healthy':'Unhealthy',database:'Healthy',instance:isPrimary?'primary':standby?'standby':'primary'}));
  });
  await new Promise(resolve=>fake.listen(0,'127.0.0.1',resolve));
  const base = 'http://127.0.0.1:'+fake.address().port;
  const token = randomUUID()+randomUUID();
  let monitorBase;
  async function launch() {
    // Ask the OS for a free port, then release it before starting the child.
    const portServer = http.createServer();
    await new Promise(resolve=>portServer.listen(0,'127.0.0.1',resolve));
    const port = portServer.address().port;
    await new Promise(resolve=>portServer.close(resolve));
    processHandle = spawn(process.execPath,['src/server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,
      MONITOR_HOST:'127.0.0.1',MONITOR_PORT:String(port),MONITOR_DATA_DIR:dir,MONITOR_TOKEN:token,
      PRIMARY_URL:base+'/primary',STANDBY_URL:base+'/standby',GATEWAY_URL:base+'/gateway',
      MONITOR_INTERVAL_MS:'5000',REPLICA_DB_HOST:''},stdio:['ignore','pipe','pipe']});
    await new Promise((resolve,reject)=>{
      processHandle.stdout.on('data',chunk=>{if(String(chunk).includes('Monitoring listening'))resolve();});
      processHandle.once('error',reject);
      processHandle.once('exit',code=>reject(new Error('Monitor exited '+code)));
    });
    monitorBase='http://127.0.0.1:'+port;
  }
  const status = ()=>fetch(monitorBase+'/status',{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());
  async function stop() { if(processHandle?.exitCode == null){processHandle.kill('SIGTERM');await once(processHandle,'exit');} }
  try {
    await launch();
    assert.equal((await fetch(monitorBase+'/status')).status,401);
    assert.equal((await status()).active_instance,'primary');
    primary=false; standby=true;
    let body;
    for(let n=0;n<65;n++){body=await status();if(body.incidents.length)break;await delay(100);}
    assert.equal(body.incidents.length,1);
    const incident=body.incidents[0];
    assert.equal(body.active_instance,'standby');
    assert.equal(incident.timeline.find(e=>e.stage==='standby_active').source,'gateway');
    const endpoint=monitorBase+'/incidents/'+incident.id+'/milestones';
    const at = new Date(Date.parse(incident.timeline[0].at)-1000).toISOString();
    const input={stage:'fault_started',at,note:'isolated fixture log'};
    assert.equal((await fetch(endpoint,{method:'POST',body:JSON.stringify(input)})).status,401);
    const post=()=>fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(input)});
    assert.equal((await post()).status,200);
    assert.equal((await post()).status,400);
    assert.equal((await status()).incidents[0].metrics.detection_ms,1000);
    assert.ok((await readFile(join(dir,'recovery.jsonl'),'utf8')).includes(incident.id));
    await stop(); await launch();
    assert.equal((await status()).incidents[0].id,incident.id);
    assert.equal((await status()).incidents[0].metrics.detection_ms,1000);
  } finally { await stop(); await new Promise(resolve=>fake.close(resolve)); await rm(dir,{recursive:true,force:true}); }
});
