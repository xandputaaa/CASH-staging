'use strict';
// Experimental manual BTC 15-minute research calls. No orders and no
// calibrated win probabilities, execution guarantees or promised edge.
const {takerPreview}=require('./kalshi-fees');
const {evaluateProspective}=require('./kalshi-prospective-model');
const ID=/^KXBTC15M-[A-Za-z0-9-]{6,70}$/;
const validPrice=n=>Number.isFinite(n)&&n>=0.01&&n<=0.99;
const round=n=>Math.round((n+Number.EPSILON)*10000)/10000;
const MAX_LOSS_USD=10,MIN_LEAD=150000,MAX_LEAD=600000;
function goodFee(fees,now){
 const age=now-Date.parse(fees?.refreshedAt);
 return fees?.state==='SERIES_METADATA_LIVE'&&
  ['quadratic','quadratic_with_maker_fees'].includes(fees.feeType)&&
  Number.isFinite(fees.feeMultiplier)&&fees.feeMultiplier>=0&&
  fees.feeMultiplier<=5&&Number.isFinite(age)&&age>=-2000&&age<=300000;
}
function goodQuote(quote,now){
 const age=now-Date.parse(quote?.fetchedAt),remaining=Date.parse(quote?.endTime)-now;
 return quote?.venue==='Kalshi'&&ID.test(quote.marketId||'')&&
  quote.status==='live'&&quote.refreshFailed!==true&&
  Number.isFinite(age)&&age>=-2000&&age<=12000&&
  Number.isFinite(remaining)&&remaining>0&&remaining<=900000&&
  Number.isFinite(quote.targetPrice)&&quote.targetPrice>1000&&
  quote.targetSource==='KALSHI_FLOOR_STRIKE'&&
  quote.contractRuleStatus==='BRTI_60S_RULE_TEXT_PRESENT'&&
  quote.strikeType==='greater_or_equal'&&quote.tieGoesToYes===true;
}
function maxAffordable(ask,multiplier,maxLoss=MAX_LOSS_USD){
 let affordable=0,preview=null;
 for(let n=1;n<=100;n++){
  const x=takerPreview(ask,multiplier,n);
  if(!x||x.hypotheticalCost>maxLoss+1e-9)break;
  affordable=n;preview=x;
 }
 return {contracts:affordable,preview};
}
function netExitAtBid(position,bid,multiplier){
 const buy=takerPreview(position.entryPrice,multiplier,position.contracts);
 const sell=takerPreview(bid,multiplier,position.contracts);
 if(!buy||!sell)return null;
 const proceeds=round(bid*position.contracts-sell.fee);
 return {observedBid:bid,estimatedEntryFee:buy.fee,
  estimatedExitFee:sell.fee,estimatedNetProceeds:proceeds,
  estimatedNetPnlUsd:round(proceeds-buy.hypotheticalCost),
  estimatedEntryTotal:buy.hypotheticalCost};
}
function triggerBid(position,multiplier,threshold,direction){
 // Scan 1-cent indicative bid ticks, not executable orders.
 const candidates=[];
 for(let cents=1;cents<=99;cents++){
  const x=netExitAtBid(position,cents/100,multiplier);
  if(x)candidates.push(x);
 }
 if(direction==='TARGET'){
  const x=candidates.find(x=>x.estimatedNetPnlUsd>=threshold);
  return x?x.observedBid:null;
 }
 const x=candidates.filter(x=>x.estimatedNetPnlUsd<=-threshold).at(-1);
 return x?x.observedBid:null;
}
function validatePosition(raw,marketId){
 if(raw===null||raw===undefined)return {status:'NONE'};
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||
  !['YES','NO'].includes(raw.side)||raw.marketId!==marketId||
  !validPrice(raw.entryPrice)||!Number.isSafeInteger(raw.contracts)||
  raw.contracts<1||raw.contracts>100)
  return {status:'INVALID'};
 return {status:'VALID',position:{
  marketId,side:raw.side,entryPrice:raw.entryPrice,contracts:raw.contracts
 }};
}
function makeManualCalls({quote={},fees={},spot={},position=null,now=Date.now()}={}){
 if(!Number.isFinite(now))throw Error('Invalid call timestamp');
 const blocked=[],timeLeft=Date.parse(quote?.endTime)-now;
 if(!goodQuote(quote,now))blocked.push('OFFICIAL_MARKET_OR_FRESH_QUOTES_UNVERIFIED');
 if(!goodFee(fees,now))blocked.push('CURRENT_FEE_METADATA_REQUIRED');
 const model=blocked.length?null:evaluateProspective({quote,spot,now});
 if(!model||model.state!=='PROVISIONAL_DIRECTION'||
    !['YES','NO'].includes(model.side)||model.marketId!==quote.marketId)
  blocked.push('NO_QUALIFYING_FROZEN_MODEL_DIRECTION');
 if(!(timeLeft>=MIN_LEAD&&timeLeft<=MAX_LEAD))
  blocked.push('OUTSIDE_ENTRY_WINDOW');
 const side=model?.side||null;
 const ask=side==='YES'?quote.yesAsk:side==='NO'?quote.noAsk:null;
 const bid=side==='YES'?quote.yesBid:side==='NO'?quote.noBid:null;
 if(!validPrice(ask)||!validPrice(bid)||bid>ask||
    ask-bid>0.06)blocked.push('SPREAD_OR_LIQUIDITY_NOT_VERIFIED');
 if(!validPrice(ask)||ask<0.20||ask>0.80)
  blocked.push('ENTRY_PRICE_OUTSIDE_EXPERIMENTAL_RANGE');
 // Apply a stronger uncalibrated model margin than the base frozen model,
 // not a fabricated probability or proven positive-EV claim.
 if(!Number.isFinite(model?.signalZ)||
    Math.abs(model.signalZ)<(model?.indexSourceType==='OFFICIAL_BRTI_LIVE'?1.8:2.2))
  blocked.push('MODEL_MARGIN_INSUFFICIENT');
 const size=blocked.length?{contracts:0,preview:null}:
  maxAffordable(ask,fees.feeMultiplier);
 if(!blocked.length&&!size.contracts)blocked.push('EXCEEDS_10_USD_HYPOTHETICAL_RISK_CAP');
 const pos=validatePosition(position,quote.marketId);
 const out={
  version:'CASH_MANUAL_CALLS_V1',at:new Date(now).toISOString(),
  mode:'EXPERIMENTAL_MANUAL_RESEARCH_ONLY',
  marketId:ID.test(quote?.marketId||'')?quote.marketId:null,
  timeRemainingMs:Number.isFinite(timeLeft)?Math.max(0,timeLeft):null,
  call:blocked.length?'WAIT':side==='YES'?'ENTER_YES':'ENTER_NO',
  side:blocked.length?null:side,
  sourceType:model?.indexSourceType||null,
  modelId:model?.model||null,
  sourceClass:model?.validation||'NO_MODEL',
  signalZ:Number.isFinite(model?.signalZ)?model.signalZ:null,
  calibratedWinProbability:null,expectedValue:null,
  evidenceQualified:false,
  entry:blocked.length?null:{
   maxIndicativeAsk:ask,observedBid:bid,
   observedSpread:round(ask-bid),
   maxContractsAt10Usd:size.contracts,
   estimatedTotalCostAtMax:size.preview.hypotheticalCost,
   estimatedTakerFeeAtMax:size.preview.fee,
   maxHypotheticalLossUsd:MAX_LOSS_USD,
   expiresAt:quote.endTime
  },
  blockers:blocked,
  position:null,
  automaticTradingEnabled:false,ordersPlaced:0,
  tradingAuthorization:false,
  warning:'Experimental research call, not a validated profitable strategy. Public bids/asks are not guaranteed executable fills; BRTI settlement is a different 60-second average. Costs and slippage can erase gains.'
 };
 if(pos.status==='NONE')return out;
 if(pos.status!=='VALID'){
  out.position={call:'RECHECK',reason:'INVALID_OR_DIFFERENT_MARKET_POSITION',
   estimatedNetPnlUsd:null};
  return out;
 }
 const held=pos.position,sideBid=held.side==='YES'?quote.yesBid:quote.noBid;
 if(!goodQuote(quote,now)||!goodFee(fees,now)||!validPrice(sideBid)){
  out.position={call:'RECHECK',reason:'NO_CURRENT_EXIT_BID_OR_FEE',
   side:held.side,contracts:held.contracts,estimatedNetPnlUsd:null};
  return out;
 }
 const risk=takerPreview(held.entryPrice,fees.feeMultiplier,held.contracts);
 if(!risk||risk.hypotheticalCost>MAX_LOSS_USD+1e-9){
  out.position={call:'RECHECK',reason:'POSITION_EXCEEDS_RESEARCH_RISK_CAP',
   side:held.side,contracts:held.contracts,estimatedNetPnlUsd:null};
  return out;
 }
 const exit=netExitAtBid(held,sideBid,fees.feeMultiplier);
 const target=round(0.08*held.contracts),stop=round(0.07*held.contracts);
 const targetBid=triggerBid(held,fees.feeMultiplier,target,'TARGET');
 const stopBid=triggerBid(held,fees.feeMultiplier,stop,'STOP');
 let call='HOLD_REVIEW',reason='BETWEEN_ESTIMATED_PROFIT_AND_LOSS_THRESHOLDS';
 if(exit.estimatedNetPnlUsd>=target){call='TAKE_PROFIT';reason='ESTIMATED_TARGET_AFTER_FEES_REACHED'}
 else if(exit.estimatedNetPnlUsd<=-stop){call='CUT_LOSS';reason='ESTIMATED_LOSS_THRESHOLD_REACHED'}
 else if(timeLeft<=90000){call='EXIT_REVIEW';reason='SETTLEMENT_APPROACHING'}
 else if(model?.side&&model.side!==held.side){call='EXIT_REVIEW';reason='CURRENT_EXPERIMENTAL_MODEL_DISAGREES'}
 out.position={
  call,reason,side:held.side,contracts:held.contracts,
  entryPrice:held.entryPrice,observedExitBid:sideBid,
  ...exit,targetNetProfitUsd:target,lossReviewThresholdUsd:stop,
  illustrativeTakeProfitBid:targetBid,illustrativeStopReviewBid:stopBid,
  pricesAreNonExecutable:true,
  noPositionDataStored:true
 };
 return out;
}
module.exports={makeManualCalls,goodFee,goodQuote,netExitAtBid,maxAffordable};
