'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {assessDefaultLateCapacity,DEFAULT_MAX,WARNING_REMAINING}=require('../research-capacity');
function sample(n){return {
 version:'CASH_LATE_CHECKPOINT_SHADOW_V1',
 format:'CASH_LATE_CHECKPOINT_UNVERIFIED_HASH_CHAIN_V1',
 records:n,events:[],realMoneyAuthorized:false,canExecuteOrders:false
};}
test('default public research journal has 160 assumed slots, not permanent storage',()=>{
 const r=assessDefaultLateCapacity(sample(15));
 assert.equal(DEFAULT_MAX,160);
 assert.equal(WARNING_REMAINING,32);
 assert.equal(r.defaultConfiguredMax,160);
 assert.equal(r.estimatedRemainingFrozenMarketSlots,145);
 assert.equal(r.state,'DEFAULT_JOURNAL_HAS_HEADROOM');
 assert.equal(r.independentlyQualified,0);
 assert.equal(r.tradingEnabled,false);
 assert.match(r.caution,/constructor|GitHub artifacts/i);
});
test('approaching 160-market default records explicit low-capacity warning before quota exhaustion',()=>{
 for(const n of [128,145,159]){
  const r=assessDefaultLateCapacity(sample(n));
  assert.equal(r.state,'DEFAULT_JOURNAL_CAPACITY_LOW');
  assert.equal(r.estimatedRemainingFrozenMarketSlots,160-n);
 }
});
test('full or above-default journal is not silently represented as having free slots',()=>{
 for(const n of [160,161]){
  const r=assessDefaultLateCapacity(sample(n));
  assert.equal(r.state,'DEFAULT_JOURNAL_FULL');
  assert.equal(r.estimatedRemainingFrozenMarketSlots,0);
 }
});
test('rejects malformed research data and any order or unsupported status',()=>{
 for(const v of [
  {records:-1},{records:1.5},{records:'150'},
  {realMoneyAuthorized:true},{canExecuteOrders:true},
  {events:null},{format:'WRONG'},{version:'WRONG'}
 ]){
  assert.throws(()=>assessDefaultLateCapacity({...sample(100),...v}),
   /Unsafe or malformed/);
 }
});
