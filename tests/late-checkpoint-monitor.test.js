'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createLateCheckpointMonitor,NAME,MIN_LEAD_MS,MAX_LEAD_MS}=require('../late-checkpoint-monitor');
const now=Date.parse('2026-11-17T16:00:00Z'),iso=x=>new Date(x).toISOString();
const market='KXBTC15M-26NOV170915-15';
function fixture(time=now,delta=500){
 const history=Array.from({length:25},(_,i)=>({
  time:iso(time-(24-i)*15000),price:85000+delta+(i-24),source:'Kraken BTC/USD'
 }));
 return {quote:{
   venue:'Kalshi',marketId:market,status:'live',refreshFailed:false,
   fetchedAt:iso(time),endTime:iso(now+180000),openTime:iso(time-500000),
   targetPrice:85000,targetSource:'KALSHI_FLOOR_STRIKE',strikeType:'greater_or_equal',
   tieGoesToYes:true,contractRuleStatus:'BRTI_60S_RULE_TEXT_PRESENT',
   yesAsk:.55,noAsk:.46
 },spot:{status:'live',source:'Kraken BTC/USD',price:history.at(-1).price,
   fetchedAt:iso(time),history}};
}
function verified(time,winner='YES'){
 const raw={venue:'Kalshi',ticker:market,status:'settled',result:winner.toLowerCase(),
  floor_strike:85000,expiration_value:winner==='YES'?85200:84800,
  strike_type:'greater_or_equal',is_provisional:false};
 return {status:'verified',winner,checkedAt:iso(time),
  firstObservedAt:iso(time-24000),confirmationCount:2,
  evidenceSnapshot:raw,
  evidenceSha256:crypto.createHash('sha256').update(JSON.stringify(raw)).digest('hex'),
  evidenceSourceUrl:'https://external-api.kalshi.com/trade-api/v2/markets/'+market};
}
function harness({delta=500,brti=null}={}){
 let time=now,values=fixture(time,delta),result={status:'pending'},checkCalls=0;
 const m=createLateCheckpointMonitor({
  quotes:{query:async()=>values.quote},spot:{update:async()=>values.spot},
  results:{lookup:async()=>{checkCalls++;return result}},
  brti,clock:()=>time
 });
 return {m,setTime:x=>{time=x},setValues:x=>{values=x},
  setResult:x=>{result=x},checks:()=>checkCalls};
}
test('late checkpoint freezes only once 150–210 seconds before contract close, independent of odds',async()=>{
 assert.equal(MIN_LEAD_MS,150000);assert.equal(MAX_LEAD_MS,210000);
 const h=harness();
 await h.m.scan();
 const v=h.m.snapshot();
 assert.equal(v.model,NAME);assert.equal(v.records,1);
 assert.equal(v.latest.side,'YES');
 assert.equal(v.latest.status,'PENDING');
 assert.equal(v.scorecard.overall.directional,1);
 assert.equal(v.scorecard.overall.scoredDirectional,0);
 assert.equal(v.independentQualification,0);
 assert.equal(v.canExecuteOrders,false);
 const originalHash=v.headHash;
 const changed=fixture(now,-1500);
 changed.quote.yesAsk=.94;changed.quote.noAsk=.07;
 h.setValues(changed);
 await h.m.scan();
 assert.equal(h.m.snapshot().headHash,originalHash);
 assert.equal(h.m.snapshot().latest.side,'YES');
 assert.equal(h.m.exportSession().events.filter(x=>x.type==='FORECAST').length,1);
});
test('pre-specified late-window timing; do not replay near-expiry data into an older call',async()=>{
 const h=harness(),tooEarly=fixture(now-60000,500);
 h.setTime(now-60000);h.setValues(tooEarly);
 await h.m.scan();
 assert.equal(h.m.snapshot().records,0);
 assert.equal(h.m.snapshot().lastReason,'BEFORE_LATE_CHECKPOINT');
 const tooLate=fixture(now+35000,500);
 h.setTime(now+35000);h.setValues(tooLate);
 await h.m.scan();
 assert.equal(h.m.snapshot().records,0);
 assert.equal(h.m.snapshot().lastReason,'LATE_CHECKPOINT_MISSED');
 assert.equal(h.m.snapshot().windowMissedMarketIds,1);
});
test('WAIT decision is frozen and counted in denominator, not as a missed trade',async()=>{
 const h=harness({delta:1});
 await h.m.scan();
 const r=h.m.snapshot();
 assert.equal(r.latest.side,null);
 assert.equal(r.scorecard.overall.waits,1);
 assert.equal(r.scorecard.overall.directional,0);
 assert.equal(r.scorecard.overall.exploratoryDirectionalHitRate,null);
 assert.equal(r.independentQualification,0);
});
test('valid two-read verified public result scores frozen directional decision only after expiry',async()=>{
 const h=harness();
 await h.m.scan();
 h.setTime(now+210000);
 await h.m.scan();
 assert.equal(h.m.snapshot().pending,1);
 h.setResult(verified(now+240000));
 h.setTime(now+240000);
 await h.m.scan();
 const r=h.m.snapshot();
 assert.equal(r.pending,0);
 assert.equal(r.scorecard.overall.scoredDirectional,1);
 assert.equal(r.scorecard.overall.hits,1);
 assert.equal(r.scorecard.overall.misses,0);
 assert.equal(r.scorecard.overall.independentValidationCount,0);
 assert.equal(h.m.exportSession().events.length,2);
 assert.equal(h.m.snapshot().independentlyTimeAttested,false);
});
test('unverified or contradictory public results never score or invent settlement',async()=>{
 const h=harness();
 await h.m.scan();
 h.setTime(now+240000);
 h.setResult({status:'pending',reason:'Official market not settled'});
 await h.m.scan();
 assert.equal(h.m.snapshot().pending,1);
 assert.equal(h.m.snapshot().scorecard.overall.scoredDirectional,0);
 const bad=verified(now+240000);
 bad.evidenceSnapshot.expiration_value=82000;
 bad.evidenceSha256=crypto.createHash('sha256').update(JSON.stringify(bad.evidenceSnapshot)).digest('hex');
 h.setResult(bad);
 await h.m.scan();
 assert.equal(h.m.snapshot().pending,1);
 assert.equal(h.m.snapshot().latest.outcomeReason,'OFFICIAL_EVIDENCE_REJECTED');
});
test('BRTI research opt-in fails closed if official data is missing rather than silently using proxy',async()=>{
 const h=harness({brti:{forecastingEnabled:()=>true,internal:()=>null}});
 await h.m.scan();
 assert.equal(h.m.snapshot().records,0);
 assert.equal(h.m.snapshot().lastReason,'PRECHECK_SPOT_PROXY_UNAVAILABLE');
 assert.equal(h.m.snapshot().scorecard.bySource.publicSpotProxy.captured,0);
});
test('licensed index price and samples never appear in public late snapshot or export',async()=>{
 const privateValue=94751.32;
 const h=harness({brti:{forecastingEnabled:()=>true,internal:()=>{
  const x=fixture(now,privateValue-85000).spot,source='CF Benchmarks BRTI via Kalshi read-only';
  return {...x,source,history:x.history.map(p=>({...p,source}))};
 }}});
 await h.m.scan();
 assert.equal(h.m.snapshot().latest.sourceType,'OFFICIAL_BRTI_LIVE');
 assert.equal(h.m.snapshot().scorecard.bySource.officialBrtiLive.captured,1);
 const text=JSON.stringify(h.m.exportSession());
 assert.doesNotMatch(text,/94751\.32/);
 assert.doesNotMatch(text,/"sampleWindow":/);
 assert.doesNotMatch(text,/"spotPrice":/);
 assert.match(text,/CASH_LATE_CHECKPOINT_UNVERIFIED_HASH_CHAIN_V1/);
 assert.equal(h.m.snapshot().realMoneyAuthorized,false);
});
