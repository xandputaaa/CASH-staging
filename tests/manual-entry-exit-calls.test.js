'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {makeManualCalls,maxAffordable,netExitAtBid}=require('../manual-entry-exit-calls');
const now=Date.parse('2026-11-19T20:00:00.000Z');
const iso=x=>new Date(x).toISOString();
function fixture({direction='YES',ask=.52,bid=.49,minutes=5}={}){
 const targetPrice=100000,spotPrice=direction==='YES'?100550:99450;
 const history=Array.from({length:22},(_,i)=>({
  time:iso(now-316500+15000*i),
  price:spotPrice+(i-21)*.05,source:'Kraken BTC/USD'
 }));
 return {now,
  quote:{venue:'Kalshi',marketId:'KXBTC15M-26NOV192005',status:'live',
   refreshFailed:false,fetchedAt:iso(now-1000),openTime:iso(now-600000),
   endTime:iso(now+minutes*60000),targetPrice,
   targetSource:'KALSHI_FLOOR_STRIKE',contractRuleStatus:'BRTI_60S_RULE_TEXT_PRESENT',
   strikeType:'greater_or_equal',tieGoesToYes:true,
   yesAsk:direction==='YES'?ask:.52,yesBid:direction==='YES'?bid:.49,
   noAsk:direction==='NO'?ask:.52,noBid:direction==='NO'?bid:.49},
  spot:{status:'live',source:'Kraken BTC/USD',
   price:history.at(-1).price,fetchedAt:history.at(-1).time,history},
  fees:{state:'SERIES_METADATA_LIVE',feeType:'quadratic',
   feeMultiplier:1,refreshedAt:iso(now-2000)}};
}
test('strictly qualified uncalibrated YES research call and $10 entry cost',()=>{
 const x=fixture();
 const out=makeManualCalls(x);
 assert.equal(out.call,'ENTER_YES');
 assert.equal(out.side,'YES');
 assert.equal(out.sourceType,'SINGLE_EXCHANGE_PROXY');
 assert.equal(out.expectedValue,null);
 assert.equal(out.calibratedWinProbability,null);
 assert.equal(out.evidenceQualified,false);
 assert.equal(out.tradingAuthorization,false);
 assert.equal(out.automaticTradingEnabled,false);
 assert.equal(out.ordersPlaced,0);
 assert.ok(out.entry.maxContractsAt10Usd>0);
 assert.ok(out.entry.estimatedTotalCostAtMax<=10);
 assert.ok(out.entry.estimatedTotalCostAtMax>0);
 assert.ok(out.entry.maxIndicativeAsk===.52);
});
test('NO call is directional but never labeled proven EV',()=>{
 const out=makeManualCalls(fixture({direction:'NO'}));
 assert.equal(out.call,'ENTER_NO');
 assert.equal(out.side,'NO');
 assert.equal(out.expectedValue,null);
 assert.equal(out.sourceClass,'UNVALIDATED_PROXY_MODEL');
});
test('stale or inconsistent market data yields WAIT, never cached call',()=>{
 for(const change of [
  {fetchedAt:iso(now-30000)},{status:'stale'},{refreshFailed:true},
  {contractRuleStatus:'RULE_TEXT_NOT_CONFIRMED'},
  {targetPrice:null},{strikeType:'greater'}
 ]){
  const x=fixture();Object.assign(x.quote,change);
  const out=makeManualCalls(x);
  assert.equal(out.call,'WAIT',JSON.stringify(change));
  assert.equal(out.entry,null);
 }
});
test('spread, absent bid, expensive side and near expiry veto entries',()=>{
 for(const overrides of [
  {yesBid:.30},{yesBid:null},{yesAsk:.87,yesBid:.85},
  {noBid:null,yesBid:1}
 ]){
  const x=fixture();Object.assign(x.quote,overrides);
  const result=makeManualCalls(x);
  if(overrides.noBid===null&&overrides.yesBid===1)continue;
  assert.equal(result.call,'WAIT',JSON.stringify(overrides));
 }
 const closing=fixture({minutes:1.5});
 assert.equal(makeManualCalls(closing).call,'WAIT');
 const distant=fixture({minutes:12});
 assert.equal(makeManualCalls(distant).call,'WAIT');
});
test('stale fees cannot be treated as free fills',()=>{
 const x=fixture();x.fees.refreshedAt=iso(now-310000);
 const out=makeManualCalls(x);
 assert.equal(out.call,'WAIT');
 assert.ok(out.blockers.includes('CURRENT_FEE_METADATA_REQUIRED'));
});
test('model does not fabricate a direction when target is within movement buffer',()=>{
 const x=fixture();
 x.quote.targetPrice=x.spot.price;
 const out=makeManualCalls(x);
 assert.equal(out.call,'WAIT');
 assert.ok(out.blockers.includes('NO_QUALIFYING_FROZEN_MODEL_DIRECTION'));
});
test('entry position is manually supplied; profitable bid triggers take-profit',()=>{
 const x=fixture();
 const position={marketId:x.quote.marketId,side:'YES',entryPrice:.50,contracts:3};
 x.quote.yesBid=.71;
 const out=makeManualCalls({...x,position});
 assert.equal(out.position.call,'TAKE_PROFIT');
 assert.ok(out.position.estimatedNetPnlUsd>.24);
 assert.ok(out.position.estimatedExitFee>0);
 assert.ok(out.position.illustrativeTakeProfitBid>.50);
 assert.equal(out.position.noPositionDataStored,true);
});
test('loss-taking triggers at fresh real public bid and includes both side fees',()=>{
 const x=fixture();
 x.quote.yesBid=.40;
 const out=makeManualCalls({...x,position:{
  marketId:x.quote.marketId,side:'YES',entryPrice:.50,contracts:2
 }});
 assert.equal(out.position.call,'CUT_LOSS');
 assert.ok(out.position.estimatedNetPnlUsd<-.14);
 assert.ok(out.position.estimatedEntryFee>0);
 assert.ok(out.position.estimatedExitFee>0);
});
test('opposing directional signal yields exit review, not a fabricated guaranteed exit',()=>{
 const x=fixture();
 x.quote.noBid=.50;
 const out=makeManualCalls({...x,position:{
  marketId:x.quote.marketId,side:'NO',entryPrice:.50,contracts:1
 }});
 assert.equal(out.position.call,'EXIT_REVIEW');
 assert.equal(out.position.reason,'CURRENT_EXPERIMENTAL_MODEL_DISAGREES');
});
test('position for different contract, invalid quantity, unknown sell bid refuse exit pnl',()=>{
 const x=fixture();
 for(const position of [
  {marketId:'KXBTC15M-OLD-123456',side:'YES',entryPrice:.5,contracts:1},
  {marketId:x.quote.marketId,side:'YES',entryPrice:.5,contracts:101},
  {marketId:x.quote.marketId,side:'WRONG',entryPrice:.5,contracts:1}
 ]){
  const out=makeManualCalls({...x,position});
  assert.equal(out.position.call,'RECHECK');
  assert.equal(out.position.estimatedNetPnlUsd,null);
 }
 x.quote.yesBid=null;
 const out=makeManualCalls({...x,position:{
  marketId:x.quote.marketId,side:'YES',entryPrice:.50,contracts:1
 }});
 assert.equal(out.position.call,'RECHECK');
 assert.equal(out.position.estimatedNetPnlUsd,null);
});
test('position risk refuses more than $10 hypothetical cost',()=>{
 const x=fixture();
 const out=makeManualCalls({...x,position:{
  marketId:x.quote.marketId,side:'YES',entryPrice:.95,contracts:20
 }});
 assert.equal(out.position.call,'RECHECK');
 assert.equal(out.position.reason,'POSITION_EXCEEDS_RESEARCH_RISK_CAP');
});
test('numeric fees and affordable quantity do not round risk below maximum',()=>{
 const affordable=maxAffordable(.79,1);
 assert.ok(affordable.preview.hypotheticalCost<=10);
 assert.ok(maxAffordable(.79,1).contracts>0);
 assert.ok(netExitAtBid({entryPrice:.5,contracts:1},.61,1).estimatedNetPnlUsd<.11);
});
