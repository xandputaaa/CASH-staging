'use strict';
/*
 * Read-only operational audit. Do not infer forecast accuracy or archive
 * provenance from a GitHub Actions run status. Only a trusted, recognizable
 * schedule-origin archive commit can count as an observed ledger write.
 * GitHub cron may delay/skip schedules; fail open for periodic backups.
 */
const fs=require('node:fs');
const WINDOW_MS=8*3600000;
const RUN=/^\d{8,16}$/;
const SHA=/^[a-f0-9]{40}$/;
const expected='Archive public schedule-only CASH witnesses (run ';
const ms=x=>Date.parse(x);
function validRun(r){return r&&RUN.test(String(r.id))&&Number.isFinite(ms(r.created_at))&&
  ['completed','queued','in_progress','waiting','pending','requested'].includes(r.status);}
function recent(runs,now){
 if(!runs||!Array.isArray(runs.workflow_runs))throw Error('Missing GitHub Actions history');
 return runs.workflow_runs.filter(r=>validRun(r)&&ms(r.created_at)>=now-WINDOW_MS&&
  ms(r.created_at)<=now+300000);
}
function evaluateArchiveHealth({reconciliationRuns,ledgerRuns,ledgerCommit,nowMs=Date.now()}){
 if(!Number.isFinite(nowMs))throw Error('Bad report clock');
 const reconcile=recent(reconciliationRuns,nowMs).filter(r=>r.event==='schedule')
  .sort((a,b)=>ms(b.created_at)-ms(a.created_at));
 const archives=recent(ledgerRuns,nowMs).filter(r=>r.event==='workflow_run')
  .sort((a,b)=>ms(b.created_at)-ms(a.created_at));
 const latest=reconcile[0],lastCompleted=reconcile.find(r=>r.status==='completed');
 const successful=reconcile.find(r=>r.conclusion==='success');
 const failed=reconcile.filter(r=>r.status==='completed'&&r.conclusion!=='success');
 const successfulArchives=archives.filter(r=>r.conclusion==='success').length;
 const skippedArchives=archives.filter(r=>r.conclusion==='skipped').length;
 // GH commit source is checked only against an exact successful scheduled
 // reconciliation run in the fetched window. A Git commit author/message
 // can be edited by someone with write permission; not notarization.
 const commitMsg=ledgerCommit?.commit?.message;
 const archiveSource=/^Archive public schedule-only CASH witnesses \(run (\d{8,16})\)$/
   .exec(typeof commitMsg==='string'?commitMsg:'');
 const source=archiveSource&&reconcile.find(r=>String(r.id)===archiveSource[1]&&
  r.conclusion==='success');
 const provenanceMatched=Boolean(source&&SHA.test(ledgerCommit?.sha||'')&&
  ms(ledgerCommit.commit.author?.date)>=ms(source.created_at));
 let status='NO_SCHEDULED_RECONCILIATION_OBSERVED';
 if(latest){
  if(latest.status!=='completed')status='SCHEDULED_RECONCILIATION_IN_PROGRESS';
  else if(!successful)status='SCHEDULED_RECONCILIATION_FAILED_OR_SKIPPED';
  else status='SCHEDULED_RECONCILIATION_SUCCEEDED_ARCHIVE_UNCONFIRMED';
 }
 if(provenanceMatched)status='PUBLIC_LEDGER_COMMIT_MATCHES_SCHEDULED_SOURCE';
 const result={
  version:'CASH_PUBLIC_LEDGER_OPERATIONAL_HEALTH_V1',
  observedWindowHours:WINDOW_MS/3600000,
  scheduledReconciliationRuns:reconcile.length,
  successfulScheduledReconciliations:reconcile.filter(r=>r.conclusion==='success').length,
  failedOrSkippedScheduledReconciliations:failed.length,
  recentLedgerWorkflowRuns:archives.length,
  successfulLedgerWorkflows:successfulArchives,
  skippedLedgerWorkflows:skippedArchives,
  mostRecentScheduledReconciliationRunId:latest?String(latest.id):null,
  mostRecentScheduledReconciliationStatus:latest?.status||null,
  mostRecentScheduledReconciliationConclusion:lastCompleted?.conclusion||null,
  mostRecentKnownLedgerCommitSha:SHA.test(ledgerCommit?.sha||'')?
    ledgerCommit.sha:null,
  ledgerHeadCommitCorroboratesSuccessfulScheduledRunInWindow:provenanceMatched,
  archiveStatus:status,
  independentQualifiedCount:0,ordersEnabled:false,
  limitations:'A short, incomplete GitHub API scan and an ordinary mutable Git commit, NOT guaranteed complete archival or a cryptographically trusted timestamp. A successful archive workflow may have no new evidence. No trading validation.'
 };
 return result;
}
function read(path){return JSON.parse(fs.readFileSync(path,'utf8'))}
function inspectFiles(reconcilePath,ledgerPath,commitPath,{nowMs=Date.now()}={}){
 const result=evaluateArchiveHealth({
  reconciliationRuns:read(reconcilePath),ledgerRuns:read(ledgerPath),
  ledgerCommit:read(commitPath),nowMs
 });
 console.log('CASH_LEDGER_HEALTH_STATUS='+result.archiveStatus);
 console.log('CASH_LEDGER_HEALTH_SCHEDULED_RECONCILES='+result.scheduledReconciliationRuns);
 console.log('CASH_LEDGER_HEALTH_SCHEDULED_SUCCESSES='+result.successfulScheduledReconciliations);
 console.log('CASH_LEDGER_HEALTH_ARCHIVE_JOB_SUCCESSES='+result.successfulLedgerWorkflows);
 console.log('CASH_LEDGER_HEALTH_ARCHIVE_JOB_SKIPPED='+result.skippedLedgerWorkflows);
 console.log('CASH_LEDGER_HEALTH_MATCHED_GIT_COMMIT='+result.ledgerHeadCommitCorroboratesSuccessfulScheduledRunInWindow);
 console.log('CASH_LEDGER_HEALTH_INDEPENDENTLY_QUALIFIED=0');
 return result;
}
if(require.main===module){
 const [a,b,c]=process.argv.slice(2);
 if(!a||!b||!c)throw Error('Usage: node ledger-archive-health.js RECON_RUNS LEDGER_RUNS LEDGER_COMMIT');
 inspectFiles(a,b,c);
}
module.exports={evaluateArchiveHealth,inspectFiles};
