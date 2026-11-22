'use strict';
/*
 * READ ONLY: after a trusted scheduled GitHub backup has been checked into
 * the separate UNVERIFIED public-session archive, inspect exact early V3
 * source-to-archive coverage. This reports capacity and self-reported
 * completeness only. It does not rotate, write, restart, validate accuracy,
 * or establish independent freeze-time evidence.
 */
const fs=require('node:fs'),path=require('node:path');
const {verifiedJournal}=require('./preexpiry-observer');
const {scanArchive,validateEntry}=require('./public-session-archive');
const MAX_SOURCE_BYTES=2621440,MAX_EARLY_RECORDS=320;
const SHA=/^[a-f0-9]{64}$/;
function assessEarlyArchiveCapacity({early,archiveRoot}){
 if(!early||early.version!=='CASH_PROSPECTIVE_KALSHI_V1'||
    early.qualifiedCount!==0||early.independentlyTimeAttested!==false||
    early.modelCalibrated!==false||early.tradingAuthorized!==false||
    early.automatedOrdersEnabled!==false||
    !Number.isInteger(early.records)||early.records<0||
    !Number.isInteger(early.pending)||early.pending<0)
  throw Error('Invalid or privileged early research export');
 const format=early.format;
 if(!['CASH_PROSPECTIVE_HASHED_SESSION_V1',
       'CASH_PROSPECTIVE_REDACTED_COMMITMENTS_V1'].includes(format))
  throw Error('Unexpected early source export format');
 const base={version:'CASH_EARLY_ARCHIVE_CAPACITY_READ_ONLY_V1',
  status:'UNDETERMINED',sourceRecords:early.records,
  sourcePending:early.pending,sourceOutcomes:null,
  maxRecords:MAX_EARLY_RECORDS,
  remainingSlots:Math.max(0,MAX_EARLY_RECORDS-early.records),
  archiveForecastsMatched:null,archiveOutcomesMatched:null,
  archiveMissingForecasts:null,archiveMissingOutcomes:null,
  archiveAheadOfSourceOutcomes:null,
  operatorOfflineReviewCandidate:false,
  fullDiskPreflightPerformed:false,automaticRotationEnabled:false,
  independentlyQualifiedCount:0,ordersEnabled:false,
  safeToRotateOrRestartRailway:false,
  note:'GitHub archive is a copy of source-generated claims, not an independent freeze-time witness. Full on-volume byte-for-byte preflight, exclusive quiescence and fresh approval are still required before any offline rollover.'};
 if(early.records>MAX_EARLY_RECORDS||early.pending>early.records)
  throw Error('Early research capacity totals invalid');
 if(format==='CASH_PROSPECTIVE_REDACTED_COMMITMENTS_V1')
  return {...base,status:'REDACTED_SOURCE_ARCHIVE_COVERAGE_NOT_PROVABLE'};
 const sources=verifiedJournal(early,'early');
 if(sources.length!==early.records)
  throw Error('Early forecast count inconsistent with verified events');
 const byMarket=new Map();
 for(const ev of early.events){
  if(ev.type!=='OUTCOME')continue;
  const key=ev.payload?.marketId;
  if(!key||byMarket.has(key))
   throw Error('Duplicate or malformed early outcome in source');
  byMarket.set(key,ev);
 }
 if(byMarket.size!==early.records-early.pending)
  throw Error('Early outcome count inconsistent with snapshot');
 const result={...base,sourceOutcomes:byMarket.size};
 if(early.records===0){
  if(early.events.length!==0||early.headHash!=='GENESIS')
   throw Error('Malformed empty early cohort');
  return {...result,status:'EMPTY_EARLY_COHORT'};
 }
 if(typeof archiveRoot!=='string'||!path.isAbsolute(archiveRoot))
  throw Error('Existing absolute public archive directory required');
 const folder=fs.lstatSync(archiveRoot);
 if(!folder.isDirectory()||folder.isSymbolicLink())
  throw Error('Unsafe archive root');
 scanArchive(archiveRoot);
 const first=sources[0]?.e.hash;
 if(!SHA.test(first||''))
  throw Error('Missing original early cohort hash identity');
 let forecasts=0,outcomes=0,archiveAhead=0;
 for(const {e,p} of sources){
  if(p.indexSourceType!=='SINGLE_EXCHANGE_PROXY')
   return {...result,status:'NONPUBLIC_EARLY_COHORT_ARCHIVE_COVERAGE_UNPROVABLE'};
  const file=path.join(archiveRoot,'public-sessions','early-v3',
   first,p.marketId+'.json');
  let stat;
  try{stat=fs.lstatSync(file)}
  catch(e){if(e.code==='ENOENT')continue;throw e}
  if(!stat.isFile()||stat.isSymbolicLink()||
     stat.size<200||stat.size>14000)
   throw Error('Unsafe archived early research entry');
  const entry=JSON.parse(fs.readFileSync(file,'utf8'));
  validateEntry(entry,{modelFolder:'early-v3',sessionHash:first,
   marketId:p.marketId});
  const forecast=entry.prediction;
  if(forecast.selfHashedForecastEventSha256!==e.hash||
     forecast.selfHashedForecastSequence!==e.sequence||
     forecast.claimedFrozenAt!==p.at||
     forecast.contractClosesAt!==p.endTime||
     forecast.side!==(p.side===null?'WAIT':p.side))
   throw Error('Archived forecast conflicts with original early source');
  forecasts++;
  const sourceOutcome=byMarket.get(p.marketId);
  if(sourceOutcome){
   if(entry.outcome?.selfHashedOutcomeEventSha256===sourceOutcome.hash&&
      entry.outcome.selfHashedOutcomeSequence===sourceOutcome.sequence&&
      entry.outcome.internallyReportedWinner===sourceOutcome.payload.winner)
    outcomes++;
   else if(entry.outcome!==null)
    throw Error('Archived outcome conflicts with original early source');
  }else if(entry.outcome!==null)archiveAhead++;
 }
 result.archiveForecastsMatched=forecasts;
 result.archiveOutcomesMatched=outcomes;
 result.archiveMissingForecasts=early.records-forecasts;
 result.archiveMissingOutcomes=byMarket.size-outcomes;
 result.archiveAheadOfSourceOutcomes=archiveAhead;
 if(result.archiveMissingForecasts||result.archiveMissingOutcomes||archiveAhead)
  result.status='ARCHIVE_INCOMPLETE_OR_SOURCE_SNAPSHOT_STALE';
 else if(early.records===MAX_EARLY_RECORDS&&early.pending===0){
  result.status='FULLY_ARCHIVED_SOURCE_READY_FOR_SEPARATE_DISK_PREFLIGHT';
  result.operatorOfflineReviewCandidate=true;
 }else if(early.records===MAX_EARLY_RECORDS)
  result.status='EARLY_JOURNAL_FULL_PENDING_SETTLEMENT';
 else if(result.remainingSlots<=16)
  result.status='EARLY_CAPACITY_LOW_SOURCE_ARCHIVED';
 else result.status='EARLY_SOURCE_ARCHIVED_MORE_CAPACITY_AVAILABLE';
 return result;
}
function runReport(sourcePath,archiveRoot){
 const raw=fs.readFileSync(sourcePath);
 if(raw.length>MAX_SOURCE_BYTES)throw Error('Early export too large for coverage analysis');
 const early=JSON.parse(raw.toString('utf8'));
 const r=assessEarlyArchiveCapacity({early,archiveRoot});
 console.log('CASH_EARLY_ARCHIVE_CAPACITY_STATUS='+r.status);
 console.log('CASH_EARLY_ARCHIVE_RECORDS='+r.sourceRecords);
 console.log('CASH_EARLY_ARCHIVE_PENDING='+r.sourcePending);
 console.log('CASH_EARLY_ARCHIVE_REMAINING='+r.remainingSlots);
 console.log('CASH_EARLY_ARCHIVE_FORECASTS_MATCHED='+r.archiveForecastsMatched);
 console.log('CASH_EARLY_ARCHIVE_OUTCOMES_MATCHED='+r.archiveOutcomesMatched);
 console.log('CASH_EARLY_ARCHIVE_FORECASTS_MISSING='+r.archiveMissingForecasts);
 console.log('CASH_EARLY_ARCHIVE_OUTCOMES_MISSING='+r.archiveMissingOutcomes);
 console.log('CASH_EARLY_OFFLINE_DISK_PREFLIGHT_PERFORMED=false');
 console.log('CASH_EARLY_RAILWAY_RESTART_AUTHORIZED=false');
 console.log('CASH_EARLY_ROTATION_AUTOMATIC=false');
 console.log('CASH_EARLY_INDEPENDENTLY_QUALIFIED=0');
 return r;
}
if(require.main===module){
 const [sourcePath,archiveRoot]=process.argv.slice(2);
 if(!sourcePath||!archiveRoot)
  throw Error('Usage: node early-archive-capacity.js EARLY_EXPORT_JSON EXISTING_PUBLIC_ARCHIVE_ROOT');
 runReport(sourcePath,archiveRoot);
}
module.exports={assessEarlyArchiveCapacity,runReport,MAX_EARLY_RECORDS};
