import test from 'node:test';
import assert from 'node:assert/strict';
import { activeInstance, observeIncidents, recordMilestone, recoveryMetrics, sortIncidents, reconcileIncidentHistory } from '../src/recovery.js';
import { replicationSnapshot } from '../src/replication.js';
const at = '2026-11-09T01:00:10.000Z';
const healthy = [{ name: 'Backend Primary', status: 'Healthy' }];
const offline = [{ name: 'Backend Primary', status: 'Offline' }];
test('health does not imply active; first offline probe does not invent an incident', () => {
  assert.equal(activeInstance(healthy), null);
  assert.deepEqual(observeIncidents([], [], offline, at), []);
  assert.equal(activeInstance([{name:'API Gateway',status:'Offline',instance:'standby'}]), null);
});
test('outage, takeover and metrics retain distinct evidence and require actual milestones', () => {
  let incidents = observeIncidents([], healthy, offline, at);
  incidents = observeIncidents(incidents, offline, offline, at);
  assert.equal(incidents.length, 1);
  assert.deepEqual(Object.values(recoveryMetrics(incidents[0])), [null,null,null,null,null]);
  incidents = observeIncidents(incidents, offline, [...offline, {name:'API Gateway',status:'Healthy',instance:'standby'}], '2026-11-09T01:00:25.000Z');
  incidents = observeIncidents(incidents, offline, [...offline, {name:'API Gateway',status:'Healthy',instance:'standby'}], '2026-11-09T01:00:30.000Z');
  assert.equal(incidents[0].timeline.length, 2);
  let i = recordMilestone(incidents[0], {stage:'fault_started',at:'2026-11-09T01:00:00Z',note:'Injection log'});
  i = recordMilestone(i, {stage:'failover_started',at:'2026-11-09T01:00:12Z',note:'Operator log'});
  i = recordMilestone(i, {stage:'recovered',at:'2026-11-09T01:00:30Z',verified_data_at:'2026-11-09T00:59:58Z',note:'Restored transaction verified'});
  assert.deepEqual(recoveryMetrics(i), {rto_ms:30000,rpo_ms:2000,detection_ms:10000,failover_ms:13000,observed_recovery_ms:20000});
  assert.equal(i.timeline.find(e=>e.stage==='standby_active').source, 'gateway');
  assert.equal(i.timeline.find(e=>e.stage==='recovered').source, 'operator');
  assert.throws(()=>recordMilestone(i,{stage:'recovered',at,note:'overwrite'}));
});
test('reject chronology, future dates, invalid RPO evidence and completion without takeover', () => {
  const i = observeIncidents([], healthy, offline, at)[0];
  for (const value of [
    {stage:'fault_started',at:'2026-11-09T01:00:20Z',note:'after detection'},
    {stage:'recovered',at:'2026-11-09T01:00:20Z',note:'no takeover'},
    {stage:'failover_started',at:'2099-01-01T00:00:00Z',note:'future'},
    {stage:'standby_active',at,note:''},
    {stage:'standby_active',at,note:'invalid RPO',verified_data_at:at},
  ]) assert.throws(()=>recordMilestone(i,value));
  assert.equal(i.timeline.length, 1);
});
test('replication distinguishes no channel, null lag, stopped thread, multi-channel and true zero', () => {
  assert.equal(replicationSnapshot([],at).status,'Not Configured');
  const row = {Replica_IO_Running:'Yes',Replica_SQL_Running:'Yes',Seconds_Behind_Source:0};
  assert.equal(replicationSnapshot([row],at).lag_seconds,0);
  assert.equal(replicationSnapshot([{...row,Seconds_Behind_Source:null}],at).lag_seconds,null);
  assert.equal(replicationSnapshot([{...row,Replica_IO_Running:'No'}],at).lag_seconds,null);
  assert.equal(replicationSnapshot([{...row,Last_SQL_Errno:123}],at).status,'Unhealthy');
  assert.equal(replicationSnapshot([row,{...row,Channel_Name:'second',Seconds_Behind_Source:8}],at).lag_seconds,8);
});

test('a new outage is not swallowed by an incomplete historical incident', () => {
  const historical = {id:'old',timeline:[{stage:'detected',at:'2026-11-01T00:00:00Z'}]};
  const incidents = observeIncidents([historical], healthy, offline, at);
  assert.equal(incidents.length, 2);
  assert.notEqual(incidents[0].id, 'old');
  assert.equal(incidents[1].tracking_close_reason, 'new_outage');
  assert.equal(incidents[1].timeline.length, 1);
  assert.equal(incidents[0].trigger, 'primary_outage');
  observeIncidents(incidents, offline, offline, at);
  assert.equal(incidents.length, 2);
});

test('return to Primary closes tracking without claiming recovery; next switch starts a separate incident', () => {
  const gateway = instance => ({name:'API Gateway',status:'Healthy',instance});
  let incidents = observeIncidents([], [...healthy,gateway('primary')], [...offline,gateway('standby')], at);
  const id = incidents[0].id;
  incidents = observeIncidents(incidents, [...offline,gateway('standby')], [...healthy,gateway('primary')], '2026-11-09T01:02:00Z');
  assert.equal(incidents[0].tracking_close_reason, 'primary_active');
  assert.equal(incidents[0].timeline.some(e=>e.stage==='recovered'),false);
  assert.equal(recoveryMetrics(incidents[0]).rto_ms,null);
  incidents = observeIncidents(incidents, [...healthy,gateway('primary')], [...healthy,gateway('standby')], '2026-11-09T01:03:00Z');
  assert.equal(incidents.length,2);
  assert.notEqual(incidents[0].id,id);
  assert.equal(incidents[0].trigger,'gateway_switch');
  assert.equal(incidents[0].timeline.some(e=>e.stage==='fault_started'),false);
});

test('startup restores missing detections from evidence, preserves legacy history and is idempotent', () => {
  const old = {id:'legacy',timeline:[{stage:'detected',at:'2026-11-01T00:00:00.009Z'}]};
  const history = [
    {id:'legacy-event',component:'Backend Primary',from:'Healthy',status:'Offline',created_at:'2026-11-01T00:00:00Z'},
    {id:'missed',component:'Backend Primary',from:'Healthy',status:'Offline',created_at:at},
    {id:'boot',component:'Backend Primary',from:'Unknown',status:'Offline',created_at:'2026-11-09T01:00:15Z'},
  ];
  let incidents = reconcileIncidentHistory([old],history);
  assert.equal(incidents.length,2);
  assert.equal(incidents[0].detection_event_id,'missed');
  assert.equal(incidents[0].timeline.length,1);
  assert.equal(incidents[0].timeline[0].at,at);
  assert.equal(incidents[1].id,'legacy');
  assert.equal(incidents[1].tracking_closed_at,at);
  assert.deepEqual(Object.values(recoveryMetrics(incidents[0])),[null,null,null,null,null]);
  const saved = JSON.stringify(incidents);
  incidents = reconcileIncidentHistory(incidents,history);
  assert.equal(JSON.stringify(incidents),saved);
});

test('more than 100 incidents remain available and edits to an old incident do not make it newest', () => {
  const incidents = Array.from({length:105},(_,n)=>({id:String(n),timeline:[{stage:'detected',at:new Date(Date.parse(at)+n*10000).toISOString()}]}));
  const sorted = sortIncidents(incidents);
  assert.equal(sorted[0].id,'104');
  const next = observeIncidents(sorted,offline,offline,'2026-11-09T02:00:00Z');
  assert.equal(next.length,105);
  assert.equal(next.at(-1).id,'0');
});
