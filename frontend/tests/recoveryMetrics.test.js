import test from 'node:test';
import assert from 'node:assert/strict';
import { liveRecoveryMetrics, automaticRecoveryMetrics } from '../src/services/recoveryMetrics.js';
const start = Date.parse('2026-11-13T01:00:00Z');
const event = (stage, seconds) => ({stage,at:new Date(start+seconds*1000).toISOString()});

test('observation ticks without inventing actual RTO, RPO or failover start', () => {
  const i = {timeline:[event('detected',10)]};
  assert.equal(liveRecoveryMetrics(i,start+15000).observation,5000);
  const later = liveRecoveryMetrics(i,start+20000);
  assert.equal(later.observation,10000);
  assert.equal(later.rto.value,null);
  assert.equal(later.rpo,null);
  assert.equal(later.failover.value,null);
  i.timeline.push(event('standby_active',25));
  assert.equal(liveRecoveryMetrics(i,start+60000).observation,15000);
  assert.equal(liveRecoveryMetrics(i,start+60000).observationLive,false);
});

test('evidenced counters tick then finalize, while stale or closed tracking never continues counting', () => {
  const i = {timeline:[event('fault_started',0),event('detected',10),event('failover_started',12)]};
  let m = liveRecoveryMetrics(i,start+20000);
  assert.deepEqual(m.rto,{value:20000,live:true});
  assert.deepEqual(m.failover,{value:8000,live:true});
  assert.equal(m.detection,10000);
  assert.equal(liveRecoveryMetrics(i,start+90000,true).rto.value,null);
  assert.equal(liveRecoveryMetrics({...i,tracking_closed_at:new Date(start+30000).toISOString()},start+90000).rto.value,null);
  i.timeline.push(event('standby_active',25),event('recovered',30));
  i.verified_data_at = new Date(start-2000).toISOString();
  m = liveRecoveryMetrics(i,start+90000);
  assert.deepEqual(m.rto,{value:30000,live:false});
  assert.deepEqual(m.failover,{value:13000,live:false});
  assert.equal(m.rpo,2000);
});

test('automatic API measurements tick and stop without operator milestones or fabricated RPO', () => {
  const i = {timeline:[event('detected',10)],observation:{
    primary_last_healthy_at:event('',0).at,gateway_last_primary_at:event('',1).at,
    gateway_unavailable_at:event('',10).at,
  }};
  let m = automaticRecoveryMetrics(i,start+20000);
  assert.equal(m.apiRto,10000);
  assert.equal(m.detectionWindow,10000);
  assert.equal(m.gatewaySwitch,10000);
  assert.equal(m.gatewayBound,false);
  assert.equal(m.rpo,null);
  assert.equal(m.live,true);
  i.api_recovered_at=event('',25).at;
  i.api_recovered_instance='standby';
  m = automaticRecoveryMetrics(i,start+90000);
  assert.equal(m.apiRto,15000);
  assert.equal(m.gatewaySwitch,15000);
  assert.equal(m.state,'API đã phục hồi');
  assert.equal(m.live,false);
  assert.equal(automaticRecoveryMetrics(i,start+100000).apiRto,15000);
});

test('direct switch uses a sampling upper bound, while missing history stays unknown', () => {
  const i = {timeline:[event('detected',10),event('standby_active',10)],observation:{gateway_last_primary_at:event('',0).at}};
  const m=automaticRecoveryMetrics(i,start+100000);
  assert.equal(m.apiRto,0);
  assert.equal(m.gatewaySwitch,10000);
  assert.equal(m.gatewayBound,true);
  assert.equal(m.detectionWindow,null);
  const unknown=automaticRecoveryMetrics({timeline:[event('detected',10)]},start+100000,true);
  assert.equal(unknown.apiRto,null);
  assert.equal(unknown.live,false);
});
