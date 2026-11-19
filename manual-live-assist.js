'use strict';
// Read-only manual decision support. Never authorizes or places an exchange order.
const {takerPreview}=require('./kalshi-fees');
function manualAssist({quote={},fees={},side,contracts=1,now=Date.now(),maxLossUsd=10}={}){
 const blockers=[];
 if(!['YES','NO'].includes(side))blockers.push('INVALID_SIDE');
 if(!Number.isSafeInteger(contracts)||contracts<1)blockers.push('INVALID_CONTRACT_COUNT');
 if(!Number.isFinite(now))blockers.push('INVALID_CLOCK');
 if(!Number.isFinite(maxLossUsd)||maxLossUsd<=0||maxLossUsd>10)blockers.push('INVALID_LOSS_LIMIT');
 const fetched=Date.parse(quote.fetchedAt),end=Date.parse(quote.endTime);
 if(quote.venue!=='Kalshi'||!/^KXBTC15M-[A-Za-z0-9-]{6,70}$/.test(quote.marketId||''))blockers.push('UNVERIFIED_MARKET');
 if(quote.status!=='live'||quote.refreshFailed||!Number.isFinite(fetched)||fetched>now+2000||now-fetched>12000)blockers.push('STALE_QUOTE');
 if(!Number.isFinite(end)||end-now<60000||end-now>900000)blockers.push('OUTSIDE_SAFE_OBSERVATION_WINDOW');
 if(quote.contractRuleStatus!=='BRTI_60S_RULE_TEXT_PRESENT'||quote.strikeType!=='greater_or_equal'||quote.tieGoesToYes!==true)blockers.push('UNVERIFIED_SETTLEMENT_RULE');
 if(fees.state!=='SERIES_METADATA_LIVE'||!['quadratic','quadratic_with_maker_fees'].includes(fees.feeType))blockers.push('UNVERIFIED_FEE_METADATA');
 const price=side==='YES'?quote.yesAsk:quote.noAsk;
 const estimate=takerPreview(price,fees.feeMultiplier,contracts);
 if(!estimate)blockers.push('UNAVAILABLE_ASK_OR_FEE_ESTIMATE');
 const worstCase=estimate?estimate.hypotheticalCost:null;
 if(worstCase!==null&&worstCase>maxLossUsd+1e-9)blockers.push('EXCEEDS_MAX_POTENTIAL_LOSS');
 return Object.freeze({
  mode:'MANUAL_INFORMATION_ONLY',marketId:quote.marketId||null,side:side||null,contracts,
  observedAsk:Number.isFinite(price)?price:null,estimatedFee:estimate?.fee??null,
  estimatedMaxLossUsd:worstCase,estimatedMaxGrossPayoutUsd:estimate?.maxGrossPayout??null,
  status:blockers.length?'BLOCKED':'INFORMATION_ONLY',
  blockers,realOrdersEnabled:false,executionAuthorized:false,
  caveat:'Public quotes are not guaranteed fills. Event overrides, fees, liquidity, slippage and live positions are not verified. Open Kalshi separately; no order is placed.'
 });
}
module.exports={manualAssist};
