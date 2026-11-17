'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {NAME,evaluateEarlyMove,createEarlyMoveMonitor}=require('../early-move');
const t=Date.parse('2026-11-17T03:10:00Z'),iso=x=>new Date(x).toISOString();
const market='KXBTC15M-26NOV170310-30';
function fixture({at=t,direction=1,length=26}={}){
 const history=Array.from({length},(_,i)=>({
  time:iso(at-(length-1-i)*5000),
  price:64000+direction*(i-(length-1))*6,source:'Kraken BTC/USD'
 }));
 const quote={venue:'Kalshi',marketId:market,status:'live',refreshFailed:false,
  fetchedAt:iso(at-1000),endTime:iso(at+360000),yesAsk:.62,noAsk:.39};
 const spot={status:'live',source:'Kraken BTC/USD',history,
  price:history.at(-1).price,fetchedAt:history.at(-1).time,ageMs:0};
 return {quote,spot,now:at};
}
test('45s up and down predictions use only a continuous past price window',()=>{
 for(const [direction,side] of [[1,'UP'],[-1,'DOWN']]){
  const a=fixture({direction}),r=evaluateEarlyMove(a);
  assert.equal(r.model,NAME);
  assert.equal(r.state,'PROVISIONAL_DIRECTION');
  assert.equal(r.side,side);
  assert.equal(r.spotPrice,64000);
  assert.equal(r.forecastPrice>r.spotPrice,side==='UP');
  assert.equal(r.dueAt,iso(t+45000));
  assert.match(r.windowHash,/^[0-9a-f]{64}$/);
  assert.equal(r.validation,'UNVALIDATED_SHORT_HORIZON_PROXY');
  assert.equal(r.calibratedProbability,null);
  assert.equal(r.expectedValue,null);
  assert.equal(r.realMoneyAuthorized,false);
 }
});
test('Kalshi YES/NO quote prices cannot flip the spot trend prediction',()=>{
 const a=fixture(),r=evaluateEarlyMove(a);
 a.quote.yesAsk=.09;a.quote.noAsk=.94;
 const b=evaluateEarlyMove(a);
 assert.equal(r.side,b.side);
 assert.equal(r.inputHash,b.inputHash);
});
test('insufficient history, stale quote, changed source, future timestamps and inactive rounds abstain',()=>{
 const patches=[
  a=>a.spot.history=a.spot.history.slice(-7),
  a=>a.quote.fetchedAt=iso(t-55000),
  a=>a.quote.marketId='KXETH15M-MOCK',
  a=>a.quote.endTime=iso(t+35000),
  a=>a.spot.history[10].source='Coinbase Exchange BTC-USD',
  a=>a.spot.history[10].price=NaN,
  a=>a.spot.fetchedAt=iso(t-25000)
 ];
 for(const patch of patches){
  const a=fixture();patch(a);const r=evaluateEarlyMove(a);
  assert.equal(r.side,null);
  assert.equal(r.state,'WAIT');
  assert.equal(r.realMoneyAuthorized,false);
 }
});
test('neutral or conflicting momentum returns WAIT and no speculative numeric future price',()=>{
 const a=fixture();
 a.spot.history=a.spot.history.map(x=>({...x,price:64000}));
 a.spot.price=64000;
 const result=evaluateEarlyMove(a);
 assert.equal(result.reason,'MOMENTUM_WEAK_OR_CONFLICTING');
 assert.equal(result.side,null);
 assert.equal(result.forecastPrice,null);
});
function harness(){
 let now=t,values=fixture();
 const quotes={view:()=>values.quote};
 const spot={view:()=>values.spot,update:async()=>values.spot};
 const m=createEarlyMoveMonitor({quotes,spot,clock:()=>now});
 return {m,setNow:x=>{now=x},get:()=>values};
}
test('model freezes one UP call and scores only AFTER later future observations appear',async()=>{
 const h=harness();
 await h.m.scan();let s=h.m.snapshot();
 assert.equal(s.frozen,1);
 assert.equal(s.active.side,'UP');
 assert.equal(s.scored,0);
 assert.equal(s.independentValidation,0);
 assert.equal(s.modelCalibrated,false);
 assert.equal(s.tradingAuthorized,false);
 await h.m.scan();
 assert.equal(h.m.snapshot().frozen,1);
 h.setNow(t+40000);await h.m.scan();assert.equal(h.m.snapshot().scored,0);
 const f=h.get();
 for(let k=1;k<=9;k++)
  f.spot.history.push({time:iso(t+k*5000),price:64000+k*6,
   source:'Kraken BTC/USD'});
 f.spot.price=f.spot.history.at(-1).price;
 f.spot.fetchedAt=f.spot.history.at(-1).time;
 h.setNow(t+45000);await h.m.scan();
 s=h.m.snapshot();
 assert.equal(s.scored,1);assert.equal(s.hits,1);assert.equal(s.hitRate,1);
 assert.equal(s.active,null);
 assert.equal(s.latest.status,'HIT');
 assert.equal(s.latest.observedAt,iso(t+45000));
 assert.equal(s.automaticOrdersEnabled,false);
 assert.equal(s.persistence,'VOLATILE_SERVER_SESSION');
});
test('opposite future price movement is graded as a MISS rather than retrospectively flipping call',async()=>{
 const h=harness();await h.m.scan();
 const f=h.get();
 for(let k=1;k<=9;k++)
  f.spot.history.push({time:iso(t+k*5000),price:64000-k*8,
    source:'Kraken BTC/USD'});
 f.spot.price=f.spot.history.at(-1).price;f.spot.fetchedAt=f.spot.history.at(-1).time;
 h.setNow(t+45000);await h.m.scan();
 const s=h.m.snapshot();
 assert.equal(s.misses,1);assert.equal(s.hits,0);
 assert.equal(s.latest.side,'UP');
 assert.equal(s.latest.observedDirection,'DOWN');
 assert.equal(s.latest.status,'MISS');
});
test('if no future source record arrives, never fabricate the scored result',async()=>{
 const h=harness();await h.m.scan();
 h.setNow(t+61000);await h.m.scan();
 const v=h.m.snapshot();
 assert.equal(v.unobserved,1);
 assert.equal(v.scored,0);
 assert.equal(v.hitRate,null);
 assert.equal(v.latest.status,'UNOBSERVED');
});
