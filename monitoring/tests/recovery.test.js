import test from 'node:test';
import assert from 'node:assert/strict';
import { activeInstance, observeIncidents, recordMilestone, recoveryMetrics } from '../src/recovery.js';
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
