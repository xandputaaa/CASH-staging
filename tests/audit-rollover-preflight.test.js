'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {hashEvent}=require('../audit-journal');
const {assessRolloverReadiness}=require('../audit-rollover-preflight');
function journal(n){
 const events=[];let previousHash='GENESIS';
 for(let i=0;i<n;i++){
  const e={sequence:i+1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00.000Z',
   payload:{id:'sample-'+i},previousHash};
  e.hash=hashEvent(e);events.push(e);previousHash=e.hash;
 }
 return events;
}
test('near-capacity journal is blocked without mutation or deletion',()=>{
 const events=journal(300),before=JSON.stringify(events);
 const result=assessRolloverReadiness(events);
 assert.equal(result.status,'CAPTURE_BLOCKED');
 assert.equal(result.pendingCount,300);
 assert.equal(result.eventCount,300);
 assert.equal(result.safeNewCaptures,0);
 assert.equal(result.canRotateAutomatically,false);
 assert.equal(result.mutatesStorage,false);
 assert.equal(JSON.stringify(events),before);
});
test('capacity preflight preserves chain tip and unverified evidence label',()=>{
 const events=journal(2),result=assessRolloverReadiness(events);
 assert.equal(result.chainTip,events[1].hash);
 assert.equal(result.evidenceStatus,'FILESYSTEM_JOURNAL_UNVERIFIED');
 assert.equal(result.safeNewCaptures,298);
});
test('preflight rejects tampering before proposing rollover',()=>{
 const events=journal(2);events[0].payload.id='changed';
 assert.throws(()=>assessRolloverReadiness(events),/chain verification failed/);
});
test('preflight rejects duplicate record identity even with valid hashes',()=>{
 const events=journal(2);events[1].payload.id='sample-0';events[1].hash=hashEvent(events[1]);
 assert.throws(()=>assessRolloverReadiness(events),/Duplicate capture identity/);
});
