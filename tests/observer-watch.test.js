'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {watchScheduledObserver,evidenceRank,MAX_RUNTIME_MS}=require('../observer-watch');
const EARLY='KXBTC15M_SETTLEMENT_EARLY_V3';
const LATE='KXBTC15M_LATE_CHECKPOINT_SHADOW_V1';
const close='2026-11-18T02:15:00Z';
const at=Date.parse('2026-11-18T02:08:00Z');
const hash='a'.repeat(64);
const marketId='KXBTC15M-26NOV172015-15';
function e(model,atMs,side='WAIT',direct=false,observedMs=atMs+1000){
 return {model,marketId,frozenSide:side,
  frozenAt:new Date(atMs).toISOString(),contractClosesAt:close,
  journalSequence:model===LATE?2:1,frozenEventHash:hash,
  headHashSeen:hash,publicProxyOnly:true,
  exchangeAtWitness:direct?{
   state:'MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET',independentValidation:false,
   observedAtRunner:new Date(observedMs).toISOString(),
   publishedCloseTime:close,publicStrikeAtObserver:65231.51,
   publicStrikeType:'greater_or_equal',publicMarketStatusAtObserver:'active',
   exchangePublicFieldsSha256:'b'.repeat(64),
   quoteWasNotFrozenAtPrediction:true,isFill:false
  }:{state:'EXCHANGE_MARKET_UNAVAILABLE',independentValidation:false}};
}
function response(now,items){
 const atRunner=new Date(now).toISOString();
 return {version:'CASH_OFFSERVER_OBSERVATION_V1',
  observationClass:'GITHUB_RUNNER_UTC_CLOCK_PROVISIONAL',
  githubRepo:'xandputaaa/CASH-staging',
  githubRunId:'44219324481',githubCommitSha:'a'.repeat(40),
  observedAtRunner:atRunner,claimedIndependentlyQualifiedCount:0,
  calibrated:false,realOrdersEnabled:false,
  frozenEvidence:items,evidenceWitnessedBeforeExpiry:items.length,
  directExchangeMatches:items.filter(x=>x.exchangeAtWitness?.state===
    'MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET').length};
}
function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'cash-witness-'))}
test('delayed scheduled job observes early WAIT, then later original YES/NO with independent Kalshi corroboration',async()=>{
 const dir=temp();
 let t=at,calls=0;
 const r=await watchScheduledObserver({outDirectory:dir,
  clock:()=>t,wait:async ms=>{t+=ms;},
  pollIntervalMs:40000,maxRuntimeMs:8*60*1000,
  observer:async()=>{
   calls++;
   const early=e(EARLY,Date.parse('2026-11-18T02:03:00Z'),
    'WAIT',true,t+1000);
   const late=t>=Date.parse('2026-11-18T02:11:40Z')?
    e(LATE,Date.parse('2026-11-18T02:11:32Z'),'NO',true,t+1000):null;
   return response(t,[early,...(late?[late]:[])]);
  }});
 assert.ok(calls>=5&&calls<15);
 assert.equal(r.stopReason,'LATE_CHECKPOINT_EXTERNALLY_OBSERVED_AND_DIRECTLY_MATCHED');
 assert.equal(r.evidenceRecorded,2);
 assert.equal(r.lateDirectionalRecorded,1);
 assert.equal(r.directExchangeMatches,2);
 assert.equal(r.validProbes,calls);
 assert.equal(r.invalidProbes,0);
 assert.ok(r.provisionalLateProbes>=0);
 assert.equal(r.directLateProbes,1);
 assert.equal(r.captureCompletenessProven,false);
 assert.equal(r.independentQualifiedCount,0);
 assert.equal(r.ordersEnabled,false);
 const saved=JSON.parse(fs.readFileSync(path.join(dir,'public-preexpiry-observation.json')));
 assert.equal(saved.observedAtRunner,new Date(t).toISOString());
 assert.equal(saved.frozenEvidence[1].frozenSide,'NO');
 assert.equal(saved.frozenEvidence[1].exchangeAtWitness.publicStrikeAtObserver,65231.51);
 fs.rmSync(dir,{recursive:true,force:true});
});
test('failed direct public Kalshi result retains earlier externally witnessed side but never invents corroboration',async()=>{
 const dir=temp();let t=at,calls=0;
 const r=await watchScheduledObserver({outDirectory:dir,
  clock:()=>t,wait:async ms=>{t+=ms;},pollIntervalMs:40000,
  maxRuntimeMs:3*60*1000,
  observer:async()=>{
   calls++;
   return response(t,[e(EARLY,Date.parse('2026-11-18T02:03:00Z'),'WAIT',false),
    e(LATE,Date.parse('2026-11-18T02:11:32Z'),'YES',false)]);
  }});
 assert.equal(r.lateDirectionalRecorded,0); // future freeze rejected until runner actually reaches it
 assert.equal(r.directExchangeMatches,0);
 assert.equal(r.independentQualifiedCount,0);
 assert.equal(r.ordersEnabled,false);
 assert.equal(calls>0,true);
 fs.rmSync(dir,{recursive:true,force:true});
});
test('pre-expiry unverified late YES remains preserved as a provisional observation when no direct response is available',async()=>{
 const dir=temp();let t=Date.parse('2026-11-18T02:12:00Z');
 const r=await watchScheduledObserver({outDirectory:dir,
  clock:()=>t,wait:async ms=>{t+=ms;},pollIntervalMs:40000,
  maxRuntimeMs:90*1000,
  observer:async()=>response(t,[e(LATE,Date.parse('2026-11-18T02:11:32Z'),'YES')])});
 assert.equal(r.evidenceRecorded,1);
 assert.equal(r.lateDirectionalRecorded,1);
 assert.equal(r.directExchangeMatches,0);
 const saved=JSON.parse(fs.readFileSync(path.join(dir,'public-preexpiry-observation.json')));
 assert.equal(saved.frozenEvidence[0].frozenSide,'YES');
 assert.equal(saved.frozenEvidence[0].exchangeAtWitness.state,'EXCHANGE_MARKET_UNAVAILABLE');
 fs.rmSync(dir,{recursive:true,force:true});
});
test('missing forecasts, invalid observer response and deadline never create false files',async()=>{
 const dir=temp();let t=at;
 const r=await watchScheduledObserver({outDirectory:dir,
  clock:()=>t,wait:async ms=>{t+=ms;},pollIntervalMs:40000,maxRuntimeMs:80000,
  observer:async()=>response(t,[])});
 assert.equal(r.evidenceRecorded,0);
 const summary=JSON.parse(fs.readFileSync(path.join(dir,'observer-run-summary.json'),'utf8'));
 assert.equal(summary.evidenceRecorded,0);
 assert.equal(summary.captureCompletenessProven,false);
 assert.ok(summary.emptyProbes>0);
 assert.ok(r.emptyProbes>0);
 assert.equal(r.validProbes,r.attempts);
 assert.equal(r.lateDirectionalRecorded,0);
 assert.equal(r.independentQualifiedCount,0);
 assert.equal(fs.existsSync(path.join(dir,'public-preexpiry-observation.json')),false);
 fs.rmSync(dir,{recursive:true,force:true});
 const d=temp();let x=at;
 const invalid=await watchScheduledObserver({outDirectory:d,
  clock:()=>x,wait:async ms=>{x+=ms;},pollIntervalMs:40000,
  maxRuntimeMs:80000,
  observer:async()=>({...response(x,[]),independentQualifiedCount:100,
    claimedIndependentlyQualifiedCount:100})});
 assert.equal(invalid.evidenceRecorded,0);
 assert.equal(invalid.validProbes,0);
 const failedSummary=JSON.parse(fs.readFileSync(path.join(d,'observer-run-summary.json'),'utf8'));
 assert.ok(failedSummary.invalidProbes>0);
 assert.equal(failedSummary.evidenceRecorded,0);
 assert.ok(invalid.invalidProbes>0);
 assert.equal(fs.existsSync(path.join(d,'public-preexpiry-observation.json')),false);
 fs.rmSync(d,{recursive:true,force:true});
});
test('best observed result remains the one before expiry if later retry becomes stale or errors',async()=>{
 const dir=temp();let t=Date.parse('2026-11-18T02:12:00Z'),calls=0;
 const frozen=e(LATE,Date.parse('2026-11-18T02:11:32Z'),'NO',false);
 const r=await watchScheduledObserver({outDirectory:dir,clock:()=>t,
  wait:async ms=>{t+=ms;},pollIntervalMs:40000,maxRuntimeMs:4*60*1000,
  observer:async()=>{calls++;if(calls>1)throw Error('Public source offline');return response(t,[frozen]);}});
 assert.ok(calls>1);
 assert.equal(r.evidenceRecorded,1);
 const saved=JSON.parse(fs.readFileSync(path.join(dir,'public-preexpiry-observation.json')));
 assert.equal(saved.observedAtRunner,'2026-11-18T02:12:00.000Z');
 assert.equal(saved.claimedIndependentlyQualifiedCount,0);
 assert.equal(r.ordersEnabled,false);
 fs.rmSync(dir,{recursive:true,force:true});
});
test('bounded runner rejects schedules beyond published max or invalid loops',async()=>{
 await assert.rejects(watchScheduledObserver({maxRuntimeMs:MAX_RUNTIME_MS+1}),/Unsafe bounded/);
 await assert.rejects(watchScheduledObserver({maxAttempts:999}),/Unsafe bounded/);
 assert.equal(evidenceRank({frozenEvidence:[]}),0);
});
