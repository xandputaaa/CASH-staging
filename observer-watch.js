'use strict';
/*
 * Bounded GitHub-runner watcher for a scheduled job that starts late.
 * No Railway code or model change. This is NOT an always-on server and
 * cannot compensate for GitHub jobs that never start.
 *
 * Each poll uses the existing full self-hash verification and direct
 * public Kalshi market check. Preserve each distinct BEFORE-CLOSE probe with
 * its original runner timestamp; keep the legacy strongest summary separately.
 * An opportunistic trusted scheduled-parent trigger uses a 3-minute budget;
 * the existing scheduled observer retains its 12-minute maximum.
 */
const fs=require('node:fs'),path=require('node:path');
const {runObserver}=require('./preexpiry-observer');
const {validObservation}=require('./observed-settlement-reconciler');
const MAX_RUNTIME_MS=12*60*1000;
const TRUSTED_SCHEDULE_COMPLETION_BUDGET_MS=3*60*1000;
const POLL_INTERVAL_MS=40000;
function budgetForObserverEvent(eventName){
 return eventName==='workflow_run'?TRUSTED_SCHEDULE_COMPLETION_BUDGET_MS:MAX_RUNTIME_MS;
}
const MAX_ATTEMPTS=20;
const LATE='KXBTC15M_LATE_CHECKPOINT_SHADOW_V1';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function evidenceRank(x){
 if(!x||!Array.isArray(x.frozenEvidence))return 0;
 const late=x.frozenEvidence.filter(f=>f.model===LATE);
 const direct=x.frozenEvidence.filter(f=>f.exchangeAtWitness?.state===
  'MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET');
 const lateVerified=late.filter(f=>f.exchangeAtWitness?.state===
  'MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET');
 // Prefer a timely DIRECTLY CORROBORATED late checkpoint, then a late
 // forecast without direct exchange corroboration, then early-only.
 return lateVerified.length?400+direct.length*10+x.frozenEvidence.length:
  late.length?200+direct.length*10+x.frozenEvidence.length:
  x.frozenEvidence.length?50+direct.length*10+x.frozenEvidence.length:0;
}
function isReady(x){
 return x.frozenEvidence.some(f=>f.model===LATE&&
  f.exchangeAtWitness?.state==='MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET');
}
// Aggregate diagnostic *polls*, never unique contracts or scored outcomes.
// Every bucket is a numeric count; the original frozen evidence is untouched.
function emptyEligibilityBucket(){
 return {validSourcePolls:0,unavailableSourcePolls:0,invalidSourcePolls:0,
  eligibleForecastPolls:0,expiredOnlyPolls:0,otherIneligiblePolls:0,
  emptyJournalPolls:0};
}
function recordEligibilityPoll(rollup,diagnostics){
 for(const kind of ['early','late']){
  const x=diagnostics?.[kind],bucket=rollup[kind];
  if(x?.status==='SOURCE_UNAVAILABLE_OR_UNFETCHED'){
   bucket.unavailableSourcePolls++;
  }else if(x?.status==='SOURCE_JOURNAL_INVALID'){
   bucket.invalidSourcePolls++;
  }else if(x?.status==='VALID_SELF_HASHED_SOURCE_JOURNAL'){
   if(!Number.isInteger(x.forecastCount)||x.forecastCount<0||
      !Number.isInteger(x.eligibleBeforeThreeRecordCap)||
      x.eligibleBeforeThreeRecordCap<0||
      x.eligibleBeforeThreeRecordCap>x.forecastCount||
      !Number.isInteger(x.reasons?.EXPIRED_OR_WITHIN_15S_CLOSE_GUARD))
    throw Error('Invalid public eligibility diagnostic');
   bucket.validSourcePolls++;
   if(x.forecastCount===0)bucket.emptyJournalPolls++;
   else if(x.eligibleBeforeThreeRecordCap>0)bucket.eligibleForecastPolls++;
   else if(x.reasons.EXPIRED_OR_WITHIN_15S_CLOSE_GUARD===x.forecastCount)
    bucket.expiredOnlyPolls++;
   else bucket.otherIneligiblePolls++;
  }else throw Error('Missing public eligibility diagnostic');
 }
}
async function watchScheduledObserver({
 observer=runObserver,clock=()=>Date.now(),wait=sleep,
 outDirectory='witness',maxRuntimeMs=MAX_RUNTIME_MS,
 pollIntervalMs=POLL_INTERVAL_MS,maxAttempts=MAX_ATTEMPTS
}={}){
 if(!Number.isInteger(maxRuntimeMs)||maxRuntimeMs<1000||maxRuntimeMs>MAX_RUNTIME_MS||
  !Number.isInteger(pollIntervalMs)||pollIntervalMs<1000||
  !Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>MAX_ATTEMPTS)
  throw Error('Unsafe bounded pre-expiry observer schedule');
 const start=clock(),deadline=start+maxRuntimeMs;
 let best=null,rank=0,attempts=0,lastError=null,stopReason='TIME_BUDGET_EXHAUSTED';
 let validProbes=0,invalidProbes=0,emptyProbes=0,provisionalLateProbes=0,directLateProbes=0;
 let probeArtifactsPreserved=0;
 const eligibilityPolls={early:emptyEligibilityBucket(),late:emptyEligibilityBucket()};
 const seenSourceCommitments=new Map();
 const probeDir=path.join(outDirectory,'.probe');
 const archiveDir=path.join(outDirectory,'probes');
 while(attempts<maxAttempts&&clock()<=deadline){
  attempts++;
  try{
   let diagnosticReceived=false;
   const r=await observer({outDirectory:probeDir,onEligibility:diagnostics=>{
    if(diagnosticReceived)throw Error('Duplicate eligibility diagnostic');
    diagnosticReceived=true;
    recordEligibilityPoll(eligibilityPolls,diagnostics);
   }});
   // Revalidate every candidate using the existing external-witness
   // envelope rules. Invalid or unsafe responses cannot write artifacts.
   validObservation(r);
   // Keep each distinct valid pre-expiry commitment, not just the selected "best".
   // This preserves distinct WAIT and directional contracts with their own
   // original runner timestamps and bounds artifacts at 20 x 200KB per run.
   // Save each distinct frozen model/market, plus a later separate direct
   // Kalshi corroboration if the first public read was unavailable. Repeated
   // 40-second polls of an unchanged WAIT do NOT consume 20 archive slots.
   const newCommitment=r.frozenEvidence.some(x=>{
    const key=x.model+':'+x.marketId+':'+x.frozenEventHash;
    const prior=seenSourceCommitments.get(key);
    const matched=x.exchangeAtWitness?.state==='MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET';
    return prior===undefined||(matched&&!prior);
   });
   if(newCommitment){
    const raw=JSON.stringify(r,null,2)+'\n';
    if(Buffer.byteLength(raw)>200000)throw Error('Oversized observation probe');
    fs.mkdirSync(archiveDir,{recursive:true});
    fs.writeFileSync(path.join(archiveDir,String(attempts).padStart(3,'0')+'.json'),
     raw,{flag:'wx',mode:0o600});
    probeArtifactsPreserved++;
    for(const x of r.frozenEvidence){
     const key=x.model+':'+x.marketId+':'+x.frozenEventHash;
     const matched=x.exchangeAtWitness?.state==='MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET';
     seenSourceCommitments.set(key,Boolean(seenSourceCommitments.get(key))||matched);
    }
   }
   validProbes++;
   if(!r.frozenEvidence.length)emptyProbes++;
   if(r.frozenEvidence.some(f=>f.model===LATE)&&!isReady(r))provisionalLateProbes++;
   if(isReady(r))directLateProbes++;
   const candidate=evidenceRank(r);
   if(candidate>rank){
    best=r;rank=candidate;
   }
   if(isReady(r)){
    stopReason='LATE_CHECKPOINT_EXTERNALLY_OBSERVED_AND_DIRECTLY_MATCHED';
    break;
   }
  }catch(e){
   invalidProbes++;
   lastError=String(e?.message||e).slice(0,160);
  }
  const remaining=deadline-clock();
  if(remaining<=0)break;
  await wait(Math.min(pollIntervalMs,remaining));
 }
 if(attempts>=maxAttempts&&stopReason==='TIME_BUDGET_EXHAUSTED')
  stopReason='MAX_ATTEMPTS_REACHED';
 if(best&&rank>0){
  // No result is recomputed at the end: preserve the runner timestamp
  // and exact digest from the qualifying earlier observation.
  fs.mkdirSync(outDirectory,{recursive:true});
  fs.writeFileSync(path.join(outDirectory,'public-preexpiry-observation.json'),
   JSON.stringify(best,null,2)+'\n',{mode:0o600});
 }
 const summary={
  version:'CASH_SCHEDULED_WITNESS_WATCH_V1',
  attempts,stopReason,
  validProbes,invalidProbes,emptyProbes,provisionalLateProbes,directLateProbes,
  captureCompletenessProven:false,
  evidenceRecorded:best?.frozenEvidence?.length||0,
  additionalImmutableProbeFiles:probeArtifactsPreserved,
  probeArchiveIncludesAbstentions:true,
  probeArchiveSelectionBasedOnOutcome:false,
  lateDirectionalRecorded:best?.frozenEvidence?.filter(x=>
   x.model===LATE&&['YES','NO'].includes(x.frozenSide)).length||0,
  directExchangeMatches:best?.directExchangeMatches||0,
  firstObservedAtRunner:best?.observedAtRunner||null,
  // Optional V1 summary extension. Counts refer to source polls, not distinct
  // frozen forecasts, not witnessed trades and not independent qualification.
  eligibilityPolls,
  independentQualifiedCount:0,ordersEnabled:false,
  lastError:lastError||null
 };
 fs.mkdirSync(outDirectory,{recursive:true});
 fs.writeFileSync(path.join(outDirectory,'observer-run-summary.json'),
  JSON.stringify(summary,null,2)+'\n',{mode:0o600});
 console.log('CASH_WATCH_ATTEMPTS='+attempts);
 console.log('CASH_WATCH_VALID_PROBES='+validProbes);
 console.log('CASH_WATCH_INVALID_PROBES='+invalidProbes);
 console.log('CASH_WATCH_EMPTY_PROBES='+emptyProbes);
 console.log('CASH_WATCH_PROVISIONAL_LATE_PROBES='+provisionalLateProbes);
 console.log('CASH_WATCH_DIRECT_LATE_PROBES='+directLateProbes);
 console.log('CASH_WATCH_STOP_REASON='+stopReason);
 console.log('CASH_WATCH_PRESERVED_PROBES='+probeArtifactsPreserved);
 console.log('CASH_WATCH_RECORDED='+summary.evidenceRecorded);
 console.log('CASH_WATCH_LATE_DIRECTIONAL='+summary.lateDirectionalRecorded);
 console.log('CASH_WATCH_DIRECT_MATCHES='+summary.directExchangeMatches);
 console.log('CASH_WATCH_ELIGIBILITY_EARLY='+JSON.stringify(eligibilityPolls.early));
 console.log('CASH_WATCH_ELIGIBILITY_LATE='+JSON.stringify(eligibilityPolls.late));
 console.log('CASH_WATCH_INDEPENDENTLY_QUALIFIED=0');
 return summary;
}
if(require.main===module)
 watchScheduledObserver({
  maxRuntimeMs:budgetForObserverEvent(process.env.GITHUB_EVENT_NAME)
 }).catch(e=>{
  console.error('CASH scheduled witness watch failed closed: '+String(e?.message||e));
  process.exitCode=1;
 });
module.exports={watchScheduledObserver,evidenceRank,isReady,MAX_RUNTIME_MS,
 TRUSTED_SCHEDULE_COMPLETION_BUDGET_MS,budgetForObserverEvent,
 POLL_INTERVAL_MS,MAX_ATTEMPTS,emptyEligibilityBucket,recordEligibilityPoll};
