'use strict';
/*
 * READ-ONLY visibility into a bounded, already-verified original GitHub-run
 * archive. Successful GitHub workflow != a fresh pre-expiry forecast.
 *
 * No forecast generation, model threshold change, selective outcome scoring,
 * private Kalshi records, account access or trading controls.
 */
const fs=require('node:fs'),path=require('node:path');
const {inspectArchive,validateSummary}=require('./late-observer-archive');
const VERSION='CASH_DURABLE_PREEXPIRY_CAPTURE_HEALTH_V1';
const RUN=/^\d{8,16}$/;
const MAX_RUNS=20000;
function classifyCapture(row){
 if(!row||!Number.isInteger(row.valid)||row.valid<0||
  !Number.isInteger(row.empty)||row.empty<0||row.empty>row.valid||
  !Number.isInteger(row.invalid)||row.invalid<0||
  !Number.isInteger(row.attempts)||row.attempts<1||
  row.valid+row.invalid!==row.attempts||
  !Number.isInteger(row.commitments)||row.commitments<0||
  !Number.isInteger(row.directional)||row.directional<0||
  row.directional>row.commitments)
  throw Error('Malformed original observer capture denominators');
 if(row.commitments>0)
  return row.directional>0?'CAPTURED_DIRECTIONAL':'CAPTURED_WAITS_ONLY';
 if(row.valid>0&&row.empty===row.valid&&row.invalid===0)
  return 'VALID_POLLS_NO_ELIGIBLE_PREEXPIRY_FORECAST';
 if(row.valid===0)return 'NO_VALID_OBSERVER_POLLS';
 return 'INCOMPLETE_OR_MIXED_OBSERVATION';
}
function summarizeCaptures(rows,{expectedRunCount=rows?.length}={}){
 if(!Array.isArray(rows)||rows.length>MAX_RUNS||
   !Number.isInteger(expectedRunCount)||expectedRunCount<0||
   expectedRunCount!==rows.length)
  throw Error('Invalid bounded observer archive inventory');
 const ids=new Set();
 const ordered=rows.map(r=>{
  if(!r||!RUN.test(String(r.id||''))||
   !Number.isFinite(Date.parse(r.createdAt))||
   !['schedule','workflow_run'].includes(r.event))
   throw Error('Untrusted archived observer run identity or source date');
  if(ids.has(r.id))throw Error('Duplicate archived GitHub observer run');
  ids.add(r.id);
  return {...r,capture:classifyCapture(r)};
 }).sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)||
      Number(a.id)-Number(b.id));
 const counts={
  capturedDirectional:0,capturedWaitOnly:0,validNoForecast:0,
  noValidPolls:0,mixedOrIncomplete:0,directScheduled:0,backupTriggered:0,
  totalAttempts:0,validPolls:0,emptyPolls:0,invalidPolls:0
 };
 const eligibility={
  archivedRunsWithDiagnostics:0,archivedRunsWithoutDiagnostics:0,
  early:{validSourcePolls:0,unavailableSourcePolls:0,invalidSourcePolls:0,
   eligibleForecastPolls:0,expiredOnlyPolls:0,otherIneligiblePolls:0,
   emptyJournalPolls:0},
  late:{validSourcePolls:0,unavailableSourcePolls:0,invalidSourcePolls:0,
   eligibleForecastPolls:0,expiredOnlyPolls:0,otherIneligiblePolls:0,
   emptyJournalPolls:0}
 };
 let longestEmpty=0,streak=0,runStart=null,longestSpan=null;
 let lastCapturedAt=null,lastDirectionalAt=null,lastEmptyAt=null;
 const gapSamples=[];
 for(const r of ordered){
  if(r.eligibilityPolls===undefined){
   eligibility.archivedRunsWithoutDiagnostics++;
  }else{
   if(!r.eligibilityPolls||typeof r.eligibilityPolls!=='object'||
      Array.isArray(r.eligibilityPolls)||
      Object.keys(r.eligibilityPolls).sort().join(',')!=='early,late')
    throw Error('Malformed original eligibility diagnostic');
   for(const kind of ['early','late']){
    const src=r.eligibilityPolls[kind],dest=eligibility[kind];
    if(!src||typeof src!=='object'||Array.isArray(src)||
       Object.keys(src).sort().join(',')!==Object.keys(dest).sort().join(',')||
       Object.keys(dest).some(k=>!Number.isInteger(src[k])||
        src[k]<0||src[k]>r.attempts)||
       src.validSourcePolls+src.unavailableSourcePolls+
        src.invalidSourcePolls>r.attempts||
       src.eligibleForecastPolls+src.expiredOnlyPolls+
        src.otherIneligiblePolls+src.emptyJournalPolls!==src.validSourcePolls)
     throw Error('Malformed original eligibility diagnostic');
    for(const k of Object.keys(dest))dest[k]+=src[k];
   }
   eligibility.archivedRunsWithDiagnostics++;
  }
  if(r.event==='schedule')counts.directScheduled++;
  else counts.backupTriggered++;
  counts.totalAttempts+=r.attempts;
  counts.validPolls+=r.valid;
  counts.emptyPolls+=r.empty;
  counts.invalidPolls+=r.invalid;
  if(r.capture==='CAPTURED_DIRECTIONAL'){
   counts.capturedDirectional++;lastDirectionalAt=r.createdAt;lastCapturedAt=r.createdAt;
  }else if(r.capture==='CAPTURED_WAITS_ONLY'){
   counts.capturedWaitOnly++;lastCapturedAt=r.createdAt;
  }else if(r.capture==='VALID_POLLS_NO_ELIGIBLE_PREEXPIRY_FORECAST'){
   counts.validNoForecast++;lastEmptyAt=r.createdAt;
  }else if(r.capture==='NO_VALID_OBSERVER_POLLS'){
   counts.noValidPolls++;
  }else counts.mixedOrIncomplete++;
  // This is a streak of archived *run records*, NOT proof of 100%
  // chronological coverage, exchange downtime, or all source forecasts.
  if(r.capture==='VALID_POLLS_NO_ELIGIBLE_PREEXPIRY_FORECAST'){
   if(!streak)runStart=r.createdAt;
   streak++;
   if(streak>longestEmpty){
    longestEmpty=streak;
    longestSpan={start:runStart,end:r.createdAt};
   }
  }else if(streak){
   if(streak>=3)gapSamples.push({
    start:runStart,end:ordered.find(x=>x.id===r.id)?.createdAt,
    emptyRunCount:streak,recoveredTo:r.capture
   });
   streak=0;runStart=null;
  }
 }
 const recentStreak=streak;
 if(streak>=3)gapSamples.push({
  start:runStart,end:null,emptyRunCount:streak,
  recoveredTo:'NOT_YET_CAPTURED_IN_ARCHIVED_RUNS'
 });
 const processed=counts.capturedDirectional+counts.capturedWaitOnly+
  counts.validNoForecast+counts.noValidPolls+counts.mixedOrIncomplete;
 if(processed!==ordered.length||
  counts.directScheduled+counts.backupTriggered!==ordered.length||
  counts.validPolls+counts.invalidPolls!==counts.totalAttempts||
  counts.emptyPolls>counts.validPolls)
  throw Error('Observer run capture accounting invariant failed');
 return {
  version:VERSION,
  archivedObserverRuns:ordered.length,
  runsWithAtLeastOneFrozenCommitment:
   counts.capturedDirectional+counts.capturedWaitOnly,
  runsWithAtLeastOneDirectionalCommitment:counts.capturedDirectional,
  runsWithAbstentionsOnly:counts.capturedWaitOnly,
  runsWithOnlyValidEmptyPublicProxyPolls:counts.validNoForecast,
  runsWithNoValidPolls:counts.noValidPolls,
  runsWithMixedOrIncompleteProbes:counts.mixedOrIncomplete,
  directScheduleRuns:counts.directScheduled,
  successfulScheduledParentRuns:counts.backupTriggered,
  sourceEligibilityDiagnostics:eligibility,
  originalPolls:{attempted:counts.totalAttempts,valid:counts.validPolls,
   empty:counts.emptyPolls,invalid:counts.invalidPolls},
  longestConsecutiveArchivedValidEmptyRuns:longestEmpty,
  currentTrailingArchivedValidEmptyRuns:recentStreak,
  longestEmptyRunWindow:longestSpan,
  recentRecoveredGaps:gapSamples.slice(-10),
  lastFrozenCommitmentRunAt:lastCapturedAt,
  lastDirectionalRunAt:lastDirectionalAt,
  lastValidEmptyRunAt:lastEmptyAt,
  sourceNetworkFailureEstablished:false,
  completeProspectiveDenominatorEstablished:false,
  independentlyQualifiedCount:0,
  actualFillsVerified:0,
  realMoneyOrdersEnabled:false,
  caveat:'Runs and polls are not independent markets. A valid empty probe says no publicly eligible UNEXPIRED single-exchange-proxy commitment was preserved at that GitHub runner time; it does NOT prove the source was offline, no prediction was generated, the model lost accuracy, or that licensed-index / other nonpublic forecasts were absent. Only originally archived runs are included. Eligibility diagnostic totals cover only runs that originally recorded that optional field; legacy runs are explicitly excluded, not interpreted as zero. An archived YES/NO is not automatically a checked final, fills or a qualified forecast.'
 };
}
function safeJson(file,max){
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.size<=0||st.size>max)
  throw Error('Unsafe archived capture summary or manifest');
 return JSON.parse(fs.readFileSync(file,'utf8'));
}
function auditCaptureHealth(root){
 const inspected=inspectArchive(root);
 const base=path.join(path.resolve(root),'late-preexpiry-run');
 const rows=[];
 if(fs.existsSync(base)){
  for(const id of fs.readdirSync(base).sort()){
   if(!RUN.test(id))throw Error('Non-run file in durable observer archive');
   const m=safeJson(path.join(base,id,'manifest.json'),12000);
   const s=safeJson(path.join(base,id,'observer-run-summary.json'),8000);
   validateSummary(s);
   if(m.sourceRunId!==id||
      !['schedule','workflow_run'].includes(m.sourceRunEvent)||
      m.independentQualificationCount!==0||m.ordersAllowed!==false)
    throw Error('Durable public observation manifest modified');
   if(s.additionalImmutableProbeFiles<0||
      (s.evidenceRecorded===0&&m.distinctCommitments!==0&&
       s.validProbes===s.emptyProbes))
    throw Error('Invalid empty summary incompatible with frozen evidence');
   rows.push({
    id,createdAt:m.sourceRunCreatedAt,event:m.sourceRunEvent,
    attempts:s.attempts,valid:s.validProbes,empty:s.emptyProbes,
    invalid:s.invalidProbes,commitments:m.distinctCommitments,
    directional:m.directionalCommitments,
    ...(s.eligibilityPolls===undefined?{}:{eligibilityPolls:s.eligibilityPolls})
   });
  }
 }
 const result=summarizeCaptures(rows,{expectedRunCount:inspected.runs});
 return {...result,
  distinctArchivedModelContractCommitments:inspected.distinctContracts,
  distinctArchivedLateDirectionalModelContracts:inspected.lateDirectional,
  distinctArchivedWaitModelContracts:inspected.waits};
}
if(require.main===module){
 if(process.argv.length!==3)
  throw Error('Usage: node late-observer-capture-health.js VERIFIED_ARCHIVE_ROOT');
 const s=auditCaptureHealth(process.argv[2]);
 console.log('CASH_ORIGINAL_ARCHIVE_RUNS='+s.archivedObserverRuns);
 console.log('CASH_ORIGINAL_CAPTURE_RUNS_WITH_FORECAST='+s.runsWithAtLeastOneFrozenCommitment);
 console.log('CASH_ORIGINAL_CAPTURE_DIRECTIONAL_RUNS='+s.runsWithAtLeastOneDirectionalCommitment);
 console.log('CASH_ORIGINAL_CAPTURE_VALID_EMPTY_RUNS='+s.runsWithOnlyValidEmptyPublicProxyPolls);
 console.log('CASH_ORIGINAL_CAPTURE_VALID_POLL_ATTEMPTS='+s.originalPolls.valid);
 console.log('CASH_ORIGINAL_CAPTURE_EMPTY_POLL_ATTEMPTS='+s.originalPolls.empty);
 console.log('CASH_ORIGINAL_CAPTURE_LONGEST_EMPTY_RUN_STREAK='+s.longestConsecutiveArchivedValidEmptyRuns);
 console.log('CASH_ORIGINAL_CAPTURE_LATEST_DIRECTIONAL='+String(s.lastDirectionalRunAt));
 console.log('CASH_ORIGINAL_ELIGIBILITY_DIAGNOSTIC_RUNS='+s.sourceEligibilityDiagnostics.archivedRunsWithDiagnostics);
 console.log('CASH_ORIGINAL_ELIGIBILITY_LEGACY_RUNS='+s.sourceEligibilityDiagnostics.archivedRunsWithoutDiagnostics);
 for(const kind of ['early','late']){
  for(const [key,value] of Object.entries(s.sourceEligibilityDiagnostics[kind]))
   console.log('CASH_ORIGINAL_ELIGIBILITY_'+kind.toUpperCase()+'_'+key+'='+value);
 }
 console.log('CASH_ORIGINAL_CAPTURE_QUALIFIED=0');
 console.log('CASH_ORIGINAL_CAPTURE_ORDERS=false');
}
module.exports={classifyCapture,summarizeCaptures,auditCaptureHealth,VERSION};
