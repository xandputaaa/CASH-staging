'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {checkExchangeMarket,augmentObservationWithExchange}=require('../exchange-preexpiry-check');
const {buildObservation}=require('../preexpiry-observer');
const sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const marketId='KXBTC15M-26NOV171815-15',
 at='2026-11-17T23:12:00Z',close='2026-11-17T23:15:00Z',
 now=Date.parse('2026-11-17T23:12:30Z');
function market(patch={}){return {
 ticker:marketId,status:'active',result:'',floor_strike:65000,
 strike_type:'greater_or_equal',close_time:close,is_provisional:false,
 yes_ask_dollars:'0.1010',no_ask_dollars:'0.8990',
 yes_ask_size_fp:'30.00',no_ask_size_fp:'5.00',...patch};}
function check(patch={},time=now,strike=65000){
 return checkExchangeMarket({marketId,freezeStrike:strike,
  closeTime:close,market:market(patch),receivedMs:time});
}
test('matches active public Kalshi ticker, freeze strike, expiry and payout rule before closure',()=>{
 const p=check();
 assert.equal(p.state,'MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET');
 assert.equal(p.publicStrikeAtObserver,65000);
 assert.equal(p.publicMarketStatusAtObserver,'active');
 assert.equal(p.witnessTimeQuotesNotFills.noAskDollars,.899);
 assert.equal(p.witnessTimeQuotesNotFills.noAskSizeFp,5);
 assert.equal(p.quoteWasNotFrozenAtPrediction,true);
 assert.equal(p.isFill,false);
 assert.equal(p.independentValidation,false);
 assert.match(p.exchangePublicFieldsSha256,/^[a-f0-9]{64}$/);
});
test('no verified exchange if market identity, close time or frozen strike mismatch',()=>{
 for(const patch of [{ticker:'OTHER-MARKET'},{close_time:'2026-11-17T23:20:00Z'}]){
  assert.equal(check(patch).state,'EXCHANGE_MARKET_ID_OR_EXPIRY_MISMATCH');
 }
 assert.equal(check({floor_strike:65000.01}).state,'EXCHANGE_STRIKE_OR_RULE_MISMATCH');
 assert.equal(check({strike_type:'greater'}).state,'EXCHANGE_STRIKE_OR_RULE_MISMATCH');
 assert.equal(check({floor_strike:null}).state,'EXCHANGE_STRIKE_OR_RULE_MISMATCH');
 assert.equal(check({floor_strike:'65000.00'}).state,'MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET');
});
test('never corroborates provisional, finalized, result-known or stale observations',()=>{
 for(const patch of [{status:'settled'},{status:'finalized'},
  {is_provisional:true},{result:'no'},{result:'yes'}]){
  assert.equal(check(patch).state,'EXCHANGE_NOT_UNSETTLED_ACTIVE_MARKET');
 }
 assert.equal(check({},Date.parse('2026-11-17T23:14:50Z')).state,'EXCHANGE_READ_TOO_LATE');
 assert.equal(check({},Date.parse('2026-11-17T23:15:30Z')).state,'EXCHANGE_READ_TOO_LATE');
 assert.equal(check({status:'open'}).state,'MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET');
});
test('unavailable public API is NOT assumed verified, and malformed quote fields are not executable',()=>{
 const unavailable=checkExchangeMarket({marketId,freezeStrike:65000,closeTime:close,
  market:null,receivedMs:now});
 assert.equal(unavailable.state,'EXCHANGE_MARKET_UNAVAILABLE');
 const p=check({yes_ask_dollars:'3.0000',no_ask_dollars:'bad',
   yes_ask_size_fp:'-2',no_ask_size_fp:null});
 assert.equal(p.state,'MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET');
 assert.equal(p.witnessTimeQuotesNotFills.yesAskDollars,null);
 assert.equal(p.witnessTimeQuotesNotFills.noAskDollars,null);
 assert.equal(p.witnessTimeQuotesNotFills.yesAskSizeFp,null);
 assert.equal(p.witnessTimeQuotesNotFills.noAskSizeFp,null);
});
function journal(kind){
 const model=kind==='early'?'KXBTC15M_SETTLEMENT_EARLY_V3':
  'KXBTC15M_LATE_CHECKPOINT_SHADOW_V1';
 const p={marketId,model,side:'NO',at,endTime:close,
  indexSourceType:'SINGLE_EXCHANGE_PROXY',
  ...(kind==='early'?{targetPrice:65000}:{officialStrikeAtFreeze:65000})};
 const e={sequence:1,recordedAt:at,type:'FORECAST',payload:p,previousHash:'GENESIS'};
 e.hash=sha(e);
 return {version:kind==='early'?'CASH_PROSPECTIVE_KALSHI_V1':'CASH_LATE_CHECKPOINT_SHADOW_V1',
 format:kind==='early'?'CASH_PROSPECTIVE_HASHED_SESSION_V1':
  'CASH_LATE_CHECKPOINT_UNVERIFIED_HASH_CHAIN_V1',
 events:[e],records:1,pending:1,headHash:e.hash,
 qualifiedCount:0,independentQualification:0,
 independentlyTimeAttested:false,tradingAuthorized:false,
 automatedOrdersEnabled:false,realMoneyAuthorized:false,canExecuteOrders:false};
}
test('real observer independently fetches one public Kalshi market for two model witnesses',async()=>{
 const early=journal('early'),late=journal('late');
 const base=buildObservation({early,late,observedAt:new Date(now).toISOString(),
  runId:'44201690201',repository:'xandputaaa/CASH-staging',commitSha:'a'.repeat(40)});
 assert.equal(base.frozenEvidence.length,2);
 let calls=0;
 const result=await augmentObservationWithExchange(base,{early,late},{
  clock:()=>now+1000,fetchImpl:async url=>{
   calls++;assert.equal(url,'https://external-api.kalshi.com/trade-api/v2/markets/'+marketId);
   return {ok:true,text:async()=>JSON.stringify({market:market()})};
  }
 });
 assert.equal(calls,1);
 assert.equal(result.directExchangeMatches,2);
 assert.equal(result.directExchangeMismatchesOrUnavailable,0);
 assert.equal(result.frozenEvidence.every(x=>
  x.exchangeAtWitness?.state==='MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET'),true);
 assert.equal(result.independentQualifiedCount,0);
 assert.equal(result.realOrdersEnabled,false);
 assert.equal(base.directExchangeMatches,undefined);
});
test('failed direct Kalshi API preserves provisional forecast witness but zero direct confirmation',async()=>{
 const late=journal('late'),base=buildObservation({early:null,late,
  observedAt:new Date(now).toISOString(),runId:'44201690201',
  repository:'xandputaaa/CASH-staging',commitSha:'a'.repeat(40)});
 const out=await augmentObservationWithExchange(base,{early:null,late},{
  clock:()=>now+1000,fetchImpl:async()=>{throw Error('market offline')}
 });
 assert.equal(out.frozenEvidence.length,1);
 assert.equal(out.directExchangeMatches,0);
 assert.equal(out.directExchangeMismatchesOrUnavailable,1);
 assert.equal(out.frozenEvidence[0].exchangeAtWitness.state,'EXCHANGE_MARKET_UNAVAILABLE');
 assert.equal(out.independentQualifiedCount,0);
});
