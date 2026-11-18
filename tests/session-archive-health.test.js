'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {inspectSessionArchiveHealth}=require('../session-archive-health');
const at=s=>Date.parse(s),NOW=at('2026-11-18T16:00:00Z');
const source=(id='44330000001',opts={})=>({
 id,event:'schedule',status:'completed',conclusion:'success',
 head_branch:'main',head_repository:{full_name:'xandputaaa/CASH-staging'},
 head_sha:'b'.repeat(40),created_at:'2026-11-18T15:30:00Z',
 updated_at:'2026-11-18T15:31:00Z',...opts
});
const archiveRun=(id='44330000002',opts={})=>({
 id,event:'workflow_run',status:'completed',conclusion:'success',
 created_at:'2026-11-18T15:32:00Z',...opts
});
const commit=(id='44330000001',opts={})=>({
 sha:'c'.repeat(40),commit:{
  message:'Archive unverified public CASH session source (run '+id+')',
  author:{date:'2026-11-18T15:34:00Z'}
 },...opts
});
const check=(snapshots=[],children=[],branch={},nowMs=NOW)=>
 inspectSessionArchiveHealth({
  snapshotRuns:{workflow_runs:snapshots},
  archiveRuns:{workflow_runs:children},branchCommit:branch,nowMs
 });
test('pre-activation scheduled runs and PR runs cannot fake first data commit',()=>{
 const x=check([
  source('44330000001',{event:'pull_request'}),
  source('44330000002',{created_at:'2026-11-18T13:58:00Z'})
 ],[archiveRun('44330000003',{conclusion:'skipped'})]);
 assert.equal(x.status,'NO_SCHEDULED_SNAPSHOT_SINCE_ARCHIVER_ENABLED');
 assert.equal(x.archiveBranchHeadIsDataCommit,false);
 assert.equal(x.independentQualifiedCount,0);
 assert.equal(x.ordersEnabled,false);
});
test('completed source snapshot is not enough to claim first GH archival commit',()=>{
 const a=check([source()],[archiveRun('44330000002',{conclusion:'skipped'})],{
   sha:'d'.repeat(40),commit:{message:'Initialize distinct public-only unverified research session archive branch',
    author:{date:'2026-11-18T14:13:58Z'}}
 });
 assert.equal(a.status,'FIRST_ARCHIVE_COMMIT_AWAITING_SCHEDULE');
 assert.equal(a.archiveBranchHeadIsDataCommit,false);
 assert.equal(a.archiveDataCommitMatchesSuccessfulScheduledSnapshotInWindow,false);
 assert.equal(a.sessionArchiveWorkflowsSkipped,1);
});
test('missing first archive after a two-hour grace is reported without declaring data lost',()=>{
 const x=check([source()],[],{},at('2026-11-18T18:05:00Z'));
 assert.equal(x.status,'FIRST_ARCHIVE_COMMIT_NOT_OBSERVED_AFTER_GRACE');
 assert.equal(x.lastSnapshotPastGracePeriod,true);
});
test('source failure is distinct from successful research archival',()=>{
 const x=check([source('44330000001',{conclusion:'failure'})],[],{});
 assert.equal(x.status,'SCHEDULED_SNAPSHOT_FAILED_OR_SKIPPED');
 assert.equal(x.successfulScheduledSnapshotsSinceActivation,0);
 assert.equal(x.failedScheduledSnapshotsSinceActivation,1);
});
test('exact recent successful scheduled source linked to public branch data commit',()=>{
 const x=check([source()],[archiveRun()],commit());
 assert.equal(x.status,'ARCHIVE_DATA_COMMIT_MATCHES_SCHEDULED_SOURCE');
 assert.equal(x.archiveBranchHeadSourceRunId,'44330000001');
 assert.equal(x.archiveDataCommitMatchesSuccessfulScheduledSnapshotInWindow,true);
 assert.equal(x.archiveBranchHeadIsDataCommit,true);
 assert.equal(x.externallyWitnessedPreExpiryCount,undefined);
 assert.equal(x.independentQualifiedCount,0);
 assert.equal(x.actualFillsVerified,0);
 assert.equal(x.ordersEnabled,false);
});
test('fake commit, wrong origin, or non-successful source never certifies archived scheduled source',()=>{
 const sourceList=[source()];
 const candidates=[
  commit('44330000009'),
  commit('44330000001',{sha:'bad'}),
  commit('44330000001',{commit:{
    message:'Archive unverified public CASH session source (run 44330000001)',
    author:{date:'2026-11-18T14:00:00Z'}
  }}),
  {sha:'d'.repeat(40),commit:{message:'unrelated manual archive',
    author:{date:'2026-11-18T15:34:00Z'}}}
 ];
 for(const c of candidates){
  const x=check(sourceList,[],c);
  assert.equal(x.archiveDataCommitMatchesSuccessfulScheduledSnapshotInWindow,false);
  assert.notEqual(x.status,'ARCHIVE_DATA_COMMIT_MATCHES_SCHEDULED_SOURCE');
 }
 const y=check([source('44330000001',{conclusion:'failure'})],[],commit());
 assert.equal(y.archiveDataCommitMatchesSuccessfulScheduledSnapshotInWindow,false);
});
test('later scheduled snapshot without a new commit is not invented as archived data',()=>{
 const newer=source('44330000003',{
  created_at:'2026-11-18T15:48:00Z',
  updated_at:'2026-11-18T15:49:00Z'
 });
 const x=check([newer,source()],[archiveRun('44330000004',{
  created_at:'2026-11-18T15:50:00Z'
 })],commit());
 assert.equal(x.status,'ARCHIVE_PREVIOUS_COMMIT_WITH_LATER_SUCCESSFUL_WORKFLOW_REVIEW_LOGS');
 assert.equal(x.archiveBranchHeadSourceRunId,'44330000001');
 assert.equal(x.latestSuccessfulScheduledSnapshotRunId,'44330000003');
 assert.equal(x.latestSnapshotHasSubsequentArchiveWorkflowSuccess,true);
});
test('stale archive head is flagged while valid historic source remains provenance-matched',()=>{
 const newer=source('44330000003',{
  created_at:'2026-11-18T15:48:00Z',
  updated_at:'2026-11-18T15:49:00Z'
 });
 const x=check([newer,source()],[],commit(),at('2026-11-18T18:06:00Z'));
 assert.equal(x.status,'ARCHIVE_HEAD_BEHIND_LATEST_SCHEDULE_REVIEW_REQUIRED');
 assert.equal(x.archiveDataCommitMatchesSuccessfulScheduledSnapshotInWindow,true);
});
test('invalid API payload or invalid local clock fails visibly',()=>{
 assert.throws(()=>inspectSessionArchiveHealth({
   snapshotRuns:{error:'API blocked'},archiveRuns:{workflow_runs:[]},
   branchCommit:{},nowMs:NOW}),/Missing GitHub Actions snapshot/);
 assert.throws(()=>check([],[],{},NaN),/Invalid GitHub health clock/);
});
