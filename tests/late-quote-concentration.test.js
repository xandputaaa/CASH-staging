'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {lateQuoteConcentration}=require('../late-quote-concentration');
const hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const iso='2026-11-23T16:00:00.000Z',close='2026-11-23T16:03:00.000Z';
function research(){
 let previousHash='GENESIS',events=[];
 const add=(type,payload)=>{
  const b={sequence:events.length+1,recordedAt:iso,type,payload,previousHash};
  const e={...b,hash:hash(b)};events.push(e);previousHash=e.hash;
 };
 const mk=(idx,side,ask)=>({marketId:'KXBTC15M-26NOV23160'+idx+'-45',
  model:'KXBTC15M_LATE_CHECKPOINT_SHADOW_V1',at:iso,endTime:close,
  side,indexSourceType:'SINGLE_EXCHANGE_PROXY',
  publicAskAtFreeze:ask===null?null:{YES:ask,NO:ask}});
 add('FORECAST',mk(1,'YES',0.995));
 add('FORECAST',mk(2,'NO',0.92));
 add('FORECAST',mk(3,'YES',0.999));
 add('FORECAST',mk(4,null,null));
 add('OUTCOME',{marketId:mk(1).marketId,winner:'YES'});
 add('OUTCOME',{marketId:mk(2).marketId,winner:'NO'});
 add('OUTCOME',{marketId:mk(3).marketId,winner:'NO'});
 add('OUTCOME',{marketId:mk(4).marketId,winner:'YES'});
 return {version:'CASH_LATE_CHECKPOINT_SHADOW_V1',
  format:'CASH_LATE_CHECKPOINT_UNVERIFIED_HASH_CHAIN_V1',
  records:4,pending:0,events,headHash:previousHash,
  independentQualification:0,independentlyTimeAttested:false,
  realMoneyAuthorized:false,canExecuteOrders:false,calibrated:false,
  scorecard:{overall:{directional:3,waits:1,hits:2,misses:1,scoredDirectional:3}},
  paperEconomics:{directional:3,waits:1,paperWins:2,paperLosses:1,
   negativeNetWins:1,conservativePnlDollars:-0.4}};
}
test('high hit rate on near-dollar public asks remains source-only not profitability',()=>{
 const r=lateQuoteConcentration(research());
 assert.equal(r.state,'SELF_HASHED_RESEARCH_ONLY');
 assert.equal(r.selfReportedHits,2);
 assert.equal(r.selfReportedMisses,1);
 assert.equal(r.medianPublicAskAtOriginalFreezeUSD,0.995);
 assert.equal(r.asksAtLeast95Cents,2);
 assert.equal(r.asksAtLeast99Cents,2);
 assert.equal(r.selfReportedNegativeNetWinners,1);
 assert.equal(r.independentlyQualifiedCount,0);
 assert.equal(r.ordersEnabled,false);
 assert.equal(r.quotesNotExecutable,true);
});
test('missing late export never pretends that analysis ran',()=>{
 const x=lateQuoteConcentration(null);
 assert.equal(x.state,'SOURCE_UNAVAILABLE');
 assert.equal(x.independentlyQualifiedCount,0);
});
test('tampered hashes, forged trading permission, conflicting counts fail closed',()=>{
 const x=research();x.events[1].payload.publicAskAtFreeze.YES=0.01;
 assert.throws(()=>lateQuoteConcentration(x),/checksum/);
 const y=research();y.realMoneyAuthorized=true;
 assert.throws(()=>lateQuoteConcentration(y),/Unsafe/);
 const z=research();z.paperEconomics.paperWins=99;
 assert.throws(()=>lateQuoteConcentration(z),/conflict/);
});
test('no usable public freeze quote is unpriced, not a zero-cost fill',()=>{
 const x=research();x.events[0].payload.publicAskAtFreeze.YES=null;
 // Re-hash the chain in chronological order to represent a legitimate source-only export.
 let prev='GENESIS';
 for(const [i,e] of x.events.entries()){
  e.previousHash=prev;e.sequence=i+1;
  const {hash:_,...body}=e;e.hash=hash(body);prev=e.hash;
 }
 x.headHash=prev;x.paperEconomics.paperWins=2;
 const z=lateQuoteConcentration(x);
 assert.equal(z.publicSpotProxyUnpricedDirectional,1);
 assert.equal(z.publicSpotProxyPricedDirectional,2);
 assert.equal(z.independentlyQualifiedCount,0);
});
