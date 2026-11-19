'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {watchScheduledObserver}=require('../observer-watch');
const {collectWitnesses}=require('../observed-settlement-reconcile-cli');
const RUN='44435336585',REPO='xandputaaa/CASH-staging';
const EARLY='KXBTC15M_SETTLEMENT_EARLY_V3',LATE='KXBTC15M_LATE_CHECKPOINT_SHADOW_V1';
const ID='KXBTC15M-26NOV172015-15',CLOSE='2026-11-18T02:15:00.000Z';
const START=Date.parse('2026-11-18T02:11:00Z');
const FROZEN_EARLY='2026-11-18T02:03:00.000Z';
const FROZEN_LATE='2026-11-18T02:11:32.000Z';
function makeDir(t){
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'cash-gh-probe-bundle-'));
 t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 return d;
}
function event(model,side='WAIT'){
 return {
  model,marketId:ID,frozenSide:side,
  frozenAt:model===EARLY?FROZEN_EARLY:FROZEN_LATE,
  contractClosesAt:CLOSE,journalSequence:model===EARLY?1:2,
  frozenEventHash:model===EARLY?'a'.repeat(64):'b'.repeat(64),
  headHashSeen:'f'.repeat(64),publicProxyOnly:true,
  exchangeAtWitness:{
   state:'MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET',
   independentValidation:false,
   observedAtRunner:new Date(START+40500).toISOString(),
   publishedCloseTime:CLOSE,publicStrikeAtObserver:65000,
   publicStrikeType:'greater_or_equal',publicMarketStatusAtObserver:'active',
   exchangePublicFieldsSha256:'c'.repeat(64),
   quoteWasNotFrozenAtPrediction:true,isFill:false
  }
 };
}
function observation(at,items){
 return {
  version:'CASH_OFFSERVER_OBSERVATION_V1',
  observationClass:'GITHUB_RUNNER_UTC_CLOCK_PROVISIONAL',
  observedAtRunner:new Date(at).toISOString(),
  githubRunId:RUN,githubRepo:REPO,githubCommitSha:'d'.repeat(40),
  frozenEvidence:items,evidenceWitnessedBeforeExpiry:items.length,
  claimedIndependentlyQualifiedCount:0,calibrated:false,realOrdersEnabled:false,
  directExchangeMatches:items.length,independentQualifiedCount:0
 };
}
function runs(){
 return {workflow_runs:[{
  id:RUN,event:'schedule',conclusion:'success',
  created_at:new Date(START-10000).toISOString(),
  updated_at:new Date(START+300000).toISOString()
 }]};
}
function put(dir,run,doc,where='public-preexpiry-observation.json'){
 const p=path.join(dir,run,where);
 fs.mkdirSync(path.dirname(p),{recursive:true});
 fs.writeFileSync(p,JSON.stringify(doc)+'\n');return p;
}
test('bounded observer preserves first WAIT and later YES independently, rather than only best',async t=>{
 const root=makeDir(t),out=path.join(root,RUN);
 let tNow=START,attempts=0;
 const response=await watchScheduledObserver({
  outDirectory:out,clock:()=>tNow,
  wait:async ms=>{tNow+=ms;},
  pollIntervalMs:40000,maxRuntimeMs:3*60*1000,
  observer:async()=>{
   attempts++;
   return observation(tNow,attempts===1?
    [event(EARLY,'WAIT')]:[event(LATE,'YES')]);
  }
 });
 assert.equal(attempts,2);
 assert.equal(response.additionalImmutableProbeFiles,2);
 const preserved=fs.readdirSync(path.join(out,'probes'));
 assert.deepEqual(preserved,['001.json','002.json']);
 const early=JSON.parse(fs.readFileSync(path.join(out,'probes','001.json')));
 const later=JSON.parse(fs.readFileSync(path.join(out,'probes','002.json')));
 assert.equal(early.frozenEvidence[0].frozenSide,'WAIT');
 assert.equal(later.frozenEvidence[0].frozenSide,'YES');
 assert.ok(Date.parse(early.observedAtRunner)<Date.parse(later.observedAtRunner));
 const c=collectWitnesses(root,runs());
 assert.equal(c.distinctWitnessRuns,1);
 assert.equal(c.validProbeFiles,2);
 assert.equal(c.invalidProbeFiles,0);
 assert.equal(c.witnesses.length,3);
 assert.equal(c.witnesses[0].frozenEvidence[0].frozenSide,'WAIT');
 assert.equal(c.witnesses[1].frozenEvidence[0].frozenSide,'YES');
 assert.equal(c.witnesses[2].frozenEvidence[0].frozenSide,'YES');
 assert.equal(new Set(c.witnesses.flatMap(w=>w.frozenEvidence.map(e=>
  e.model+':'+e.marketId))).size,2);
});
test('legacy summary-only GitHub witness still loads without probe records',t=>{
 const root=makeDir(t);
 put(root,RUN,observation(START,[event(EARLY)]));
 const c=collectWitnesses(root,runs());
 assert.equal(c.witnesses.length,1);
 assert.equal(c.validProbeFiles,0);
 assert.equal(c.distinctWitnessRuns,1);
});
test('archived repeated original market with a conflicting frozen side fails closed',t=>{
 const root=makeDir(t);
 put(root,RUN,observation(START,[event(EARLY,'WAIT')]));
 put(root,RUN,observation(START+20000,[event(EARLY,'YES')]),'probes/001.json');
 assert.throws(()=>collectWitnesses(root,runs()),/Contradictory independent/);
});
test('bad probe timestamp is rejected and cannot add external witness coverage',t=>{
 const root=makeDir(t);
 put(root,RUN,observation(START,[event(EARLY)]));
 put(root,RUN,observation(Date.parse(CLOSE)+1000,[event(LATE,'YES')]),'probes/001.json');
 const c=collectWitnesses(root,runs());
 assert.equal(c.witnesses.length,1);
 assert.equal(c.invalidProbeFiles,1);
 assert.equal(c.validProbeFiles,0);
});
test('probe directory symlinks and unbounded artifact counts fail closed',t=>{
 const root=makeDir(t);
 put(root,RUN,observation(START,[event(EARLY)]));
 const p=path.join(root,RUN,'probes');fs.symlinkSync(root,p);
 assert.throws(()=>collectWitnesses(root,runs()),/Unsafe observer probe directory/);
 fs.unlinkSync(p);fs.mkdirSync(p);
 for(let i=1;i<=21;i++){
  fs.writeFileSync(path.join(p,String(i).padStart(3,'0')+'.json'),'{}');
 }
 assert.throws(()=>collectWitnesses(root,runs()),/Invalid observer probe/);
});
test('probe with same original frozen hash is a repeated observation, not a new market',t=>{
 const root=makeDir(t),first=observation(START,[event(EARLY)]);
 put(root,RUN,first);
 put(root,RUN,observation(START+20000,[event(EARLY)]),'probes/001.json');
 const c=collectWitnesses(root,runs());
 assert.equal(c.validProbeFiles,1);
 assert.equal(c.witnesses.length,2);
 assert.equal(new Set(c.witnesses.flatMap(w=>w.frozenEvidence.map(e=>
  e.model+':'+e.marketId))).size,1);
});

