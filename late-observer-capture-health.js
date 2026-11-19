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

/*
 * For witness-bearing original GitHub runs only, measure elapsed time from
 * GH API run creation to the EARLIEST original archived runner observation.
 * This includes runner startup/setup/network/polling, NOT cron trigger queue
 * time or source-publication latency. No settlement-dependent selection.
 */
function runCreationToFirstWitness(rows){
 const fresh=()=>({runsWithWitness:0,withTiming:0,
  missingOriginalTime:0,runnerClockBeforeRun:0,runsWithoutWitness:0,
  atMost30s:0,over30To90s:0,over90To180s:0,over180s:0,
  minimumSeconds:null,medianSeconds:null,maximumSeconds:null});
 const out={schedule:fresh(),workflow_run:fresh()};
 const samples={schedule:[],workflow_run:[]};
 for(const r of rows){
  const x=out[r.event];
  if(!x)throw Error('Invalid observer run provenance for timing');
  if(r.commitments===0){
   if(r.firstWitnessAt!==undefined&&r.firstWitnessAt!==null)
    throw Error('Non-capture run cannot have first witness timestamp');
   x.runsWithoutWitness++;
   continue;
  }
  x.runsWithWitness++;
  if(r.firstWitnessAt===undefined||r.firstWitnessAt===null){
   x.missingOriginalTime++;
   continue;
  }
  const start=Date.parse(r.createdAt),first=Date.parse(r.firstWitnessAt);
  if(!Number.isFinite(start)||!Number.isFinite(first))
   throw Error('Invalid original GitHub witness runtime clock');
  const elapsed=first-start;
  if(elapsed<0){
   if(elapsed < -5000)
    throw Error('Witness predates GitHub source run by unsafe margin');
   x.runnerClockBeforeRun++;
   continue;
  }
  if(!Number.isSafeInteger(elapsed))
   throw Error('Unsafe GitHub run-to-witness interval');
  x.withTiming++;
  samples[r.event].push(elapsed);
  if(elapsed<=30000)x.atMost30s++;
  else if(elapsed<=90000)x.over30To90s++;
  else if(elapsed<=180000)x.over90To180s++;
  else x.over180s++;
 }
 for(const kind of ['schedule','workflow_run']){
  const x=out[kind],ms=samples[kind].sort((a,b)=>a-b);
  if(x.runsWithWitness!==x.withTiming+x.missingOriginalTime+
       x.runnerClockBeforeRun||
     x.withTiming!==x.atMost30s+x.over30To90s+
       x.over90To180s+x.over180s)
   throw Error('Run-to-witness timing denominator mismatch');
  if(!ms.length)continue;
  const mid=Math.floor(ms.length/2);
  const median=ms.length%2?ms[mid]:(ms[mid-1]+ms[mid])/2;
  x.minimumSeconds=Number((ms[0]/1000).toFixed(3));
  x.medianSeconds=Number((median/1000).toFixed(3));
  x.maximumSeconds=Number((ms.at(-1)/1000).toFixed(3));
 }
 return out;
}

/*
 * Original-run denominators by trusted trigger type. The existing per-poll
 * eligibility and conversion validators run first; this merely partitions
 * the verified rows. Missing historical diagnostics stay UNKNOWN.
 */
