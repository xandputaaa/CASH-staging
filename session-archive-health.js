'use strict';
/*
 * CASH read-only GitHub operational check for the UNVERIFIED session archive.
 * Do not imply forecast accuracy, source clock attestation, complete coverage,
 * or an actual branch data commit from GitHub Actions "success" alone.
 *
 * This checker is intentionally run during the next scheduled snapshot:
 * the current snapshot has not completed or triggered its child archiver yet.
 */
const fs=require('node:fs');
const RUN=/^\d{8,16}$/,SHA=/^[a-f0-9]{40}$/;
const FIRST_ARCHIVER_MAIN_MERGE_MS=Date.parse('2026-11-18T14:18:02Z');
const WINDOW_MS=12*3600000;
const GRACE_MS=2*3600000;
const SOURCE_REPO='xandputaaa/CASH-staging';
const ms=x=>typeof x==='string'?Date.parse(x):NaN;
function runsOf(x,label){
 if(!x||!Array.isArray(x.workflow_runs))
   throw Error('Missing GitHub Actions '+label+' workflow history');
 return x.workflow_runs;
}
function eligibleSource(r,now){
 return r&&RUN.test(String(r.id))&&r.event==='schedule'&&
  r.head_branch==='main'&&r.head_repository?.full_name===SOURCE_REPO&&
  Number.isFinite(ms(r.created_at))&&
  ms(r.created_at)>=FIRST_ARCHIVER_MAIN_MERGE_MS&&
  ms(r.created_at)>=now-WINDOW_MS&&ms(r.created_at)<=now+300000;
}
function validArchiveRun(r,now){
 return r&&RUN.test(String(r.id))&&r.event==='workflow_run'&&
  Number.isFinite(ms(r.created_at))&&
  ms(r.created_at)>=now-WINDOW_MS&&ms(r.created_at)<=now+300000;
}
function inspectSessionArchiveHealth({
 snapshotRuns,archiveRuns,branchCommit,nowMs=Date.now()
}){
 if(!Number.isFinite(nowMs))throw Error('Invalid GitHub health clock');
 const source=runsOf(snapshotRuns,'snapshot')
  .filter(r=>eligibleSource(r,nowMs))
  .sort((a,b)=>ms(b.created_at)-ms(a.created_at));
 const archives=runsOf(archiveRuns,'session archive')
  .filter(r=>validArchiveRun(r,nowMs))
  .sort((a,b)=>ms(b.created_at)-ms(a.created_at));
 const successful=source.filter(r=>r.status==='completed'&&r.conclusion==='success');
 const newest=source[0]||null,latestSuccess=successful[0]||null;
 const msg=branchCommit?.commit?.message;
 const m=/^Archive unverified public CASH session source \(run (\d{8,16})\)$/
  .exec(typeof msg==='string'?msg:'');
 const committedSourceRunId=m?m[1]:null;
 const commitHasData=Boolean(m&&SHA.test(branchCommit?.sha||''));
 const linkedSource=committedSourceRunId?successful.find(r=>
   String(r.id)===committedSourceRunId&&
   Number.isFinite(ms(r.updated_at))&&
   Number.isFinite(ms(branchCommit?.commit?.author?.date))&&
   ms(branchCommit.commit.author.date)>=ms(r.updated_at)-300000):null;
 // Archive workflow run metadata does not carry the originating snapshot
 // ID in this list. Later success can be reported, NOT attributed to that
 // exact source or used to certify an unmodified archive.
 const childRunsAfterLatestSuccess=latestSuccess?archives.filter(a=>
   ms(a.created_at)>=ms(latestSuccess.updated_at||latestSuccess.created_at)-300000):[];
 const childSuccessAfterLatestSuccess=childRunsAfterLatestSuccess
   .filter(a=>a.conclusion==='success').length;
 const childFailuresAfterLatestSuccess=childRunsAfterLatestSuccess
   .filter(a=>['failure','timed_out','cancelled','action_required'].includes(a.conclusion)).length;
 const age=latestSuccess?nowMs-ms(latestSuccess.updated_at||latestSuccess.created_at):null;
 const overdue=age!==null&&age>GRACE_MS;
 let status='NO_SCHEDULED_SNAPSHOT_SINCE_ARCHIVER_ENABLED';
 if(newest&&!latestSuccess)status=newest.status==='completed'?
   'SCHEDULED_SNAPSHOT_FAILED_OR_SKIPPED':'SCHEDULED_SNAPSHOT_RUNNING';
 else if(latestSuccess&&!commitHasData)
   status=childFailuresAfterLatestSuccess?
      'FIRST_ARCHIVE_COMMIT_UNCONFIRMED_WORKFLOW_FAILED':
      overdue?'FIRST_ARCHIVE_COMMIT_NOT_OBSERVED_AFTER_GRACE':
       'FIRST_ARCHIVE_COMMIT_AWAITING_SCHEDULE';
 else if(commitHasData&&!linkedSource)
   status='ARCHIVE_DATA_COMMIT_SOURCE_NOT_MATCHED_IN_WINDOW';
 else if(linkedSource){
   status='ARCHIVE_DATA_COMMIT_MATCHES_SCHEDULED_SOURCE';
   if(latestSuccess&&String(latestSuccess.id)!==committedSourceRunId)
     status=childSuccessAfterLatestSuccess?
       'ARCHIVE_PREVIOUS_COMMIT_WITH_LATER_SUCCESSFUL_WORKFLOW_REVIEW_LOGS':
       overdue?'ARCHIVE_HEAD_BEHIND_LATEST_SCHEDULE_REVIEW_REQUIRED':
       'ARCHIVE_PREVIOUS_COMMIT_NEW_SCHEDULE_PENDING';
 }
 const result={
  version:'CASH_UNVERIFIED_SESSION_ARCHIVE_OPERATIONAL_HEALTH_V1',
  status,observationWindowHours:WINDOW_MS/3600000,
  activeAfter:'2026-11-18T14:18:02Z',
  successfulScheduledSnapshotsSinceActivation:successful.length,
  failedScheduledSnapshotsSinceActivation:source.filter(r=>r.status==='completed'&&r.conclusion!=='success').length,
  mostRecentEligibleScheduledSnapshotRunId:newest?String(newest.id):null,
  latestSuccessfulScheduledSnapshotRunId:latestSuccess?String(latestSuccess.id):null,
  sessionArchiveWorkflowsSeen:archives.length,
  sessionArchiveWorkflowsSucceeded:archives.filter(r=>r.conclusion==='success').length,
  sessionArchiveWorkflowsSkipped:archives.filter(r=>r.conclusion==='skipped').length,
  sessionArchiveWorkflowsFailed:archives.filter(r=>['failure','timed_out','cancelled'].includes(r.conclusion)).length,
  latestSnapshotHasSubsequentArchiveWorkflowSuccess:childSuccessAfterLatestSuccess>0,
  latestSnapshotHasSubsequentArchiveWorkflowFailure:childFailuresAfterLatestSuccess>0,
  archiveBranchHeadSha:SHA.test(branchCommit?.sha||'')?branchCommit.sha:null,
  archiveBranchHeadIsDataCommit:commitHasData,
  archiveBranchHeadSourceRunId:committedSourceRunId,
  archiveDataCommitMatchesSuccessfulScheduledSnapshotInWindow:Boolean(linkedSource),
  lastSnapshotPastGracePeriod:overdue,
  independentQualifiedCount:0,actualFillsVerified:0,ordersEnabled:false,
  limitations:'A bounded, read-only GitHub Actions metadata/commit check. A workflow success is not a data commit; a matching commit message is not tamper-proof. Child workflow timing does not prove which snapshot it consumed. The archive records self-reported source events, not independently witnessed pre-expiry forecasts or verified Kalshi fills.'
 };
 return result;
}
function read(file){return JSON.parse(fs.readFileSync(file,'utf8'))}
function inspectFiles(a,b,c,{nowMs=Date.now()}={}){
 const result=inspectSessionArchiveHealth({
  snapshotRuns:read(a),archiveRuns:read(b),branchCommit:read(c),nowMs
 });
 console.log('CASH_SESSION_ARCHIVE_HEALTH='+result.status);
 console.log('CASH_SESSION_ARCHIVE_DATA_COMMIT='+result.archiveBranchHeadIsDataCommit);
 console.log('CASH_SESSION_ARCHIVE_LINKED_SCHEDULE='+result.archiveDataCommitMatchesSuccessfulScheduledSnapshotInWindow);
 console.log('CASH_SESSION_ARCHIVE_LATEST_SOURCE='+String(result.latestSuccessfulScheduledSnapshotRunId));
 console.log('CASH_SESSION_ARCHIVE_CHILD_WORKFLOW_SUCCESSES='+result.sessionArchiveWorkflowsSucceeded);
 console.log('CASH_SESSION_ARCHIVE_INDEPENDENT_QUALIFIED=0');
 console.log('CASH_SESSION_ARCHIVE_ORDERS_ENABLED=false');
 return result;
}
if(require.main===module){
 const [a,b,c]=process.argv.slice(2);
 if(!a||!b||!c)throw Error('Usage: node session-archive-health.js SNAPSHOT_RUNS ARCHIVER_RUNS BRANCH_COMMIT');
 inspectFiles(a,b,c);
}
module.exports={inspectSessionArchiveHealth,inspectFiles};