test('repeated identical WAIT polls are deduplicated but still witnessed at first runner time',async t=>{
 const root=makeDir(t),out=path.join(root,RUN);
 let tNow=START;
 const r=await watchScheduledObserver({
  outDirectory:out,clock:()=>tNow,
  wait:async ms=>{tNow+=ms},
  pollIntervalMs:40000,maxRuntimeMs:135000,
  observer:async()=>observation(tNow,[event(EARLY,'WAIT')])
 });
 assert.equal(r.additionalImmutableProbeFiles,1);
 assert.equal(fs.readdirSync(path.join(out,'probes')).length,1);
 const first=JSON.parse(fs.readFileSync(path.join(out,'probes','001.json')));
 assert.equal(first.observedAtRunner,new Date(START).toISOString());
 const collected=collectWitnesses(root,runs());
 assert.equal(collected.validProbeFiles,1);
 assert.equal(collected.distinctWitnessRuns,1);
 assert.equal(collected.witnesses.length,2);
});
test('an unavailable public Kalshi check later corroborated before expiry adds a second proof',async t=>{
 const root=makeDir(t),out=path.join(root,RUN);
 let now=START,count=0;
 const r=await watchScheduledObserver({
  outDirectory:out,clock:()=>now,wait:async ms=>{now+=ms},
  pollIntervalMs:40000,maxRuntimeMs:130000,
  observer:async()=>{
   count++;
   const e=event(EARLY,'WAIT');
   if(count===1)e.exchangeAtWitness={state:'EXCHANGE_MARKET_UNAVAILABLE',
    independentValidation:false};
   return observation(now,[e]);
  }
 });
 assert.equal(r.additionalImmutableProbeFiles,2);
 assert.equal(fs.readdirSync(path.join(out,'probes')).length,2);
 const first=JSON.parse(fs.readFileSync(path.join(out,'probes','001.json')));
 const second=JSON.parse(fs.readFileSync(path.join(out,'probes','002.json')));
 assert.equal(first.frozenEvidence[0].exchangeAtWitness.state,'EXCHANGE_MARKET_UNAVAILABLE');
 assert.equal(second.frozenEvidence[0].exchangeAtWitness.state,'MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET');
});
