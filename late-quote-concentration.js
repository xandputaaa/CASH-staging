'use strict';
/*
 * Read-only SOURCE-ONLY late V1 quote concentration. Self-hashed journals
 * are not independent time attestation, settlement certification, executable
 * orders, fill prices, or calibrated probabilities. No market IDs emitted.
 */
const {verifiedJournal}=require('./preexpiry-observer');
const isMoney=x=>Number.isFinite(x)&&x>=0.01&&x<1;
const round4=x=>Math.round((x+Number.EPSILON)*10000)/10000;
function lateQuoteConcentration(late){
 if(!late)return {
  version:'CASH_LATE_FREEZE_QUOTE_CONCENTRATION_V1',state:'SOURCE_UNAVAILABLE',
  independentlyQualifiedCount:0,ordersEnabled:false,
  quotesNotExecutable:true
 };
 if(late.version!=='CASH_LATE_CHECKPOINT_SHADOW_V1'||
    late.independentQualification!==0||
    late.canExecuteOrders!==false||
    late.realMoneyAuthorized!==false||
    late.calibrated!==false||
    late.independentlyTimeAttested!==false)
  throw Error('Unsafe late checkpoint quote export');
 // Verify original self-hashed source FORECAST and OUTCOME chain before
 // counting any originally observed ask. This is source integrity, not proof.
 const forecasts=verifiedJournal(late,'late');
 const outcomes=new Map();
 for(const e of late.events){
  if(e.type!=='OUTCOME')continue;
  const id=e.payload?.marketId;
  if(outcomes.has(id)||!['YES','NO','VOID'].includes(e.payload?.winner))
   throw Error('Untrusted duplicate or invalid final research label');
  outcomes.set(id,e.payload.winner);
 }
 let directional=0,waits=0,unpriced=0,nonpublic=0,priced=0,sourceHits=0,sourceMisses=0;
 const prices=[];
 for(const {p} of forecasts){
  if(p.side===null){waits++;continue}
  directional++;
  const outcome=outcomes.get(p.marketId);
  if(outcome==='YES'||outcome==='NO'){
   if(outcome===p.side)sourceHits++;
   else sourceMisses++;
  }
  if(p.indexSourceType!=='SINGLE_EXCHANGE_PROXY'){nonpublic++;continue}
  const ask=p.publicAskAtFreeze?.[p.side];
  if(!isMoney(ask)){unpriced++;continue}
  priced++;prices.push(ask);
 }
 const c=late.scorecard?.overall,pe=late.paperEconomics;
 if(forecasts.length!==late.records||directional+waits!==forecasts.length||
    (c&&(c.directional!==directional||c.waits!==waits||
      c.hits!==sourceHits||c.misses!==sourceMisses||
      c.scoredDirectional!==sourceHits+sourceMisses))||
    (pe&&(pe.directional!==directional||pe.waits!==waits||
      pe.paperWins!==sourceHits||pe.paperLosses!==sourceMisses||
      !Number.isSafeInteger(pe.negativeNetWins)||
      pe.negativeNetWins<0||pe.negativeNetWins>sourceHits)))
  throw Error('Source-only quote outcomes conflict with source-reported audit');
 const sorted=prices.sort((a,b)=>a-b);
 const mid=Math.floor(sorted.length/2);
 const median=sorted.length?(sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2):null;
 return {
  version:'CASH_LATE_FREEZE_QUOTE_CONCENTRATION_V1',
  state:'SELF_HASHED_RESEARCH_ONLY',
  frozenTotal:forecasts.length,directional,waits,
  selfReportedDirectionalSettled:sourceHits+sourceMisses,
  selfReportedHits:sourceHits,selfReportedMisses:sourceMisses,
  publicSpotProxyPricedDirectional:priced,
  publicSpotProxyUnpricedDirectional:unpriced,
  nonPublicSourceDirectionalNotPooled:nonpublic,
  medianPublicAskAtOriginalFreezeUSD:median===null?null:round4(median),
  asksAtLeast90Cents:sorted.filter(n=>n>=0.90).length,
  asksAtLeast95Cents:sorted.filter(n=>n>=0.95).length,
  asksAtLeast99Cents:sorted.filter(n=>n>=0.99).length,
  selfReportedConservativePaperNetUSD:Number.isFinite(pe?.conservativePnlDollars)?
   pe.conservativePnlDollars:null,
  selfReportedNegativeNetWinners:Number.isSafeInteger(pe?.negativeNetWins)?
   pe.negativeNetWins:null,
  askPriceIsNotIndependentProbability:true,
  quotesNotExecutable:true,
  originalQuotedAmountsAreNotFillPrices:true,
  feeOverridesAndSlippageNotVerified:true,
  sourceGeneratedNotIndependentlyValidated:true,
  independentlyQualifiedCount:0,ordersEnabled:false,
  caution:'This is a self-reported snapshot with only source-hash consistency; all market prices were public observed asks, not actual fills or model-calibrated probabilities. High hit rates on near-$1 asks can yield negligible or negative after-fee returns. No 100-contract independent holdout, expectancy or trade authorization follows.'
 };
}
module.exports={lateQuoteConcentration};
