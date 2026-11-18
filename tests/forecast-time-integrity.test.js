'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {inspectFrozen,auditPublicInputTimes}=require('../forecast-time-integrity');
const SHA=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const frozen='2026-11-18T04:41:33.969Z',close='2026-11-18T04:45:00Z',
 id='KXBTC15M-26NOV172345-45';
const late=()=>({
 model:'KXBTC15M_LATE_CHECKPOINT_SHADOW_V1',marketId:id,side:'NO',
 at:frozen,endTime:close,leadMs:206031,
 indexSourceType:'SINGLE_EXCHANGE_PROXY',
 officialStrikeAtFreeze:64502.16,strikeTypeAtFreeze:'greater_or_equal',
 inputCommitment:'a'.repeat(64),sampleCommitment:'b'.repeat(64),
 publicAskAtFreeze:{YES:.024,NO:.977},
 publicAskQuoteFetchedAt:'2026-11-18T04:41:29.332Z',
 feeScheduleAtFreeze:{
  source:'KALSHI_PUBLIC_SERIES_API',feeType:'quadratic',
  multiplier:1,refreshedAt:'2026-11-18T04:36:54.105Z'
 }
});
const early=()=>({
 model:'KXBTC15M_SETTLEMENT_EARLY_V3',marketId:id,side:null,
 at:'2026-11-18T04:32:14.090Z',endTime:close,leadMs:765910,
 indexSourceType:'SINGLE_EXCHANGE_PROXY',
 targetPrice:64502.16,spotPrice:64512.2,spotSource:'Kraken BTC/USD',
 spotFetchedAt:'2026-11-18T04:32:14.089Z',
 quoteFetchedAt:'2026-11-18T04:32:14.081Z',
 observedAsks:{YES:.54,NO:.47},
 sampleWindowSha256:'c'.repeat(64),inputSha256:'d'.repeat(64),
 sampleWindow:[
  {time:'2026-11-18T04:31:44.144Z',price:64515.4,source:'Kraken BTC/USD'},
  {time:'2026-11-18T04:31:59.276Z',price:64512.3,source:'Kraken BTC/USD'},
  {time:'2026-11-18T04:32:14.089Z',price:64512.2,source:'Kraken BTC/USD'}
 ]
});
function event(kind,p){
 const ev={sequence:1,recordedAt:p.at,type:'FORECAST',
  payload:p,previousHash:'GENESIS'};
 ev.hash=SHA(ev);
 return ev;
}
function journal(kind,p){
 const e=event(kind,p);
 return {
  version:kind==='early'?'CASH_PROSPECTIVE_KALSHI_V1':
   'CASH_LATE_CHECKPOINT_SHADOW_V1',
  format:kind==='early'?'CASH_PROSPECTIVE_HASHED_SESSION_V1':
   'CASH_LATE_CHECKPOINT_UNVERIFIED_HASH_CHAIN_V1',
  headHash:e.hash,records:1,pending:1,events:[e],
  qualifiedCount:0,independentQualification:0,
  independentlyTimeAttested:false,tradingAuthorized:false,
  automatedOrdersEnabled:false,realMoneyAuthorized:false,
  canExecuteOrders:false
 };
}
test('realistic frozen early and late public fields have no temporal contradictions',()=>{
 const e=early(),l=late();
 assert.deepEqual(inspectFrozen({event:event('early',e),payload:e,kind:'early'}).issues,[]);
 assert.deepEqual(inspectFrozen({event:event('late',l),payload:l,kind:'late'}).issues,[]);
 const r=auditPublicInputTimes({early:journal('early',e),late:journal('late',l)});
 assert.equal(r.status,'NO_PUBLIC_INPUT_TIME_CONTRADICTIONS_FOUND');
 assert.equal(r.cohorts.early.publicRawSampleTimeInspectable,1);
 assert.equal(r.cohorts.late.publicRawSampleTimeNotInspectable,1);
 assert.equal(r.cohorts.early.directional,0);
 assert.equal(r.cohorts.late.directional,1);
 assert.equal(r.independentlyQualifiedCount,0);
 assert.equal(r.ordersEnabled,false);
 assert.equal(r.actualFillsVerified,0);
 assert.equal(r.cohorts.late.sourceInputsIndependentlyVerified,false);
});
test('time leakage from future public Kraken sample makes the early forecast invalid',()=>{
 const e=early();
 e.sampleWindow[2].time='2026-11-18T04:32:17.200Z';
 const r=auditPublicInputTimes({early:journal('early',e),late:journal('late',late())});
 assert.equal(r.status,'PUBLIC_FREEZE_INPUT_TIME_ISSUES_FOUND');
 assert.equal(r.cohorts.early.recordsWithTemporalIssues,1);
 assert.ok(r.cohorts.early.timeIssues.some(x=>x.code==='KRAKEN_HISTORY_CONTAINS_FUTURE_SAMPLE'));
});
test('out-of-order raw public spot history and changed sample source are flagged',()=>{
 const e=early();
 e.sampleWindow[0].time='2026-11-18T04:32:13.000Z';
 e.sampleWindow[1].time='2026-11-18T04:31:59.276Z';
 e.sampleWindow[1].source='UNKNOWN_PRIVATE_INDEX';
 const a=inspectFrozen({event:event('early',e),payload:e,kind:'early'});
 assert.ok(a.issues.includes('KRAKEN_HISTORY_OUT_OF_ORDER'));
 assert.ok(a.issues.includes('KRAKEN_HISTORY_UNRECOGNIZED_PUBLIC_SOURCE'));
});
test('late public purchase quote obtained AFTER frozen decision is explicitly invalid',()=>{
 const p=late();
 p.publicAskQuoteFetchedAt='2026-11-18T04:41:39.999Z';
 const a=inspectFrozen({event:event('late',p),payload:p,kind:'late'});
 assert.ok(a.issues.includes('LATE_PUBLIC_ASK_OBSERVED_AFTER_FREEZE'));
});
test('late quote too old and series fee metadata timestamp in future are issues',()=>{
 const p=late();
 p.publicAskQuoteFetchedAt='2026-11-18T04:40:00Z';
 p.feeScheduleAtFreeze.refreshedAt='2026-11-18T04:50:00Z';
 const a=inspectFrozen({event:event('late',p),payload:p,kind:'late'});
 assert.ok(a.issues.includes('LATE_PUBLIC_ASK_STALE_AT_FREEZE'));
 assert.ok(a.issues.includes('SERIES_FEE_METADATA_OBSERVED_AFTER_FREEZE'));
});
test('early spot, quote and sample cannot be newer than frozen decision',()=>{
 const p=early();
 p.spotFetchedAt='2026-11-18T04:32:20Z';
 p.quoteFetchedAt='2026-11-18T04:32:20Z';
 const a=inspectFrozen({event:event('early',p),payload:p,kind:'early'});
 assert.ok(a.issues.includes('KRAKEN_SPOT_TIMESTAMP_AFTER_FORECAST'));
 assert.ok(a.issues.includes('EARLY_QUOTE_AFTER_FORECAST'));
});
test('incorrect lead timestamp and event recorded after freeze are not accepted',()=>{
 const p=late(),e=event('late',p);
 p.leadMs=200000;e.recordedAt='2026-11-18T04:41:51Z';
 const a=inspectFrozen({event:e,payload:p,kind:'late'});
 assert.ok(a.issues.includes('LEAD_TIME_INCONSISTENT_WITH_EXPIRY'));
 assert.ok(a.issues.includes('EVENT_WRITTEN_DIFFERENT_FROM_FREEZE_TIME'));
});
test('late raw sample commitments are NOT interpreted as independently audited past-only history',()=>{
 const p=late();
 const a=inspectFrozen({event:event('late',p),payload:p,kind:'late'});
 assert.equal(a.inspectable,true);
 assert.equal(a.rawSampleTimesAvailable,false);
 assert.ok(a.warnings.includes('LATE_RAW_MODEL_INPUT_SAMPLES_REDACTED_NOT_RECONSTRUCTABLE'));
});
test('stale Kalshi series fee metadata is a warning, not invented profitable paper fills',()=>{
 const p=late();
 p.feeScheduleAtFreeze.refreshedAt='2026-11-18T04:35:00Z';
 const a=inspectFrozen({event:event('late',p),payload:p,kind:'late'});
 assert.equal(a.issues.length,0);
 assert.ok(a.warnings.includes('FEE_METADATA_OLDER_THAN_FIVE_MINUTES'));
});
test('invalid frozen ask price and missing commitments rejected before price-based conclusions',()=>{
 const p=late();
 p.publicAskAtFreeze.NO=1.2;
 p.sampleCommitment=null;
 const a=inspectFrozen({event:event('late',p),payload:p,kind:'late'});
 assert.ok(a.issues.includes('LATE_PUBLIC_ASK_INVALID'));
 assert.ok(a.issues.includes('LATE_COMMITTED_INPUT_HASH_MISSING'));
});
test('licensed index source is not reconstructed from public proxy data',()=>{
 const p=late();p.indexSourceType='OFFICIAL_BRTI_LIVE';
 const a=inspectFrozen({event:event('late',p),payload:p,kind:'late'});
 assert.equal(a.inspectable,false);
 assert.equal(a.rawSampleTimesAvailable,false);
 assert.ok(a.warnings.includes('NON_PUBLIC_PROXY_SOURCE_NOT_TIME_RECONSTRUCTABLE'));
});
test('self-hash tampering is rejected before input time inspection',()=>{
 const e=journal('early',early()),l=journal('late',late());
 e.events[0].payload.spotFetchedAt='2026-11-18T04:35:00Z';
 assert.throws(()=>auditPublicInputTimes({early:e,late:l}),/checksum/);
});
