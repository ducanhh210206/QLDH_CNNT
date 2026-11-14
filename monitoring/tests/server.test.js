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
  const probeIds = new Set();
  const fake = http.createServer(async (req,res)=>{
    res.setHeader('content-type','application/json');
    if (req.url.startsWith('/gateway/api/monitoring/recovery-probes')) {
      assert.equal(req.headers.authorization, 'Bearer '+token);
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const payload = JSON.parse(Buffer.concat(chunks));
      if (req.url.endsWith('/check')) {
        assert.ok(standby);
        res.end(JSON.stringify({instance:'standby',ids:payload.ids.filter(id=>probeIds.has(id))}));
      } else {
        assert.ok(primary && !standby);
        probeIds.add(payload.id);
        res.end(JSON.stringify({instance:'primary',id:payload.id}));
      }
      return;
    }
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
      MONITOR_INTERVAL_MS:'5000',REPLICA_DB_HOST:'',RPO_PROBE_ENABLED:'true'},stdio:['ignore','pipe','pipe']});
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
    await stop();
    primary=false; standby=true;
    await launch();
    let body;
    for(let n=0;n<65;n++){body=await status();if(body.incidents.length)break;await delay(100);}
    assert.equal(body.incidents.length,1);
    const incident=body.incidents[0];
    assert.equal(incident.rpo_observation.status,'verified');
    assert.equal(incident.rpo_observation.reference,'detected');
    assert.ok(incident.rpo_observation.rpo_ms >= 0);
    assert.equal(body.active_instance,'standby');
    assert.equal(incident.timeline.find(e=>e.stage==='standby_active').source,'gateway');
    assert.equal(incident.api_recovered_instance,'standby');
    assert.equal(incident.api_recovered_at,incident.timeline.find(e=>e.stage==='standby_active').at);
    assert.ok(incident.observation.primary_last_healthy_at);
    assert.ok(incident.observation.gateway_last_primary_at);
    const endpoint=monitorBase+'/incidents/'+incident.id+'/milestones';
    const at = new Date(Date.parse(incident.timeline[0].at)-1000).toISOString();
    const input={stage:'fault_started',at,note:'isolated fixture log'};
    assert.equal((await fetch(endpoint,{method:'POST',body:JSON.stringify(input)})).status,401);
    const post=()=>fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(input)});
    assert.equal((await post()).status,200);
    assert.equal((await post()).status,400);
    assert.equal((await status()).incidents[0].metrics.detection_ms,1000);
    const verifiedDataAt = new Date(Date.parse(at)-2000).toISOString();
    const verify = (verified_data_at, note = 'Đơn DEMO-001 khớp trên Standby') =>
      fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify({
        stage:'rpo_verified',at,verified_data_at,note,
      })});
    assert.equal((await verify(incident.timeline[0].at)).status,400);
    assert.equal((await verify(verifiedDataAt)).status,200);
    assert.equal((await verify(verifiedDataAt)).status,200);
    assert.equal((await verify(at)).status,400);
    assert.equal((await status()).incidents[0].metrics.rpo_ms,2000);
    // Repeated polls must not create duplicate incidents.
    assert.equal((await status()).incidents.length,1);
    primary=true; standby=false;
    for(let n=0;n<65;n++){body=await status();if(body.active_instance==='primary' && body.components[0].status==='Healthy')break;await delay(100);}
    assert.equal(body.active_instance,'primary');
    primary=false; standby=true;
    for(let n=0;n<65;n++){body=await status();if(body.incidents.length===2)break;await delay(100);}
    assert.equal(body.incidents.length,2);
    assert.notEqual(body.incidents[0].id,incident.id);
    assert.ok(body.incidents.some(i=>i.id===incident.id));
    const newestId=body.incidents[0].id;
    const faultAt = new Date(Date.parse(body.incidents[0].timeline[0].at)-1000).toISOString();
    const confirmNew = await fetch(monitorBase+'/incidents/'+newestId+'/milestones',{
      method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify({
        stage:'rpo_verified',at:faultAt,verified_data_at:faultAt,note:'Đơn DEMO-002 khớp trên Standby',
      }),
    });
    assert.equal(confirmNew.status,200);
    await stop(); await launch();
    body=await status();
    assert.equal(body.incidents.length,2);
    assert.equal(body.incidents[0].id,newestId);
    assert.equal(body.incidents[0].api_recovered_instance,'standby');
    assert.ok(body.incidents[0].api_recovered_at);
    assert.equal(body.incidents[0].metrics.rpo_ms,0);
    assert.ok((await readFile(join(dir,'recovery.jsonl'),'utf8')).includes(incident.id));
    await stop(); await launch();
    assert.equal((await status()).incidents[0].id,newestId);
    assert.equal((await status()).incidents.find(i=>i.id===incident.id).metrics.detection_ms,1000);
    assert.equal((await status()).incidents.find(i=>i.id===incident.id).metrics.rpo_ms,2000);
    assert.equal((await status()).incidents.find(i=>i.id===incident.id).rpo_observation.probe_id,incident.rpo_observation.probe_id);
  } finally { await stop(); await new Promise(resolve=>fake.close(resolve)); await rm(dir,{recursive:true,force:true}); }
});
