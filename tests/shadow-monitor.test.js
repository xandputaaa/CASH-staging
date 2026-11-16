'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createShadowMonitor,chooseMarketBaseline}=require('../shadow-monitor');
function fixture(t,venue='Kalshi'){
 const common={venue,status:'live',marketId:venue==='Kalshi'?'KXBTC15M-26NOV161000-00':'0x'+'a'.repeat(64),
  endTime:new Date(t+180000).toISOString(),fetchedAt:new Date(t).toISOString()};
 return venue==='Kalshi'?{...common,yesAsk:0.62,noAsk:0.41}:
  {...common,slug:'btc-updown-5m-'+Math.floor(t/300000)*300,upAsk:0.59,downAsk:0.43};
}
function confirmed(info,now,winner){
 const kal=info.venue==='Kalshi',evidence=kal?
  {venue:'Kalshi',ticker:info.marketId,status:'settled',result:({YES:'yes',NO:'no',VOID:'void'})[winner],is_provisional:false}:
  {venue:'Polymarket',slug:info.slug,conditionId:info.marketId,closed:true,
   resolutionStatus:'resolved',outcomes:['Up','Down'],outcomePrices:winner==='UP'?['1','0']:['0','1']};
 return {...info,status:'verified',winner,source:kal?'Kalshi public market result':'Polymarket Gamma final market result',
  checkedAt:new Date(now).toISOString(),confirmationCount:2,
  firstObservedAt:new Date(now-21000).toISOString(),
  evidenceSnapshot:evidence,
  evidenceSha256:crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex'),
  evidenceSourceUrl:kal?'https://external-api.kalshi.com/trade-api/v2/markets/'+info.marketId:
   'https://gamma-api.polymarket.com/events?slug='+info.slug};
}
function deps(now){
 let current=now,kal=fixture(now),poly=fixture(now,'Polymarket'),winner=null,calls=0;
 const quotes={query:async venue=>venue==='Kalshi'?kal:poly};
 const results={lookup:async info=>{calls++;return winner?confirmed(info,current,winner):{...info,status:'pending',checkedAt:new Date(current).toISOString()}}};
 const monitor=createShadowMonitor({quotes,results,clock:()=>current});
 return {monitor,clock:v=>{current=v},setWinner:v=>{winner=v},count:()=>calls,setKal:v=>{kal=v},setPoly:v=>{poly=v}};
}
test('market baseline uses higher public ask and labels non-independent methodology',()=>{
 const t=Date.now(),k=chooseMarketBaseline(fixture(t)),p=chooseMarketBaseline(fixture(t,'Polymarket'));
 assert.equal(k.side,'YES');assert.equal(p.side,'UP');
 assert.ok(k.normalizedMarketShare>0.5&&k.normalizedMarketShare<1);
 assert.equal(chooseMarketBaseline({...fixture(t),noAsk:null}),null);
 assert.equal(chooseMarketBaseline({...fixture(t),yesAsk:.5,noAsk:.5}),null);
});
test('live watcher freezes both market observations before expiry without duplicating them',async()=>{
 const d=deps(Date.now());
 const one=await d.monitor.scan(),two=await d.monitor.scan(),snap=d.monitor.snapshot();
 assert.equal(one.captured,2);assert.equal(two.captured,0);
 assert.equal(snap.observed,2);assert.equal(snap.pending,2);assert.equal(snap.settled,0);
 assert.equal(snap.qualifyingProspectiveContracts,0);
 assert.equal(snap.independentForecastModel,false);
 assert.equal(snap.storageMode,'VOLATILE_SERVER_SESSION');
 assert.ok(snap.recent.every(x=>x.leadMs>=60000&&x.baselineName==='PUBLIC_MARKET_FAVORED_ASK_V1'));
});
test('server capture excludes stale, expired and incomplete quote snapshots',async()=>{
 const now=Date.now(),d=deps(now);
 d.setKal({...fixture(now),fetchedAt:new Date(now-25000).toISOString()});
 d.setPoly({...fixture(now,'Polymarket'),endTime:new Date(now+10000).toISOString()});
 await d.monitor.scan();
 assert.equal(d.monitor.snapshot().observed,0);
});
test('only final official results resolve prospective session baselines',async()=>{
 const t=Date.now(),d=deps(t);await d.monitor.scan();
 d.clock(t+190000);await d.monitor.scan();
 assert.equal(d.monitor.snapshot().pending,2);
 d.setWinner('YES');await d.monitor.scan();
 let snap=d.monitor.snapshot();
 assert.equal(snap.settled,1);assert.equal(snap.pending,1);assert.equal(snap.correct,1);
 assert.equal(snap.baselineDirectionalAccuracy,1);
 assert.equal(snap.qualifyingProspectiveContracts,0);
 d.setWinner('UP');await d.monitor.scan();
 snap=d.monitor.snapshot();assert.equal(snap.settled,2);assert.equal(snap.pending,0);
});
test('incompatible winners, void outcomes, and correct/incorrect scoring stay separate',async()=>{
 const t=Date.now(),d=deps(t);await d.monitor.scan();d.clock(t+190000);d.setWinner('NO');
 await d.monitor.scan();const snap=d.monitor.snapshot();
 assert.equal(snap.incorrect,1);assert.equal(snap.pending,1);assert.equal(snap.baselineDirectionalAccuracy,0);
});
test('exported event chain detects a modified capture field but cannot prove wall-clock truth',async()=>{
 const d=deps(Date.now());await d.monitor.scan();
 const out=d.monitor.exportSession();
 assert.equal(out.events.length,2);assert.equal(out.checksumChainWarning.includes('do not prove'),true);
 let prev='GENESIS';
 for(const ev of out.events){
  assert.equal(ev.previousHash,prev);
  const {hash,...body}=ev;
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex'),hash);
  prev=hash;
 }
 assert.equal(prev,out.headHash);
 const altered={...out.events[0],payload:{...out.events[0].payload,baselineSide:'NO'}};
 const {hash,...body}=altered;
 assert.notEqual(crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex'),hash);
});
test('read-only shadow watcher caps observations and cannot imply volume persistence',async()=>{
 const t=Date.now(),d=deps(t),quota=createShadowMonitor({quotes:{query:async venue=>fixture(t,venue)},results:{lookup:async()=>({status:'pending'})},clock:()=>t,maxRecords:1,maxEvents:3});
 await quota.scan();assert.equal(quota.snapshot().observed,1);
 assert.equal(quota.snapshot().recordedEvents,1);
 assert.equal(quota.snapshot().qualifyingForModelAccuracy,false);
});

test('official result polling rotates fairly so an unresolved oldest three cannot block a newer market',async()=>{
 const t=Date.now();let now=t;const seen=[];
 const monitor=createShadowMonitor({
  clock:()=>now,quotes:{query:async()=>null},
  results:{lookup:async req=>{
   seen.push(req.marketId);
   return req.marketId.endsWith('MARKET4')?confirmed(req,now,'YES'):
    {...req,status:'pending',reason:'Official result not finalized',checkedAt:new Date(now).toISOString()};
  }}
 });
 for(let i=1;i<=4;i++){
  const quote={...fixture(t),marketId:'KXBTC15M-MARKET'+i,
   endTime:new Date(t+120000).toISOString()};
  assert.equal(monitor.capture(quote)?.status,'PENDING');
 }
 now=t+130000;
 const first=await monitor.resolvePending();
 assert.equal(first.checked,3);assert.equal(first.changed,0);
 assert.equal(seen.includes('KXBTC15M-MARKET4'),false);
 const second=await monitor.resolvePending();
 assert.equal(second.checked,3);assert.equal(second.changed,1);
 assert.equal(seen.includes('KXBTC15M-MARKET4'),true);
 const snap=monitor.snapshot();
 assert.equal(snap.settled,1);assert.equal(snap.pending,3);
 assert.equal(snap.totalSettlementChecks,6);
 const fourth=snap.recent.find(x=>x.marketId.endsWith('MARKET4'));
 assert.equal(fourth.status,'CORRECT');
 assert.equal(fourth.settlementAttempts,1);
 const other=snap.recent.find(x=>x.marketId.endsWith('MARKET1'));
 assert.match(other.pendingReason,/not finalized/);
 assert.ok(Number.isFinite(Date.parse(other.lastCheckAt)));
});
test('pending audit diagnostics do not turn an unknown outcome into a success',async()=>{
 const t=Date.now();let now=t;
 const monitor=createShadowMonitor({clock:()=>now,quotes:{query:async()=>null},
  results:{lookup:async req=>({...req,status:'pending',reason:'Oracle still disputed'})}});
 assert.ok(monitor.capture({...fixture(t),endTime:new Date(t+61000).toISOString()}));
 now=t+70000;
 await monitor.resolvePending();
 const snap=monitor.snapshot();
 assert.equal(snap.pending,1);assert.equal(snap.correct,0);assert.equal(snap.settled,0);
 assert.equal(snap.totalSettlementChecks,1);
 assert.equal(snap.recent[0].pendingReason,'Oracle still disputed');
 assert.equal(snap.qualifyingProspectiveContracts,0);
});

test('unproven or contradictory adapter results never score a shadow observation',async()=>{
 const t=Date.now();let now=t,mode='bare';
 const monitor=createShadowMonitor({clock:()=>now,
  quotes:{query:async venue=>venue==='Kalshi'?fixture(t):null},
  results:{lookup:async info=>{
   if(mode==='bare')return {...info,status:'verified',winner:'YES',source:'claimed official',checkedAt:new Date(now).toISOString()};
   const checked=confirmed(info,now,'YES');
   if(mode==='contradiction'){
    checked.evidenceSnapshot.result='no';
    checked.evidenceSha256=crypto.createHash('sha256').update(JSON.stringify(checked.evidenceSnapshot)).digest('hex');
   }
   return checked;
  }}});
 await monitor.scan();now=t+200000;
 await monitor.resolvePending();
 assert.equal(monitor.snapshot().settled,0);
 mode='contradiction';await monitor.resolvePending();
 assert.equal(monitor.snapshot().settled,0);
 mode='valid';await monitor.resolvePending();
 assert.equal(monitor.snapshot().settled,1);
 assert.equal(monitor.snapshot().recent[0].outcomeEvidence.confirmationCount,2);
});

test('runtime rejects malformed contract identities before shadow capture',()=>{
 const t=Date.now();
 const monitor=createShadowMonitor({clock:()=>t,
  quotes:{query:async()=>null},results:{lookup:async()=>({status:'pending'})}});
 assert.equal(monitor.capture({...fixture(t),marketId:'other-btc-market'}),null);
 assert.equal(monitor.capture({...fixture(t,'Polymarket'),marketId:'0xabc'}),null);
 assert.equal(monitor.snapshot().recordedEvents,0);
});
test('replay rejects rehashed internally contradictory capture evidence',async()=>{
 const t=Date.now(),monitor=createShadowMonitor({clock:()=>t,
  quotes:{query:async venue=>fixture(t,venue)},results:{lookup:async()=>({status:'pending'})}});
 await monitor.scan();
 const initial=monitor.exportSession().events;
 function replayWith(mutator){
  const events=initial.map(e=>({...e,payload:{...e.payload}}));
  mutator(events[0].payload);
  let previous='GENESIS';
  for(const event of events){
   event.previousHash=previous;
   const {hash,...body}=event;
   event.hash=crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
   previous=event.hash;
  }
  return ()=>createShadowMonitor({clock:()=>t,quotes:{query:async()=>null},
   results:{lookup:async()=>({status:'pending'})},journal:{events,append(){}}});
 }
 assert.throws(replayWith(x=>{x.leadMs+=10000}),/Saved capture is semantically invalid/);
 assert.throws(replayWith(x=>{x.baselineSide='NO'}),/Saved capture is semantically invalid/);
 assert.throws(replayWith(x=>{x.normalizedMarketShare=0.97}),/Saved capture is semantically invalid/);
 assert.throws(replayWith(x=>{x.quoteFetchedAt=new Date(t-60000).toISOString()}),/Saved capture is semantically invalid/);
});
test('early-dated official confirmation cannot settle a shadow observation',async()=>{
 const t=Date.now();let now=t;
 const monitor=createShadowMonitor({clock:()=>now,
  quotes:{query:async venue=>venue==='Kalshi'?fixture(t):null},
  results:{lookup:async info=>{
   const claimed=confirmed(info,t+200000,'YES');
   claimed.checkedAt=new Date(t+100000).toISOString();
   claimed.firstObservedAt=new Date(t+79000).toISOString();
   return claimed;
  }}});
 await monitor.scan();now=t+210000;await monitor.resolvePending();
 assert.equal(monitor.snapshot().pending,1);
 assert.equal(monitor.snapshot().settled,0);
 assert.match(monitor.snapshot().recent[0].pendingReason,/Unrecognized or contradictory/);
});
