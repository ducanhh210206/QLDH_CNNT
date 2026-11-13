import test from 'node:test';
import assert from 'node:assert/strict';
import { liveRecoveryMetrics } from '../src/services/recoveryMetrics.js';
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
