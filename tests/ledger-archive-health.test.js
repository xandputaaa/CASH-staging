'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {evaluateArchiveHealth}=require('../ledger-archive-health');
const NOW=Date.parse('2026-11-18T05:00:00Z');
const rec=(id,event='schedule',status='completed',conclusion='success',
 time='2026-11-18T04:23:00Z')=>
 ({id,event,status,conclusion,created_at:time});
const head=(id='44240000001')=>({sha:'a'.repeat(40),commit:{
 message:'Archive public schedule-only CASH witnesses (run '+id+')',
 author:{date:'2026-11-18T04:28:00Z'}
}});
function inspect(r=[],l=[],c={},nowMs=NOW){
 return evaluateArchiveHealth({
  reconciliationRuns:{workflow_runs:r},ledgerRuns:{workflow_runs:l},
  ledgerCommit:c,nowMs
 });
}
test('missing scheduled job is explicitly reported even if PR reconciliation succeeded',()=>{
 const a=inspect([rec(44240000002,'pull_request')]);
 assert.equal(a.archiveStatus,'NO_SCHEDULED_RECONCILIATION_OBSERVED');
 assert.equal(a.scheduledReconciliationRuns,0);
 assert.equal(a.independentQualifiedCount,0);
 assert.equal(a.ordersEnabled,false);
});
test('scheduled reconciliation success is NOT proof of archival Git commit',()=>{
 const a=inspect([rec(44240000001)],[
  rec(44240000003,'workflow_run','completed','skipped')]);
 assert.equal(a.archiveStatus,'SCHEDULED_RECONCILIATION_SUCCEEDED_ARCHIVE_UNCONFIRMED');
 assert.equal(a.successfulScheduledReconciliations,1);
 assert.equal(a.skippedLedgerWorkflows,1);
 assert.equal(a.ledgerHeadCommitCorroboratesSuccessfulScheduledRunInWindow,false);
});
test('can link exact scheduled successful reconciliation id to a later ledger Git branch commit',()=>{
 const a=inspect([rec(44240000001)],[
  rec(44240000002,'workflow_run','completed','success')],head());
 assert.equal(a.archiveStatus,'PUBLIC_LEDGER_COMMIT_MATCHES_SCHEDULED_SOURCE');
 assert.equal(a.ledgerHeadCommitCorroboratesSuccessfulScheduledRunInWindow,true);
 assert.equal(a.successfulLedgerWorkflows,1);
 assert.equal(a.independentQualifiedCount,0);
});
test('PR/manual origin or failed scheduled run cannot certify a ledger commit',()=>{
 const cases=[
  [rec(44240000001,'pull_request')],
  [rec(44240000001,'workflow_dispatch')],
  [rec(44240000001,'schedule','completed','failure')]
 ];
 for(const x of cases){
  const a=inspect(x,[],head());
  assert.equal(a.ledgerHeadCommitCorroboratesSuccessfulScheduledRunInWindow,false);
  assert.notEqual(a.archiveStatus,'PUBLIC_LEDGER_COMMIT_MATCHES_SCHEDULED_SOURCE');
 }
});
test('altered branch commit message/sha or old invalid author cannot certify original scheduled source',()=>{
 const good=[rec(44240000001)];
 for(const patch of [
  {...head(),sha:'INVALID'},
  {...head(),commit:{...head().commit,message:'Manually wrote an archive'}},
  {...head(),commit:{...head().commit,author:{date:'2026-11-18T03:20:00Z'}}},
  head('44240000099')
 ]){
  const a=inspect(good,[],patch);
  assert.equal(a.ledgerHeadCommitCorroboratesSuccessfulScheduledRunInWindow,false);
 }
});
test('in-progress schedule, earlier success, and archive skip are reported without a false failure',()=>{
 const a=inspect([
  rec(44240000002,'schedule','in_progress',null,'2026-11-18T04:50:00Z'),
  rec(44240000001)
 ],[rec(44240000003,'workflow_run','completed','skipped')]);
 assert.equal(a.scheduledReconciliationRuns,2);
 assert.equal(a.archiveStatus,'SCHEDULED_RECONCILIATION_IN_PROGRESS');
 assert.equal(a.successfulScheduledReconciliations,1);
 assert.equal(a.failedOrSkippedScheduledReconciliations,0);
});
test('old schedules outside the bounded API window are not treated as present',()=>{
 const a=inspect([rec(44240000001,'schedule','completed','success',
  '2026-11-17T06:00:00Z')]);
 assert.equal(a.scheduledReconciliationRuns,0);
 assert.equal(a.archiveStatus,'NO_SCHEDULED_RECONCILIATION_OBSERVED');
 assert.equal(a.observedWindowHours,8);
});
test('invalid GitHub API data or invalid clock fails visibly, not as a made-up verified archive',()=>{
 assert.throws(()=>evaluateArchiveHealth({
  reconciliationRuns:{error:'rate limit'},ledgerRuns:{workflow_runs:[]},
  ledgerCommit:{},nowMs:NOW
 }),/Missing GitHub Actions history/);
 assert.throws(()=>inspect([],[],{},NaN),/Bad report clock/);
});
