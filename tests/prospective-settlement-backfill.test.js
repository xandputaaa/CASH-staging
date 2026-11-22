'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createProspectiveMonitor}=require('../prospective-monitor');
const iso=t=>new Date(t).toISOString();
const T=Date.parse('2026-11-16T23:20:00Z');
function fixture(){
 let now=T,quoteIndex=0,lookups=[],active=0,maxActive=0,throwMarket=null;
 const history=Array.from({length:25},(_,i)=>({
  time:iso(T-(24-i)*15000),price:85500+i,source:'Kraken BTC/USD'
 }));
 const quote=()=>({
  venue:'Kalshi',marketId:'KXBTC15M-26NOV161630-'+String(30+quoteIndex),
  endTime:iso(T+180000),openTime:iso(T-700000),
  fetchedAt:iso(T),status:'live',refreshFailed:false,
  targetPrice:85000,targetSource:'KALSHI_FLOOR_STRIKE',
  strikeType:'greater_or_equal',tieGoesToYes:true,
  contractRuleStatus:'BRTI_60S_RULE_TEXT_PRESENT',
  yesAsk:.55,noAsk:.46
 });
 const monitor=createProspectiveMonitor({
  clock:()=>now,settlementReadsPerScan:8,
  quotes:{query:async()=>quote()},
  spot:{update:async()=>({status:'live',price:history.at(-1).price,
    source:'Kraken BTC/USD',fetchedAt:iso(T),history})},
  results:{lookup:async ({marketId})=>{
   lookups.push(marketId);active++;maxActive=Math.max(maxActive,active);
   // Deliberately permit overlapping requests to test the concurrency bound.
   await new Promise(resolve=>setImmediate(resolve));
   active--;
   if(marketId===throwMarket)throw Error('secret bearer=DO_NOT_LOG');
   return {status:'pending',reason:'Waiting for second matching finalized public result'};
  }}
 });
 return {monitor,lookups,latest:()=>monitor.snapshot(),
  setNow:t=>{now=t},next:()=>{quoteIndex++},maxActive:()=>maxActive,
  throwOn:t=>{throwMarket=t}};
}
test('backfill spans eight distinct expired forecasts with no more than four simultaneous requests',async()=>{
 const h=fixture();
 for(let i=0;i<9;i++){await h.monitor.scan();h.next()}
 assert.equal(h.latest().records,9);
 assert.equal(h.latest().qualifiedCount,0);
 h.setNow(T+300000);
 await h.monitor.scan();
 assert.equal(h.lookups.length,8);
 assert.equal(new Set(h.lookups).size,8);
 assert.equal(h.maxActive(),4);
 assert.equal(h.latest().settlementBackfill.maxReadsPerScan,8);
 assert.equal(h.latest().settlementBackfill.maxConcurrentReads,4);
 assert.equal(h.latest().pendingResolutionDiagnostics.pendingTotal,9);
 assert.equal(h.latest().officiallyScored,0);
 assert.equal(h.latest().misses,0);
 assert.equal(h.latest().capacity.remainingRecords,311);
 assert.equal(h.latest().capacity.automaticRolloverEnabled,false);
 await h.monitor.scan();
 assert.equal(h.lookups.length,16);
 assert.equal(new Set(h.lookups).size,9,'round-robin must reach all nine pending markets');
 assert.equal(h.latest().qualifiedCount,0);
});
test('one failed result read does not erase neighboring pending forecasts or leak error strings',async()=>{
 const h=fixture();
 for(let i=0;i<8;i++){await h.monitor.scan();h.next()}
 const failedMarket=h.latest().latest.marketId;
 h.throwOn(failedMarket);
 h.setNow(T+300000);
 await h.monitor.scan();
 assert.equal(h.lookups.length,8);
 assert.equal(h.latest().failures,1);
 assert.equal(h.latest().pendingResolutionDiagnostics.pendingTotal,8);
 assert.equal(h.latest().officiallyScored,0);
 assert.doesNotMatch(JSON.stringify(h.latest()),/DO_NOT_LOG|secret bearer/);
});
test('settlement read limits fail closed rather than allowing unbounded parallel fetches',()=>{
 const base={quotes:{},spot:{},results:{}};
 for(const x of [-1,0,9,Infinity,NaN,2.5,'8']){
  assert.throws(()=>createProspectiveMonitor({...base,settlementReadsPerScan:x}),
   /Unsafe prospective settlement read limit/);
 }
 assert.equal(createProspectiveMonitor({...base,settlementReadsPerScan:4}).snapshot().settlementBackfill.maxReadsPerScan,4);
});