function triggerConversionCoverage(rows){
 const blank=()=>({archivedRuns:0,withConversion:0,withoutConversion:0,
  early:{eligiblePolls:0,eligibleWithoutWitnessPolls:0,
   eligibleWithWitnessPolls:0,runsWithEligiblePolls:0,
   runsWithUnwitnessedEligiblePolls:0},
  late:{eligiblePolls:0,eligibleWithoutWitnessPolls:0,
   eligibleWithWitnessPolls:0,runsWithEligiblePolls:0,
   runsWithUnwitnessedEligiblePolls:0}});
 const out={schedule:blank(),workflow_run:blank()};
 for(const r of rows){
  const dest=out[r.event];
  if(!dest)throw Error('Unknown original observer trigger type');
  dest.archivedRuns++;
  if(r.witnessConversion===undefined){
   dest.withoutConversion++;
   continue;
  }
  dest.withConversion++;
  for(const kind of ['early','late']){
   const c=r.witnessConversion[kind],d=dest[kind];
   if(!c||!Number.isInteger(c.eligibleWithWitnessPolls)||
      !Number.isInteger(c.eligibleWithoutWitnessPolls)||
      c.eligibleWithWitnessPolls<0||c.eligibleWithoutWitnessPolls<0)
    throw Error('Trigger conversion malformed original poll counters');
   const eligible=c.eligibleWithWitnessPolls+
    c.eligibleWithoutWitnessPolls;
   d.eligiblePolls+=eligible;
   d.eligibleWithWitnessPolls+=c.eligibleWithWitnessPolls;
   d.eligibleWithoutWitnessPolls+=c.eligibleWithoutWitnessPolls;
   if(eligible>0)d.runsWithEligiblePolls++;
   if(c.eligibleWithoutWitnessPolls>0)
    d.runsWithUnwitnessedEligiblePolls++;
  }
 }
 for(const dest of Object.values(out)){
  if(dest.withConversion+dest.withoutConversion!==dest.archivedRuns)
   throw Error('Trigger conversion run denominator mismatch');
  for(const kind of ['early','late']){
   const d=dest[kind];
   if(d.eligiblePolls!==d.eligibleWithWitnessPolls+
      d.eligibleWithoutWitnessPolls||
      d.runsWithUnwitnessedEligiblePolls>d.runsWithEligiblePolls||
      d.runsWithEligiblePolls>dest.withConversion)
    throw Error('Trigger conversion poll denominator mismatch');
  }
 }
 return out;
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
 // Only aggregate original, validated, immutable per-poll conversion
 // counters. Historical absence means unknown, NEVER zero witnesses.
 const conversion={
  archivedRunsWithConversion:0,archivedRunsWithoutConversion:0,
  eligibilityRunsWithoutConversion:0,
  early:{diagnosticPolls:0,diagnosticsMissingPolls:0,
   eligibleWithWitnessPolls:0,eligibleWithoutWitnessPolls:0,
   eligibleWithDirectMatchPolls:0,witnessWithoutEligibilityPolls:0},
  late:{diagnosticPolls:0,diagnosticsMissingPolls:0,
   eligibleWithWitnessPolls:0,eligibleWithoutWitnessPolls:0,
   eligibleWithDirectMatchPolls:0,witnessWithoutEligibilityPolls:0}
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
  if(r.witnessConversion===undefined){
   conversion.archivedRunsWithoutConversion++;
   if(r.eligibilityPolls!==undefined)
    conversion.eligibilityRunsWithoutConversion++;
  }else{
   if(r.eligibilityPolls===undefined||!r.witnessConversion||
      typeof r.witnessConversion!=='object'||
      Array.isArray(r.witnessConversion)||
      Object.keys(r.witnessConversion).sort().join(',')!=='early,late')
    throw Error('Malformed original witness conversion diagnostic');
   for(const kind of ['early','late']){
    const src=r.witnessConversion[kind],dest=conversion[kind];
    const eligibilityForModel=r.eligibilityPolls[kind];
    if(!src||typeof src!=='object'||Array.isArray(src)||
       Object.keys(src).sort().join(',')!==Object.keys(dest).sort().join(',')||
       Object.keys(dest).some(k=>!Number.isInteger(src[k])||
        src[k]<0||src[k]>r.valid)||
       src.diagnosticPolls+src.diagnosticsMissingPolls!==r.valid||
       src.diagnosticPolls!==eligibilityForModel.validSourcePolls+
        eligibilityForModel.unavailableSourcePolls+
        eligibilityForModel.invalidSourcePolls||
       src.eligibleWithWitnessPolls+src.eligibleWithoutWitnessPolls!==
        eligibilityForModel.eligibleForecastPolls||
       src.eligibleWithDirectMatchPolls>src.eligibleWithWitnessPolls||
       src.witnessWithoutEligibilityPolls>
        src.diagnosticPolls-eligibilityForModel.eligibleForecastPolls)
     throw Error('Malformed original witness conversion diagnostic');
    for(const k of Object.keys(dest))dest[k]+=src[k];
   }
   conversion.archivedRunsWithConversion++;
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
 // Archived runs may individually contain safe integers whose aggregate exceeds
 // JS exact-integer precision. Reject the whole audit rather than publish a
 // rounded denominator or an apparently precise conversion ratio.
 for(const [label,group] of Object.entries({counts,eligibility,conversion,
  triggerCoverage:triggerConversionCoverage(ordered)})){
  const check=(value,key)=>{
   if(typeof value==='number'&&(!Number.isSafeInteger(value)||value<0))
    throw Error('Unsafe aggregated observer denominator: '+key);
   if(value&&typeof value==='object')
    for(const [k,v] of Object.entries(value))check(v,key+'.'+k);
  };
  check(group,label);
 }
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
  sourceToWitnessConversionDiagnostics:conversion,
  triggerSourceToWitnessCoverage:triggerConversionCoverage(ordered),
  githubRunCreationToFirstWitness:runCreationToFirstWitness(ordered),
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
  caveat:'Runs and polls are not independent markets. A valid empty probe says no publicly eligible UNEXPIRED single-exchange-proxy commitment was preserved at that GitHub runner time; it does NOT prove the source was offline, no prediction was generated, the model lost accuracy, or that licensed-index / other nonpublic forecasts were absent. Only originally archived runs are included. GitHub run creation-to-first-witness timing is only for captured original observer RUNS and includes runner execution, checkout, network and polling: it cannot establish when GitHub scheduled the job, when the journal became publicly available, or timing for non-capture runs. Eligibility and source-to-witness conversion diagnostic totals cover only runs that originally recorded each optional field; historical missing fields are explicitly excluded, not interpreted as zero. Trigger-specific eligible and unwitnessed poll totals include only original archived runs with conversion diagnostics and cannot measure unarchived scheduled jobs, source-publication delays or independent qualification. Each source-to-witness number is a POLL count, not a distinct model contract or evidence qualification. An archived YES/NO is not automatically a checked final, fills or a qualified forecast.'
 };
}
function safeJson(file,max){
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.size<=0||st.size>max)
  throw Error('Unsafe archived capture summary or manifest');
 return JSON.parse(fs.readFileSync(file,'utf8'));
}
// Re-read only original, SHA-verified archive observations to find the FIRST
// GitHub-runner timestamp, not the selected later/stronger legacy summary.
function firstOriginalWitnessAt(runDir,manifest){
 let earliest=null,found=0;
 for(const item of manifest.sourceArtifactFiles){
  if(item.file!=='public-preexpiry-observation.json'&&
     !/^probes\/0(?:0[1-9]|1[0-9]|20)\.json$/.test(item.file))
   continue;
  const obs=safeJson(path.join(runDir,item.file),200000);
  if(obs.githubRunId!==manifest.sourceRunId||
     obs.githubCommitSha!==manifest.sourceHeadSha||
     !Array.isArray(obs.frozenEvidence))
   throw Error('Original GH witness run identity changed');
  if(!obs.frozenEvidence.length)continue;
  found++;
  const time=Date.parse(obs.observedAtRunner);
  if(!Number.isFinite(time))
   throw Error('Invalid original archived first-witness timestamp');
  if(earliest===null||time<earliest)earliest=time;
 }
 if(manifest.distinctCommitments>0&&found===0)
  throw Error('Missing original frozen observation for archive commitments');
 if(manifest.distinctCommitments===0&&found>0)
  throw Error('Unexpected frozen observation in empty original run');
 return earliest===null?null:new Date(earliest).toISOString();
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
    firstWitnessAt:firstOriginalWitnessAt(path.join(base,id),m),
    attempts:s.attempts,valid:s.validProbes,empty:s.emptyProbes,
    invalid:s.invalidProbes,commitments:m.distinctCommitments,
    directional:m.directionalCommitments,
    ...(s.eligibilityPolls===undefined?{}:{eligibilityPolls:s.eligibilityPolls}),
    ...(s.witnessConversion===undefined?{}:{witnessConversion:s.witnessConversion})
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
 console.log('CASH_ORIGINAL_CONVERSION_DIAGNOSTIC_RUNS='+s.sourceToWitnessConversionDiagnostics.archivedRunsWithConversion);
 console.log('CASH_ORIGINAL_CONVERSION_LEGACY_RUNS='+s.sourceToWitnessConversionDiagnostics.archivedRunsWithoutConversion);
 console.log('CASH_ORIGINAL_CONVERSION_ELIGIBILITY_ONLY_RUNS='+s.sourceToWitnessConversionDiagnostics.eligibilityRunsWithoutConversion);
 for(const kind of ['early','late']){
  for(const [key,value] of Object.entries(s.sourceToWitnessConversionDiagnostics[kind]))
   console.log('CASH_ORIGINAL_CONVERSION_'+kind.toUpperCase()+'_'+key+'='+value);
 }
 for(const kind of ['schedule','workflow_run']){
  const x=s.githubRunCreationToFirstWitness[kind];
  console.log('CASH_ORIGINAL_GH_CREATED_TO_FIRST_WITNESS_'+kind.toUpperCase()+'_TIMED_RUNS='+x.withTiming);
  console.log('CASH_ORIGINAL_GH_CREATED_TO_FIRST_WITNESS_'+kind.toUpperCase()+'_MISSING_RUNS='+x.missingOriginalTime);
  console.log('CASH_ORIGINAL_GH_CREATED_TO_FIRST_WITNESS_'+kind.toUpperCase()+'_AT_MOST_30S='+x.atMost30s);
  console.log('CASH_ORIGINAL_GH_CREATED_TO_FIRST_WITNESS_'+kind.toUpperCase()+'_OVER_30_TO_90S='+x.over30To90s);
  console.log('CASH_ORIGINAL_GH_CREATED_TO_FIRST_WITNESS_'+kind.toUpperCase()+'_OVER_90_TO_180S='+x.over90To180s);
  console.log('CASH_ORIGINAL_GH_CREATED_TO_FIRST_WITNESS_'+kind.toUpperCase()+'_OVER_180S='+x.over180s);
  console.log('CASH_ORIGINAL_GH_CREATED_TO_FIRST_WITNESS_'+kind.toUpperCase()+'_MEDIAN_SECONDS='+x.medianSeconds);
 }
 for(const kind of ['schedule','workflow_run']){
  const d=s.triggerSourceToWitnessCoverage[kind],prefix='CASH_ORIGINAL_TRIGGER_'+kind.toUpperCase();
  console.log(prefix+'_ARCHIVED_RUNS='+d.archivedRuns);
  console.log(prefix+'_WITH_CONVERSION='+d.withConversion);
  console.log(prefix+'_MISSING_CONVERSION='+d.withoutConversion);
  for(const model of ['early','late']){
   const m=d[model],p=prefix+'_'+model.toUpperCase();
   console.log(p+'_ELIGIBLE_POLLS='+m.eligiblePolls);
   console.log(p+'_ELIGIBLE_WITHOUT_WITNESS_POLLS='+m.eligibleWithoutWitnessPolls);
   console.log(p+'_RUNS_WITH_ELIGIBLE_POLLS='+m.runsWithEligiblePolls);
   console.log(p+'_RUNS_WITH_UNWITNESSED_ELIGIBLE_POLLS='+m.runsWithUnwitnessedEligiblePolls);
  }
 }
 console.log('CASH_ORIGINAL_CAPTURE_QUALIFIED=0');
 console.log('CASH_ORIGINAL_CAPTURE_ORDERS=false');
}
module.exports={classifyCapture,summarizeCaptures,auditCaptureHealth,
 runCreationToFirstWitness,firstOriginalWitnessAt,triggerConversionCoverage,VERSION};
