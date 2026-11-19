'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createShadowJournal}=require('../cash-shadow-journal');
const {checkObservedMarkets,validateExchangeCheck,runExchangeObservation}=require('../cash-shadow-exchange-corroboration');
const ASOF=1795038437246,OBS=1795038661399,CLOSE=1795039200000;
const MARKET='KXBTC15M-26NOV181700-00';
function fixture(side='YES'){
 const journal=createShadowJournal();
 const event=journal.append({
  modelId:'CASH_SHADOW_SPOT_MOMENTUM_V1',marketId:MARKET,
  side,reason:'TEST_FROZEN_HYPOTHESIS',strikePrice:65000,
  asOfMs:ASOF,leadSeconds:(CLOSE-ASOF)/1000,
  features:{safeMock:true},calibrated:false,probability:null,
  executionAllowed:false
 },{recordedAtMs:ASOF+1000});
 const observation={
  version:'CASH_SHADOW_GITHUB_PUBLIC_OBSERVATION_V1',
  provenance:'GITHUB_RUNNER_FETCH_AFTER_NETWORK_RESPONSE',
  sourceUrl:'https://cash-simulation-web-staging.up.railway.app/api/model-lab/shadow/export',
  sourceSha256:'a'.repeat(64),githubRunId:'44405660608',
  githubRepository:'xandputaaa/CASH-staging',
  githubCommitSha:'0b93f9d701319b6969c48d90d3ab0c02a21a55e4',
  observedAtRunner:new Date(OBS).toISOString(),
  status:'OBSERVED_PREEXPIRY',
  observedForecasts:[{
   modelId:event.modelId,marketId:event.marketId,side:event.side,
   frozenEventHash:event.hash,observedAtRunnerMs:OBS,
   forecastAsOfMs:event.asOfMs,contractClosesAtMs:event.closesAtMs,
   source:'UNVERIFIED_PUBLIC_SHADOW_JOURNAL',
   independentQualification:false
  }],
  observedBeforeExpiryCount:1,independentlyQualifiedCount:0,
  realMoneyOrdersAllowed:false,
  note:'Only a pre-expiry GH observation of source claims.'
 };
 return {snapshot:journal.exportSnapshot(),observation};
}
const activeMarket=(x={})=>({
 ticker:MARKET,status:'active',result:null,
 close_time:new Date(CLOSE).toISOString(),
 floor_strike:65000,strike_type:'greater_or_equal',
 is_provisional:false,...x
});
function getMarket(market=activeMarket()){
 let requests=0;
 return {
  fetchImpl:async url=>{
   requests++;
   assert.equal(url,'https://external-api.kalshi.com/trade-api/v2/markets/'+MARKET);
   return {ok:true,text:async()=>JSON.stringify({market})};
  },
  calls:()=>requests
 };
}
const opts=(net,at=OBS+1000)=>({fetchImpl:net.fetchImpl,clock:()=>at});
function tmp(t){
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'cash-direct-shadow-exchange-'));
 t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;
}
test('direct public preexpiry Kalshi corroboration checks exact strike, close and rule but never accuracy',async()=>{
 const {snapshot,observation}=fixture('YES'),net=getMarket();
 const a=await checkObservedMarkets(observation,snapshot,opts(net));
 assert.equal(net.calls(),1);
 assert.equal(a.status,'PUBLIC_MARKETS_CHECKED');
 assert.equal(a.marketChecksAttempted,1);
 assert.equal(a.preExpiryPublicExchangeMatches,1);
 assert.equal(a.comparisonRecords[0].state,'MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET');
 assert.equal(a.comparisonRecords[0].publicStrikeCents,6500000);
 assert.equal(a.comparisonRecords[0].rule,'greater_or_equal');
 assert.equal(a.comparisonRecords[0].side,'YES');
 assert.equal(a.independentQualificationCount,0);
 assert.equal(a.publishedKalshiBRTIIndependentlyReplicated,false);
 assert.equal(a.ordersEnabled,false);
 assert.equal(validateExchangeCheck(a,observation),true);
});
test('WAIT is an abstention even when Kalshi public contract fields match',async()=>{
 const {snapshot,observation}=fixture('WAIT'),net=getMarket();
 const a=await checkObservedMarkets(observation,snapshot,opts(net));
 assert.equal(a.preExpiryPublicExchangeMatches,1);
 assert.equal(a.comparisonRecords[0].side,'WAIT');
 assert.equal(a.independentQualificationCount,0);
 assert.equal(a.comparisonRecords[0].independentQualification,false);
});
test('wrong ticker, close, floor strike, rule, status and already finished result are not corroborated',async()=>{
 const {snapshot,observation}=fixture();
 const cases=[
  activeMarket({ticker:'KXBTC15M-WRONG-00'}),
  activeMarket({close_time:new Date(CLOSE+1000).toISOString()}),
  activeMarket({floor_strike:65001}),
  activeMarket({strike_type:'strictly_greater'}),
  activeMarket({status:'settled'}),
  activeMarket({result:'yes'}),
  activeMarket({is_provisional:true})
 ];
 for(const market of cases){
  const net=getMarket(market),a=await checkObservedMarkets(observation,snapshot,opts(net));
  assert.equal(net.calls(),1);
  assert.equal(a.preExpiryPublicExchangeMatches,0);
  assert.notEqual(a.comparisonRecords[0].state,'MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET');
  assert.equal(a.independentQualificationCount,0);
 }
});
test('exchange public GET that finishes after 15s preclose is rejected',async()=>{
 const {snapshot,observation}=fixture(),net=getMarket();
 const a=await checkObservedMarkets(observation,snapshot,opts(net,CLOSE-14000));
 assert.equal(a.comparisonRecords[0].state,'EXCHANGE_READ_TOO_LATE');
 assert.equal(a.preExpiryPublicExchangeMatches,0);
});
test('exchange response before observer source read cannot corroborate an early commitment',async()=>{
 const {snapshot,observation}=fixture(),net=getMarket();
 const a=await checkObservedMarkets(observation,snapshot,opts(net,OBS-1));
 assert.equal(a.comparisonRecords[0].state,'EXCHANGE_NOT_CORROBORATED');
 assert.equal(a.preExpiryPublicExchangeMatches,0);
});
test('unavailable exchange returns explicit uncorroborated state, preserving original witness',async()=>{
 const {snapshot,observation}=fixture();
 const a=await checkObservedMarkets(observation,snapshot,{
  fetchImpl:async()=>{throw Error('Kalshi public endpoint unavailable')},
  clock:()=>OBS+1000
 });
 assert.equal(a.marketChecksAttempted,1);
 assert.equal(a.comparisonRecords[0].state,'EXCHANGE_MARKET_UNAVAILABLE');
 assert.equal(a.preExpiryPublicExchangeMatches,0);
 assert.equal(observation.observedBeforeExpiryCount,1);
});
test('no second source snapshot means no exchange query, not a retroactive source assumption',async()=>{
 const {observation}=fixture();
 const net=getMarket();
 const a=await checkObservedMarkets(observation,null,opts(net));
 assert.equal(net.calls(),0);
 assert.equal(a.status,'SOURCE_JOURNAL_UNAVAILABLE');
 assert.equal(a.comparisonRecords[0].state,'SOURCE_JOURNAL_UNAVAILABLE');
 assert.equal(a.preExpiryPublicExchangeMatches,0);
});
test('tampered/missing frozen journal event cannot be matched to original GH observation',async()=>{
 const {snapshot,observation}=fixture();
 snapshot.events[0].strikePrice=66000;
 await assert.rejects(()=>checkObservedMarkets(observation,snapshot,opts(getMarket())),
   /Shadow hash chain mismatch/);
 const x=fixture('WAIT').snapshot;
 await assert.rejects(()=>checkObservedMarkets(observation,x,opts(getMarket())),
   /Witness commitment missing/);
});
test('provenance or exchange check count tampering is rejected by evidence validator',async()=>{
 const {snapshot,observation}=fixture(),net=getMarket();
 const a=await checkObservedMarkets(observation,snapshot,opts(net));
 for(const mutate of [
  x=>{x.preExpiryPublicExchangeMatches=2},
  x=>{x.comparisonRecords[0].frozenEventHash='0'.repeat(64)},
  x=>{x.comparisonRecords[0].checkedAtRunner=new Date(CLOSE).toISOString()},
  x=>{x.comparisonRecords[0].independentQualification=true},
  x=>{x.ordersEnabled=true}
 ]){
  const fake=JSON.parse(JSON.stringify(a));
  mutate(fake);
  assert.throws(()=>validateExchangeCheck(fake,observation),/Invalid/);
 }
});
test('legacy no-candidate run produces zero checks and no exchange API calls',async()=>{
 const {observation}=fixture();
 observation.status='NO_ELIGIBLE_PREEXPIRY_RECORDS';
 observation.observedBeforeExpiryCount=0;
 observation.observedForecasts=[];
 const net=getMarket();
 const a=await checkObservedMarkets(observation,null,opts(net));
 assert.equal(net.calls(),0);
 assert.equal(a.comparisonRecords.length,0);
 assert.equal(a.marketChecksAttempted,0);
 assert.equal(a.preExpiryPublicExchangeMatches,0);
});
test('runner saves separate exchange artifact and never modifies original forecast witness',async t=>{
 const dir=tmp(t),{snapshot,observation}=fixture();
 const observedPath=path.join(dir,'observation.json');
 const output=path.join(dir,'exchange.json');
 fs.writeFileSync(observedPath,JSON.stringify(observation));
 let source=0,exchange=0;
 const report=await runExchangeObservation({
  observationFile:observedPath,outFile:output,clock:()=>OBS+1000,
  fetchImpl:async url=>{
   if(url.endsWith('/api/model-lab/shadow/export')){
    source++;
    return {ok:true,text:async()=>JSON.stringify(snapshot)};
   }
   if(url.endsWith('/markets/'+MARKET)){
    exchange++;
    return {ok:true,text:async()=>JSON.stringify({market:activeMarket()})};
   }
   throw Error('Unexpected network call');
  }
 });
 assert.equal(source,1);
 assert.equal(exchange,1);
 assert.equal(report.preExpiryPublicExchangeMatches,1);
 assert.equal(JSON.parse(fs.readFileSync(output,'utf8')).independentQualificationCount,0);
 assert.equal(JSON.parse(fs.readFileSync(observedPath,'utf8')).observedBeforeExpiryCount,1);
});
test('runner keeps source journal outage transparent and does not invoke Kalshi',async t=>{
 const dir=tmp(t),{observation}=fixture();
 const observedPath=path.join(dir,'observation.json');
 const output=path.join(dir,'exchange.json');
 fs.writeFileSync(observedPath,JSON.stringify(observation));
 let n=0;
 const result=await runExchangeObservation({
  observationFile:observedPath,outFile:output,clock:()=>OBS+1000,
  fetchImpl:async()=>{n++;throw Error('Source unavailable')}
 });
 assert.equal(n,1);
 assert.equal(result.status,'SOURCE_JOURNAL_UNAVAILABLE');
 assert.equal(result.preExpiryPublicExchangeMatches,0);
 assert.equal(result.independentQualificationCount,0);
 assert.equal(fs.existsSync(output),true);
});
