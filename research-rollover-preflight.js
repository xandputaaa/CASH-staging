'use strict';
/*
 * CASH operational rollover preflight: READ ONLY, GitHub runner only.
 * A copy of self-reported forecast metadata does NOT restore the server's
 * in-memory collector, source history, pending checks or model cursor.
 * No readiness label in this report authorizes a Railway restart.
 */
const fs=require('node:fs'),path=require('node:path');
const {verifiedJournal}=require('./preexpiry-observer');
const {scanArchive}=require('./public-session-archive');
const {assessDefaultLateCapacity}=require('./research-capacity');
const SHA=/^[a-f0-9]{64}$/;
const SOURCE='SINGLE_EXCHANGE_PROXY';
const WINNERS=new Set(['YES','NO','VOID']);
const iso=x=>new Date(x).toISOString();
function assessRolloverPreflight({late,archiveRoot}){
 const root=path.resolve(archiveRoot);
 const inventory=scanArchive(root);
 const base={
  version:'CASH_GITHUB_ROLLOVER_PREFLIGHT_V1',
  archiveFilesAllSessions:inventory.fileCount,
  sourceRecords:null,sourcePending:null,
  archivedCurrentSessionForecasts:0,
  archivedCurrentSessionSelfReportedOutcomes:0,
  missingCurrentSessionForecasts:[],
  missingCurrentSessionSourceReportedOutcomes:[],
  sessionFirstEventHash:null,
  remainingAssumedDefaultSlots:null,
  assumedDefaultCapacity:160,capacityState:'UNKNOWN',
  status:'LATE_SOURCE_UNAVAILABLE',
  liveConfiguredCapacityVerified:false,
  serverStateRestorableFromPublicArchive:false,
  safeToRestartRailway:false,
  automatedOrdersEnabled:false,independentQualifiedCount:0,
  recoveryAction:'KEEP_CURRENT_RAILWAY_SESSION_RUNNING',
  limitation:'Only public, source-generated event commitments are preserved. No original RAM model state, licensed index values, all sample windows or future settlement-check cursor can be restored from this branch. Never restart the live Railway collector based on this audit.'
 };
 if(!late)return base;
 const cap=assessDefaultLateCapacity(late);
 const accepted=verifiedJournal(late,'late');
 const allEvents=late.events;
 const outcomeEvents=new Map();
 for(const e of allEvents){
  if(e.type!=='OUTCOME')continue;
  if(!e.payload||!WINNERS.has(e.payload.winner)||
     outcomeEvents.has(e.payload.marketId))
   throw Error('Invalid or duplicate source-reported late outcome');
  outcomeEvents.set(e.payload.marketId,e);
 }
 if(outcomeEvents.size!==late.records-late.pending)
  throw Error('Source-reported outcome totals inconsistent');
 const first=accepted[0]?.e.hash||null;
 const result={...base,sourceRecords:late.records,sourcePending:late.pending,
  sessionFirstEventHash:first,
  remainingAssumedDefaultSlots:cap.estimatedRemainingFrozenMarketSlots,
  capacityState:cap.state};
 // Licensed/redacted cohorts cannot be fully archived with this public format.
 // Their public archive coverage is explicitly unavailable, not zero loss.
 if(accepted.some(x=>x.p.indexSourceType!==SOURCE)){
  result.status='NONPUBLIC_SOURCE_CANNOT_PROVE_ARCHIVE_COVERAGE';
  return result;
 }
 let archived=0,archivedOutcomes=0;
 for(const {e,p} of accepted){
  if(!SHA.test(first||''))throw Error('Missing original late session identity');
  const file=path.join(root,'public-sessions','late-v1',first,p.marketId+'.json');
  if(!fs.existsSync(file)){
   result.missingCurrentSessionForecasts.push(p.marketId);
   continue;
  }
  const entry=JSON.parse(fs.readFileSync(file,'utf8'));
  const prediction=entry.prediction;
  if(prediction.marketId!==p.marketId||
     prediction.selfHashedForecastEventSha256!==e.hash||
     prediction.side!==(p.side===null?'WAIT':p.side)||
     prediction.claimedFrozenAt!==iso(p.at)||
     prediction.contractClosesAt!==iso(p.endTime)||
     prediction.sessionFirstEventSha256!==first)
   throw Error('Archived forecast differs from current source: '+p.marketId);
  archived++;
  const outcome=outcomeEvents.get(p.marketId);
  if(outcome){
   if(!entry.outcome||
     entry.outcome.selfHashedOutcomeEventSha256!==outcome.hash||
     entry.outcome.internallyReportedWinner!==outcome.payload.winner)
    result.missingCurrentSessionSourceReportedOutcomes.push(p.marketId);
   else archivedOutcomes++;
  }
 }
 result.archivedCurrentSessionForecasts=archived;
 result.archivedCurrentSessionSelfReportedOutcomes=archivedOutcomes;
 if(result.missingCurrentSessionForecasts.length||
    result.missingCurrentSessionSourceReportedOutcomes.length){
  result.status='ARCHIVE_COVERAGE_INCOMPLETE_NO_RESTART';
 }else if(late.records===0){
  result.status='NO_CURRENT_LATE_FORECASTS_NO_RESTART';
 }else if(cap.state==='DEFAULT_JOURNAL_FULL'){
  result.status='DEFAULT_CAPACITY_REACHED_NO_RESUME_PATH';
 }else if(cap.state==='DEFAULT_JOURNAL_CAPACITY_LOW'){
  result.status='DEFAULT_CAPACITY_LOW_NO_RESUME_PATH';
 }else{
  result.status='SOURCE_ONLY_BACKUP_COMPLETE_NO_RESUME_PATH';
 }
 return result;
}
function runPreflight(file,root){
 const late=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
 const result=assessRolloverPreflight({late,archiveRoot:root});
 console.log('CASH_ROLLOVER_PREFLIGHT_STATUS='+result.status);
 console.log('CASH_ROLLOVER_SOURCE_FORECASTS='+result.sourceRecords);
 console.log('CASH_ROLLOVER_ARCHIVED_CURRENT_SESSION='+result.archivedCurrentSessionForecasts);
 console.log('CASH_ROLLOVER_ARCHIVED_SOURCE_OUTCOMES='+result.archivedCurrentSessionSelfReportedOutcomes);
 console.log('CASH_ROLLOVER_MISSING_FORECASTS='+result.missingCurrentSessionForecasts.length);
 console.log('CASH_ROLLOVER_MISSING_SOURCE_OUTCOMES='+result.missingCurrentSessionSourceReportedOutcomes.length);
 console.log('CASH_ROLLOVER_ASSUMED_DEFAULT_REMAINING='+result.remainingAssumedDefaultSlots);
 console.log('CASH_ROLLOVER_SERVER_STATE_RESTORABLE=false');
 console.log('CASH_ROLLOVER_SAFE_TO_RESTART=false');
 console.log('CASH_ROLLOVER_INDEPENDENT_QUALIFIED=0');
 return result;
}
if(require.main===module){
 const [latePath,archiveRoot]=process.argv.slice(2);
 if(!latePath||!archiveRoot)throw Error('Usage: node research-rollover-preflight.js LATE_EXPORT_JSON ARCHIVE_ROOT');
 runPreflight(latePath,archiveRoot);
}
module.exports={assessRolloverPreflight,runPreflight};
