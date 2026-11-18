'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createShadowLiveFeed}=require('../cash-shadow-live-feed');
const {verifyShadowJournal}=require('../cash-shadow-journal');
const {observeShadowSnapshot}=require('../cash-shadow-observer');
const {runPublicShadowObserver}=require('../cash-shadow-public-observer-runner');
const now=2000000,close=now+300000,market='KXBTC15M-SHADOW-TEST123';
function fixtures(){
 const quote={venue:'Kalshi',marketId:market,status:'live',refreshFailed:false,
  targetSource:'KALSHI_FLOOR_STRIKE',targetPrice:39900,
  strikeType:'greater_or_equal',tieGoesToYes:true,
  contractRuleStatus:'BRTI_60S_RULE_TEXT_PRESENT',
  fetchedAt:new Date(now).toISOString(),endTime:new Date(close).toISOString()};
 const history=Array.from({length:14},(_,i)=>({
  time:new Date(now-195000+i*15000).toISOString(),
  price:40000+i*4,source:'Kraken BTC/USD'
 }));
 const spot={status:'live',source:'Kraken BTC/USD',
  fetchedAt:new Date(now).toISOString(),history};
 return {quote,spot};
}
function feeds(quote,spot){
 return {quotes:{query:async()=>quote},spot:{update:async()=>spot},clock:()=>now};
}
test('shadow live feed never collects without explicit durable volume',async()=>{
 const {quote,spot}=fixtures();
 const service=createShadowLiveFeed({...feeds(quote,spot),directory:null});
 assert.equal(service.enabled,false);
 assert.equal(service.exportSnapshot(),null);
 assert.equal((await service.scan()).records,undefined);
});
test('live public shadow is persisted before export and restored without rewrite',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-shadow-live-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const {quote,spot}=fixtures();
 const service=createShadowLiveFeed({...feeds(quote,spot),directory:dir});
 const r=await service.scan();
 assert.equal(r.status,'FROZEN_AND_PERSISTED');
 const snapshot=service.exportSnapshot();
 assert.equal(snapshot.records,1);
 assert.equal(verifyShadowJournal(snapshot),true);
 assert.equal(snapshot.events[0].modelId,'CASH_SHADOW_SPOT_MOMENTUM_V1');
 assert.equal(snapshot.realMoneyOrdersAllowed,false);
 assert.equal(snapshot.independentQualificationCount,0);
 assert.equal(observeShadowSnapshot(snapshot,{observedAtMs:now+10000}).observedBeforeExpiryCount,1);
 const stored=fs.readFileSync(path.join(dir,'cash-shadow-model-lab.json'),'utf8');
 const again=createShadowLiveFeed({...feeds(quote,spot),directory:dir});
 assert.equal(again.exportSnapshot().headHash,snapshot.headHash);
 assert.equal((await again.scan()).status,'ALREADY_FROZEN');
 assert.equal(fs.readFileSync(path.join(dir,'cash-shadow-model-lab.json'),'utf8'),stored);
});
test('modified persisted shadow data cannot be silently reset',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-shadow-tamper-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const filename=path.join(dir,'cash-shadow-model-lab.json');
 fs.writeFileSync(filename,JSON.stringify({events:[],version:'FAKE'}));
 const {quote,spot}=fixtures();
 assert.throws(()=>createShadowLiveFeed({...feeds(quote,spot),directory:dir}),
  /journal envelope|Invalid/);
});
test('unverified Kalshi contract metadata never freezes a shadow call',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-shadow-unsafe-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const {quote,spot}=fixtures();
 const service=createShadowLiveFeed({...feeds({...quote,contractRuleStatus:'RULE_TEXT_NOT_CONFIRMED'},spot),directory:dir});
 assert.equal((await service.scan()).records,0);
});
test('public observer captures post-fetch runner time and never qualifies results',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-shadow-observer-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const {quote,spot}=fixtures();
 const service=createShadowLiveFeed({...feeds(quote,spot),directory:dir});
 await service.scan();
 const snapshot=service.exportSnapshot();
 const fetchImpl=async()=>({ok:true,text:async()=>JSON.stringify(snapshot)});
 const r=await runPublicShadowObserver({fetchImpl,clock:()=>now+10000,
  outDirectory:path.join(dir,'witness'),env:{GITHUB_RUN_ID:'123456789'}});
 assert.equal(r.status,'OBSERVED_PREEXPIRY');
 assert.equal(r.observedBeforeExpiryCount,1);
 assert.equal(r.observedAtRunner,new Date(now+10000).toISOString());
 assert.equal(r.independentlyQualifiedCount,0);
 assert.equal(r.realMoneyOrdersAllowed,false);
});
test('public observer does not invent evidence during endpoint outage',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-shadow-down-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const r=await runPublicShadowObserver({fetchImpl:async()=>({ok:false,status:503}),
  clock:()=>now,outDirectory:dir});
 assert.equal(r.status,'PUBLIC_SOURCE_UNAVAILABLE_OR_INVALID');
 assert.equal(r.observedBeforeExpiryCount,0);
 assert.equal(r.independentlyQualifiedCount,0);
 assert.ok(fs.existsSync(path.join(dir,'shadow-public-observation.json')));
});
