'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createKalshiFeeFeed,takerPreview,validFee}=require('../kalshi-fees');
const t=Date.parse('2026-11-16T22:30:00Z');
test('public series fee response must match the exact BTC 15m ticker and known fee type',()=>{
 assert.deepEqual(validFee({series:{ticker:'KXBTC15M',fee_type:'quadratic',fee_multiplier:1}}),
  {type:'quadratic',multiplier:1});
 assert.equal(validFee({series:{ticker:'KXETH15M',fee_type:'quadratic',fee_multiplier:1}}),null);
 assert.equal(validFee({series:{ticker:'KXBTC15M',fee_type:'flat',fee_multiplier:1}}),null);
 assert.equal(validFee({series:{ticker:'KXBTC15M',fee_type:'quadratic',fee_multiplier:null}}),null);
});
test('illustrative taker fees are based on Kalshi quadratic function and centicent rounding',()=>{
 const m=takerPreview(0.5,1);
 assert.equal(m.fee,0.0175);
 assert.equal(m.hypotheticalCost,0.5175);
 assert.equal(m.estimatedAfterFeeBreakEven,0.5175);
 const n=takerPreview(0.9,1);
 assert.equal(n.fee,0.0063);
 assert.equal(takerPreview(0.5,0).fee,0);
 assert.equal(takerPreview(0,1),null);
 assert.equal(takerPreview(0.5,1,0),null);
});
test('read-only Kalshi series fee metadata is cached and expires or fails closed',async()=>{
 let now=t,calls=0,fail=false;
 const feed=createKalshiFeeFeed({clock:()=>now,fetchImpl:async(url,init)=>{
  calls++;assert.match(url,/\/series\/KXBTC15M$/);assert.equal(init.method,undefined);
  if(fail)throw Error('offline');
  return {ok:true,json:async()=>({series:{ticker:'KXBTC15M',fee_type:'quadratic',fee_multiplier:1}})};
 }});
 let x=await feed.query();assert.equal(x.state,'SERIES_METADATA_LIVE');
 assert.equal(x.eventOverridesVerified,false);assert.equal(x.feeMultiplier,1);
 await feed.query();assert.equal(calls,1);
 now+=300001;assert.equal(feed.view().state,'STALE');
 fail=true;
 x=await feed.query();
 assert.equal(x.state,'STALE');assert.equal(x.feeType,null);
 assert.equal(x.feeMultiplier,null);assert.equal(x.feesExecutable,false);
});
test('unknown fee response can never silently claim validated terms',async()=>{
 const f=createKalshiFeeFeed({clock:()=>t,fetchImpl:async()=>({
  ok:true,json:async()=>({series:{ticker:'KXBTC15M',fee_type:'flat',fee_multiplier:1}})
 })});
 const x=await f.query();
 assert.equal(x.state,'UNAVAILABLE');assert.equal(x.feeMultiplier,null);
});
