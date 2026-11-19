'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createShadowJournal}=require('../cash-shadow-journal');
const {sourceWitnessCoverage}=require('../cash-shadow-source-witness-coverage');
const {runCoverage}=require('../cash-shadow-source-coverage-runner');
const ASOF=1795038437246,CLOSE=1795039200000,OBS=1795038661399,AFTER=CLOSE+120000;
const MID='KXBTC15M-26NOV181700-00',MID2='KXBTC15M-26NOV181715-00';
function dir(t){let x=fs.mkdtempSync(path.join(os.tmpdir(),'cash-witness-gap-'));t.after(()=>fs.rmSync(x,{recursive:true,force:true}));return x}
function make(two=true){
 const j=createShadowJournal();
 const add=(side,marketId)=>{
  return j.append({modelId:'CASH_SHADOW_SPOT_MOMENTUM_V1',
   marketId,asOfMs:ASOF,side,leadSeconds:(CLOSE-ASOF)/1000,
   strikePrice:65000,reason:'TEST_ONLY',features:{source:'TEST'},
   probability:null,calibrated:false,executionAllowed:false},
   {recordedAtMs:ASOF+1000});
 };
 const e1=add('WAIT',MID),e2=two?add('YES',MID2):null;
 return {snapshot:j.exportSnapshot(),e1,e2};
}
function put(root,event,run='44405660608',observed=OBS,overrides={}){
 const sub=path.join(root,'public-shadow-witness');fs.mkdirSync(sub,{recursive:true});
 const doc={
  version:'CASH_SHADOW_GITHUB_PUBLIC_OBSERVATION_V1',
  provenance:'GITHUB_RUNNER_FETCH_AFTER_NETWORK_RESPONSE',
  sourceUrl:'https://cash-simulation-web-staging.up.railway.app/api/model-lab/shadow/export',
  sourceSha256:'b'.repeat(64),githubRunId:run,
  githubRepository:'xandputaaa/CASH-staging',
  githubCommitSha:'f6e02a86b57135cda65975838b5cbad6148f5265',
  observedAtRunner:new Date(observed).toISOString(),status:'OBSERVED_PREEXPIRY',
  observedForecasts:[{
   modelId:event.modelId,marketId:event.marketId,side:event.side,
   frozenEventHash:event.hash,observedAtRunnerMs:observed,
   forecastAsOfMs:event.asOfMs,contractClosesAtMs:event.closesAtMs,
   source:'UNVERIFIED_PUBLIC_SHADOW_JOURNAL',independentQualification:false,
   ...overrides
  }],
  observedBeforeExpiryCount:1,independentlyQualifiedCount:0,
  realMoneyOrdersAllowed:false,note:'Public claim only'
 };
 fs.writeFileSync(path.join(sub,run+'.json'),JSON.stringify(doc)+'\n');
}
test('source-only YES is classified as missing external witness, never a verified directional result',t=>{
 const root=dir(t),{snapshot}=make();
 const r=sourceWitnessCoverage({archiveRoot:root,sourceSnapshot:snapshot,asOfMs:AFTER});
 assert.equal(r.sourceCommittedContracts,2);
 assert.equal(r.sourceOnlyNotExternallyWitnessed,2);
 assert.equal(r.sourceOnlyDirectionalNotExternallyWitnessed,1);
 assert.equal(r.expiredSourceOnly,2);
 assert.equal(r.externalWitnessDirectional,0);
 assert.equal(r.independentlyQualifiedCount,0);
 assert.equal(r.scoredOutcomes,0);
 assert.equal(r.ordersAllowed,false);
});
test('one verified WAIT witness does not hide source-only YES record',t=>{
 const root=dir(t),{snapshot,e1}=make();put(root,e1);
 const r=sourceWitnessCoverage({archiveRoot:root,sourceSnapshot:snapshot,asOfMs:AFTER});
 assert.equal(r.externalWitnessUniqueContracts,1);
 assert.equal(r.externalWitnessAbstentions,1);
 assert.equal(r.sourceCommitmentsMatchingWitness,1);
 assert.equal(r.sourceOnlyNotExternallyWitnessed,1);
 assert.equal(r.sourceOnlyDirectionalNotExternallyWitnessed,1);
 assert.equal(r.sourceOnlySamples[0].side,'YES');
 assert.equal(r.sourceOnlySamples[0].accuracyEligible,false);
});
test('repeated GitHub reads of one event never create a second distinct witness',t=>{
 const root=dir(t),{snapshot,e1}=make(false);
 put(root,e1);put(root,e1,'44405660609',OBS+60000);
 const r=sourceWitnessCoverage({archiveRoot:root,sourceSnapshot:snapshot,asOfMs:AFTER});
 assert.equal(r.externalWitnessDuplicateObservations,1);
 assert.equal(r.externalWitnessUniqueContracts,1);
 assert.equal(r.sourceOnlyNotExternallyWitnessed,0);
 assert.equal(r.status,'ALL_SOURCE_COMMITMENTS_EXTERNALLY_OBSERVED');
});
test('unwitnessed still-open contracts are separated from expired source-only',t=>{
 const root=dir(t),{snapshot}=make(false);
 const r=sourceWitnessCoverage({archiveRoot:root,sourceSnapshot:snapshot,asOfMs:CLOSE-20000});
 assert.equal(r.expiredSourceOnly,0);
 assert.equal(r.stillOpenSourceOnly,1);
 assert.equal(r.sourceOnlySamples[0].closeState,'OPEN_AT_COVERAGE_CHECK');
});
test('source outage never converts unknown source counts into zero',t=>{
 const root=dir(t),{e1}=make(false);put(root,e1);
 const r=sourceWitnessCoverage({archiveRoot:root,sourceSnapshot:null,asOfMs:AFTER});
 assert.equal(r.status,'SOURCE_UNAVAILABLE');
 assert.equal(r.externalWitnessUniqueContracts,1);
 assert.equal(r.sourceCommittedContracts,null);
 assert.equal(r.sourceOnlyNotExternallyWitnessed,null);
 assert.equal(r.independentlyQualifiedCount,0);
});
test('corrupted source journal fails fully closed',t=>{
 const root=dir(t),{snapshot}=make();
 snapshot.events[0].side='YES';
 assert.throws(()=>sourceWitnessCoverage({archiveRoot:root,sourceSnapshot:snapshot,asOfMs:AFTER}),
  /Shadow hash chain mismatch/);
});
test('journal cannot silently replace exact GH-witnessed event or side',t=>{
 const root=dir(t),{snapshot,e1}=make(false);
 put(root,e1,'44405660608',OBS,{frozenEventHash:'d'.repeat(64)});
 assert.throws(()=>sourceWitnessCoverage({archiveRoot:root,sourceSnapshot:snapshot,asOfMs:AFTER}),
  /Externally witnessed forecast conflicts/);
});
test('source missing a valid preexpiry witnessed market is a hard conflict',t=>{
 const root=dir(t),{e1}=make(false);put(root,e1);
 const other=createShadowJournal().exportSnapshot();
 assert.throws(()=>sourceWitnessCoverage({archiveRoot:root,sourceSnapshot:other,asOfMs:AFTER}),
  /Externally witnessed forecast conflicts/);
});
test('runner reads public journal once and writes bounded no-trade coverage artifact',async t=>{
 const root=dir(t),{snapshot,e1}=make();put(root,e1);
 const out=path.join(root,'audit','gap.json');let reads=0;
 const r=await runCoverage({
  archiveRoot:root,outFile:out,clock:()=>AFTER,
  fetchImpl:async url=>{
   reads++;assert.match(url,/api\/model-lab\/shadow\/export$/);
   return {ok:true,text:async()=>JSON.stringify(snapshot)}
  }
 });
 assert.equal(reads,1);
 assert.equal(r.sourceOnlyDirectionalNotExternallyWitnessed,1);
 const saved=JSON.parse(fs.readFileSync(out,'utf8'));
 assert.equal(saved.independentlyQualifiedCount,0);
 assert.equal(saved.ordersAllowed,false);
 assert.equal(saved.sourceFetchStatus,'FETCHED_UNVERIFIED');
});
test('runner preserves source unknown rather than zero if public endpoint unavailable',async t=>{
 const root=dir(t),{e1}=make(false);put(root,e1);
 const out=path.join(root,'gap.json');
 const r=await runCoverage({
  archiveRoot:root,outFile:out,clock:()=>AFTER,
  fetchImpl:async()=>{throw Error('offline')}
 });
 assert.equal(r.sourceCommittedContracts,null);
 assert.equal(r.sourceOnlyNotExternallyWitnessed,null);
 assert.equal(r.sourceFetchStatus,'UNAVAILABLE');
 assert.equal(r.externalWitnessUniqueContracts,1);
});
