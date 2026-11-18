'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createShadowJournal}=require('../cash-shadow-journal');
const {reconcileShadowPublicFinals}=require('../cash-shadow-settlement-reconciler');
const {runShadowSettlement}=require('../cash-shadow-settlement-runner');
const CLOSE=1795039200000,ASOF=1795038437246,OBS=1795038661399;
const MID='KXBTC15M-26NOV181700-00',REPO='xandputaaa/CASH-staging';
function temp(t){
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'cash-final-shadow-'));
 t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 return d;
}
function fixture(side='YES',marketId=MID){
 const journal=createShadowJournal();
 const e=journal.append({
  modelId:'CASH_SHADOW_SPOT_MOMENTUM_V1',marketId,side,reason:'TEST_ONLY',
  asOfMs:ASOF,leadSeconds:(CLOSE-ASOF)/1000,strikePrice:65000,
  features:{testOnly:true},executionAllowed:false,calibrated:false,
  probability:null
 },{recordedAtMs:ASOF+1000});
 return {snapshot:journal.exportSnapshot(),event:e};
}
function witness(run,event,{side=event.side,observed=OBS}={}){
 return {
  version:'CASH_SHADOW_GITHUB_PUBLIC_OBSERVATION_V1',
  provenance:'GITHUB_RUNNER_FETCH_AFTER_NETWORK_RESPONSE',
  sourceUrl:'https://cash-simulation-web-staging.up.railway.app/api/model-lab/shadow/export',
  sourceSha256:'d'.repeat(64),githubRunId:run,githubRepository:REPO,
  githubCommitSha:'0b93f9d701319b6969c48d90d3ab0c02a21a55e4',
  observedAtRunner:new Date(observed).toISOString(),status:'OBSERVED_PREEXPIRY',
  observedForecasts:[{
   modelId:event.modelId,marketId:event.marketId,side,
   frozenEventHash:event.hash,observedAtRunnerMs:observed,
   forecastAsOfMs:event.asOfMs,contractClosesAtMs:event.closesAtMs,
   source:'UNVERIFIED_PUBLIC_SHADOW_JOURNAL',independentQualification:false
  }],
  observedBeforeExpiryCount:1,independentlyQualifiedCount:0,
  realMoneyOrdersAllowed:false,note:'Public source claim, not model qualification.'
 };
}
function put(dir,record){
 const dest=path.join(dir,'public-shadow-witness');
 fs.mkdirSync(dest,{recursive:true});
 fs.writeFileSync(path.join(dest,record.githubRunId+'.json'),
  JSON.stringify(record)+'\n');
}
function market(data={}){
 return {
  ticker:MID,close_time:new Date(CLOSE).toISOString(),
  settlement_ts:new Date(CLOSE+3000).toISOString(),
  status:'settled',is_provisional:false,strike_type:'greater_or_equal',
  floor_strike:65000,expiration_value:65008.01,result:'yes',...data
 };
}
function mockNetwork(value,cb=()=>{}){
 return async url=>{
  cb(url);
  return {ok:true,text:async()=>JSON.stringify({market:value})};
 };
}
function dOpts({now=CLOSE+60000,onRead=()=>{},result=market(),
 second=null,delayOverridden=null}={}){
 let t=now,calls=0;
 return {
  clock:()=>t,
  delay:async ms=>{assert.ok(ms>=20000);t+=delayOverridden??ms;},
  fetchImpl:async url=>{
   calls++;onRead(url);
   return {ok:true,text:async()=>JSON.stringify({
    market:calls===2&&second?second:result
   })};
  },
  count:()=>calls
 };
}
test('a hash-matched witnessed YES gets only a provisional hit after two public Kalshi reads',async t=>{
 const d=temp(t),{snapshot,event}=fixture('YES');
 put(d,witness('44405660608',event));
 const o=dOpts();
 const r=await reconcileShadowPublicFinals({archiveRoot:d,sourceSnapshot:snapshot},o);
 assert.equal(r.witnessedContracts,1);
 assert.equal(r.sourceCommittedMatches,1);
 assert.equal(r.witnessedDirectional,1);
 assert.equal(r.evaluatedDirectional,1);
 assert.equal(r.provisionalHits,1);
 assert.equal(r.provisionalMisses,0);
 assert.equal(r.independentlyQualifiedCount,0);
 assert.equal(r.tradesPlaced,0);
 assert.equal(r.realMoneyOrdersAllowed,false);
 assert.equal(r.rows[0].state,'TWO_READ_PUBLIC_NUMERIC_MATCH');
 assert.equal(r.rows[0].publishedWinner,'YES');
 assert.equal(o.count(),2);
 assert.ok(!JSON.stringify(r).includes('65008.01'),'Do not write numeric BRTI result to public artifact');
});
test('witnessed NO is a provisional miss if twice confirmed public winner is YES',async t=>{
 const d=temp(t),{snapshot,event}=fixture('NO');put(d,witness('44405660608',event));
 const r=await reconcileShadowPublicFinals({archiveRoot:d,sourceSnapshot:snapshot},dOpts());
 assert.equal(r.provisionalHits,0);
 assert.equal(r.provisionalMisses,1);
 assert.equal(r.rows[0].provisionalOutcome,'MISS');
 assert.equal(r.independentlyQualifiedCount,0);
});
test('witnessed WAIT is an abstention, never fetched from Kalshi or called a loss',async t=>{
 const d=temp(t),{snapshot,event}=fixture('WAIT');put(d,witness('44405660608',event));
 const o=dOpts();
 const r=await reconcileShadowPublicFinals({archiveRoot:d,sourceSnapshot:snapshot},o);
 assert.equal(r.witnessedWaits,1);assert.equal(r.witnessedDirectional,0);
 assert.equal(r.rows[0].state,'WITNESSED_WAIT_NOT_SCORED');
 assert.equal(r.evaluatedDirectional,0);assert.equal(o.count(),0);
});
test('same frozen event witnessed twice is checked once, never inflates denominator',async t=>{
 const d=temp(t),{snapshot,event}=fixture('YES');
 put(d,witness('44405660608',event));
 put(d,witness('44405660609',event,{observed:OBS+60000}));
 const o=dOpts(),r=await reconcileShadowPublicFinals({archiveRoot:d,sourceSnapshot:snapshot},o);
 assert.equal(r.witnessedContracts,1);
 assert.equal(r.repeatedObservationsIgnored,1);
 assert.equal(r.evaluatedDirectional,1);
 assert.equal(o.count(),2);
});
test('official market missing, wrong ticker, mismatched close, provisional or void fails closed',async t=>{
 const d=temp(t),{snapshot,event}=fixture('YES');put(d,witness('44405660608',event));
 for(const v of [
  null,market({ticker:'KXBTC15M-DIFFERENT-00'}),
  market({close_time:new Date(CLOSE+1000).toISOString()}),
  market({status:'active'}),market({is_provisional:true}),
  market({result:'void'})
 ]){
  const o=dOpts({result:v});
  const r=await reconcileShadowPublicFinals({archiveRoot:d,sourceSnapshot:snapshot},o);
  assert.equal(o.count(),1);
  assert.equal(r.evaluatedDirectional,0);
  assert.equal(r.provisionalHits,0);
  assert.equal(r.rows[0].publishedWinner,undefined);
 }
});
test('numeric payout contradiction and retrospectively mismatched strike are blocked',async t=>{
 const d=temp(t),{snapshot,event}=fixture('YES');put(d,witness('44405660608',event));
 for(const [m,code] of [
  [market({result:'no'}),'OFFICIAL_NUMERIC_RULE_UNCONFIRMED'],
  [market({expiration_value:null}),'OFFICIAL_NUMERIC_RULE_UNCONFIRMED'],
  [market({floor_strike:65001}),'FROZEN_PUBLIC_STRIKE_MISMATCH'],
  [market({strike_type:'strictly_greater'}),'OFFICIAL_NUMERIC_RULE_UNCONFIRMED']
 ]){
  const o=dOpts({result:m});
  const r=await reconcileShadowPublicFinals({archiveRoot:d,sourceSnapshot:snapshot},o);
  assert.equal(r.rows[0].state,code);
  assert.equal(r.evaluatedDirectional,0);
  assert.equal(o.count(),1);
 }
});
test('same API changing between reads is visible as conflict, not a confirmed hit',async t=>{
 const d=temp(t),{snapshot,event}=fixture('YES');put(d,witness('44405660608',event));
 const o=dOpts({second:market({settlement_ts:new Date(CLOSE+4000).toISOString()})});
 const r=await reconcileShadowPublicFinals({archiveRoot:d,sourceSnapshot:snapshot},o);
 assert.equal(o.count(),2);
 assert.equal(r.rows[0].state,'OFFICIAL_PUBLIC_RESULT_CHANGED_OR_UNAVAILABLE');
 assert.equal(r.evaluatedDirectional,0);
 assert.equal(r.provisionalHits,0);
});
test('twice fetched official results with less than 20s runner time are not final',async t=>{
 const d=temp(t),{snapshot,event}=fixture('YES');put(d,witness('44405660608',event));
 const o=dOpts({delayOverridden:3000});
 const r=await reconcileShadowPublicFinals({archiveRoot:d,sourceSnapshot:snapshot},o);
 assert.equal(r.rows[0].state,'OFFICIAL_PUBLIC_READS_TOO_CLOSE');
 assert.equal(r.evaluatedDirectional,0);
});
test('before-expiry or too-early request causes no Kalshi direct network call',async t=>{
 const d=temp(t),{snapshot,event}=fixture('YES');put(d,witness('44405660608',event));
 const o=dOpts({now:CLOSE+10000});
 const r=await reconcileShadowPublicFinals({archiveRoot:d,sourceSnapshot:snapshot},o);
 assert.equal(o.count(),0);
 assert.equal(r.rows[0].state,'NOT_YET_PAST_FINAL_CHECK_WINDOW');
});
test('missing exact frozen hash and invalid source snapshot never produce a score',async t=>{
 const d=temp(t),{snapshot,event}=fixture('YES');put(d,witness('44405660608',event));
 const other=fixture('YES','KXBTC15M-26NOV181700-01');
 let o=dOpts(),r=await reconcileShadowPublicFinals({
  archiveRoot:d,sourceSnapshot:other.snapshot
 },o);
 assert.equal(o.count(),0);
 assert.equal(r.rows[0].state,'FROZEN_COMMITMENT_NOT_FOUND');
 const corrupt=JSON.parse(JSON.stringify(snapshot));
 corrupt.events[0].strikePrice=60000;
 await assert.rejects(()=>reconcileShadowPublicFinals({
  archiveRoot:d,sourceSnapshot:corrupt
 },dOpts()),/Shadow hash chain mismatch/);
});
test('missing source journal returns explicit unavailable, never treats side as verified',async t=>{
 const d=temp(t),{event}=fixture('YES');put(d,witness('44405660608',event));
 const o=dOpts();
 const r=await reconcileShadowPublicFinals({archiveRoot:d,sourceSnapshot:null},o);
 assert.equal(r.state,'SOURCE_JOURNAL_UNAVAILABLE');
 assert.equal(r.rows[0].state,'SOURCE_JOURNAL_UNAVAILABLE');
 assert.equal(o.count(),0);assert.equal(r.independentlyQualifiedCount,0);
});
test('frozen archival conflict rejects settlement recheck before any direct API request',async t=>{
 const d=temp(t),{snapshot,event}=fixture('YES');put(d,witness('44405660608',event));
 put(d,witness('44405660609',event,{side:'NO',observed:OBS+60000}));
 const o=dOpts();
 await assert.rejects(()=>reconcileShadowPublicFinals({
  archiveRoot:d,sourceSnapshot:snapshot
 },o),/Conflicting immutable/);
 assert.equal(o.count(),0);
});
test('runner writes read-only WAIT diagnostics without accessing Kalshi market',async t=>{
 const d=temp(t),{snapshot,event}=fixture('WAIT');put(d,witness('44405660608',event));
 const dest=path.join(d,'result.json');let calls=0;
 const r=await runShadowSettlement({
  archiveRoot:d,outFile:dest,clock:()=>CLOSE+60000,
  fetchImpl:async url=>{
   calls++;assert.match(url,/api\/model-lab\/shadow\/export$/);
   return {ok:true,text:async()=>JSON.stringify(snapshot)};
  }
 });
 assert.equal(calls,1);
 assert.equal(r.witnessedDirectional,0);
 assert.equal(r.independentlyQualifiedCount,0);
 const stored=JSON.parse(fs.readFileSync(dest,'utf8'));
 assert.equal(stored.sourceSnapshotAvailable,true);
 assert.equal(stored.rows[0].side,'WAIT');
 assert.equal(stored.realMoneyOrdersAllowed,false);
});
test('source outage still retains non-qualifying artifact and no direct official reads',async t=>{
 const d=temp(t),{event}=fixture('YES');put(d,witness('44405660608',event));
 const dest=path.join(d,'result.json');let n=0;
 const r=await runShadowSettlement({archiveRoot:d,outFile:dest,
  fetchImpl:async()=>{n++;throw Error('Public URL offline')},
  clock:()=>CLOSE+60000});
 assert.equal(n,1);
 assert.equal(r.sourceSnapshotAvailable,false);
 assert.equal(r.state,'SOURCE_JOURNAL_UNAVAILABLE');
 assert.equal(JSON.parse(fs.readFileSync(dest)).independentlyQualifiedCount,0);
});
