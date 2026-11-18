'use strict';
/*
 * Bounded GitHub-runner watcher for a scheduled job that starts late.
 * No Railway code or model change. This is NOT an always-on server and
 * cannot compensate for GitHub jobs that never start.
 *
 * Each poll uses the existing full self-hash verification and direct
 * public Kalshi market check. Keep only a single strongest BEFORE-CLOSE
 * observation per run, preserving its original runner observedAt time.
 */
const fs=require('node:fs'),path=require('node:path');
const {runObserver}=require('./preexpiry-observer');
const {validObservation}=require('./observed-settlement-reconciler');
const MAX_RUNTIME_MS=12*60*1000;
const POLL_INTERVAL_MS=40000;
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
 const probeDir=path.join(outDirectory,'.probe');
 while(attempts<maxAttempts&&clock()<=deadline){
  attempts++;
  try{
   const r=await observer({outDirectory:probeDir});
   // Revalidate every candidate using the existing external-witness
   // envelope rules. Invalid or unsafe responses cannot write artifacts.
   validObservation(r);
   const candidate=evidenceRank(r);
   if(candidate>rank){
    best=r;rank=candidate;
   }
   if(isReady(r)){
    stopReason='LATE_CHECKPOINT_EXTERNALLY_OBSERVED_AND_DIRECTLY_MATCHED';
    break;
   }
  }catch(e){
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
  evidenceRecorded:best?.frozenEvidence?.length||0,
  lateDirectionalRecorded:best?.frozenEvidence?.filter(x=>
   x.model===LATE&&['YES','NO'].includes(x.frozenSide)).length||0,
  directExchangeMatches:best?.directExchangeMatches||0,
  firstObservedAtRunner:best?.observedAtRunner||null,
  independentQualifiedCount:0,ordersEnabled:false,
  lastError:lastError||null
 };
 console.log('CASH_WATCH_ATTEMPTS='+attempts);
 console.log('CASH_WATCH_STOP_REASON='+stopReason);
 console.log('CASH_WATCH_RECORDED='+summary.evidenceRecorded);
 console.log('CASH_WATCH_LATE_DIRECTIONAL='+summary.lateDirectionalRecorded);
 console.log('CASH_WATCH_DIRECT_MATCHES='+summary.directExchangeMatches);
 console.log('CASH_WATCH_INDEPENDENTLY_QUALIFIED=0');
 return summary;
}
if(require.main===module)
 watchScheduledObserver().catch(e=>{
  console.error('CASH scheduled witness watch failed closed: '+String(e?.message||e));
  process.exitCode=1;
 });
module.exports={watchScheduledObserver,evidenceRank,isReady,MAX_RUNTIME_MS,
 POLL_INTERVAL_MS,MAX_ATTEMPTS};
