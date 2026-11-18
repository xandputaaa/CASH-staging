'use strict';
/*
 * EXTERNAL WITNESS-TIME public market quote/size coverage.
 * A quote fetched later by a GitHub runner is NOT the quote at forecast
 * freeze, proof that a contract could be bought, or actual execution.
 * Never substitute this later quote in the frozen-ask paper PnL.
 */
const {verifiedJournal}=require('./preexpiry-observer');
const {validObservation}=require('./observed-settlement-reconciler');
const MODEL='KXBTC15M_LATE_CHECKPOINT_SHADOW_V1';
const ROUND=x=>Math.round((x+Number.EPSILON)*10000)/10000;
const price=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1;
const size=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1000000000;
const stamp=x=>typeof x==='string'?Date.parse(x):NaN;
const empty=(state)=>({
 state,sidePublicAskAtGHWitness:null,displayedSizeAtGHWitness:null,
 frozenPublicAskAtModelDecision:null,publicAskDeltaFromFreeze:null,
 witnessQuoteWasCapturedAfterModelFreeze:true,
 oneContractFillProven:false,executableLiquidityVerified:false,
 actualTradesPlaced:0,calibratedProbability:null
});
function classifyQuote(row,witness,forecast){
 const unavailable=reason=>empty(reason);
 if(!row||row.model!==MODEL||!['YES','NO'].includes(row.witnessedSide)||
    !forecast||forecast.payload?.indexSourceType!=='SINGLE_EXCHANGE_PROXY'||
    forecast.hash!==row.observedCommitmentHash||
    forecast.payload.marketId!==row.marketId||
    forecast.payload.side!==row.witnessedSide)
  return unavailable('QUOTE_PROVENANCE_NOT_RECONCILED');
 if(!witness)return unavailable('GITHUB_PREEXPIRY_WITNESS_UNAVAILABLE');
 const evidence=witness.frozenEvidence.find(e=>
  e.model===MODEL&&e.marketId===row.marketId&&
  e.frozenEventHash===row.observedCommitmentHash);
 if(!evidence||String(witness.githubRunId)!==String(row.witnessGitHubRunId))
  return unavailable('GITHUB_WITNESS_HASH_MISMATCH');
 const direct=evidence.exchangeAtWitness;
 if(direct?.state!=='MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET')
  return unavailable('DIRECT_PUBLIC_MARKET_NOT_CORROBORATED');
 const p=forecast.payload,close=stamp(evidence.contractClosesAt),
  frozen=stamp(p.at),witnessed=stamp(witness.observedAtRunner),
  readAt=stamp(direct.observedAtRunner);
 if(!Number.isFinite(close)||!Number.isFinite(frozen)||
    !Number.isFinite(witnessed)||!Number.isFinite(readAt)||
    frozen>witnessed||witnessed>readAt||
    close-readAt<=15000||readAt-frozen>600000||
    direct.quoteWasNotFrozenAtPrediction!==true||direct.isFill!==false)
  return unavailable('WITNESS_TIME_NOT_PREEXPIRY_OR_RELIABLE');
 const q=direct.witnessTimeQuotesNotFills;
 const selected=row.witnessedSide;
 const current=selected==='YES'?q?.yesAskDollars:q?.noAskDollars;
 const quantity=selected==='YES'?q?.yesAskSizeFp:q?.noAskSizeFp;
 if(!price(current))return unavailable('WITNESS_ASK_UNAVAILABLE');
 const observedSize=size(quantity)?quantity:null;
 const original=p.publicAskAtFreeze?.[selected],originalTime=stamp(p.publicAskQuoteFetchedAt);
 const originalComparable=price(original)&&
   Number.isFinite(originalTime)&&originalTime<=frozen+2000&&
   frozen-originalTime<=12000;
 const grossIfWin=ROUND(1-current);
 const state=observedSize===null?'WITNESS_ASK_SIZE_UNKNOWN':
  observedSize<1?'WITNESS_DISPLAYED_SIZE_BELOW_ONE_CONTRACT':
  'WITNESS_DISPLAYED_SIZE_AT_LEAST_ONE_UNFILLED';
 return {
  state,sidePublicAskAtGHWitness:current,
  displayedSizeAtGHWitness:observedSize,
  frozenPublicAskAtModelDecision:originalComparable?original:null,
  publicAskDeltaFromFreeze:originalComparable?ROUND(current-original):null,
  publicAskChangedAgainstBuyer:originalComparable?current>original:null,
  publicAskChangedInBuyersFavor:originalComparable?current<original:null,
  firstPublicWitnessAt:new Date(witnessed).toISOString(),
  directMarketPublicAskReadAt:new Date(readAt).toISOString(),
  ageSinceFreezeAtDirectQuoteMs:readAt-frozen,
  preFeeGrossPayoutIfWinnerAtWitnessAsk:grossIfWin,
  isWitnessQuotePriceAtFrozenTime:false,
  publicMarketAskSizeNotAnOrderbookExecutionGuarantee:true,
  oneContractFillProven:false,executableLiquidityVerified:false,
  actualTradesPlaced:0,calibratedProbability:null
 };
}
function auditWitnessQuotes({reconciliation,witnesses,late}){
 if(!reconciliation||reconciliation.independentQualifiedCount!==0||
    reconciliation.ordersEnabled!==false||!Array.isArray(reconciliation.matched)||
    !Array.isArray(witnesses))
  throw Error('Unsafe public witness quote research inputs');
 const originals=new Map(verifiedJournal(late,'late').map(x=>[x.e.hash,x.e]));
 const byRun=new Map();
 for(const w of witnesses){
  try{validObservation(w)}catch{continue}
  byRun.set(String(w.githubRunId),w);
 }
 const matched=reconciliation.matched.map(row=>{
  if(row.model!==MODEL||!['YES','NO'].includes(row.witnessedSide))
   return row;
  const sample=classifyQuote(row,
   byRun.get(String(row.witnessGitHubRunId||'')),
   originals.get(row.observedCommitmentHash));
  return {...row,witnessMarketQuote:sample};
 });
 const eligible=matched.filter(x=>x.model===MODEL&&['YES','NO'].includes(x.witnessedSide));
 const samples=eligible.map(x=>x.witnessMarketQuote);
 const checked=samples.filter(x=>x&&x.sidePublicAskAtGHWitness!==null);
 const known=checked.filter(x=>x.displayedSizeAtGHWitness!==null);
 const report={
  version:'CASH_PREEXPIRY_WITNESS_PUBLIC_QUOTE_SIZE_COVERAGE_V1',
  lateDirectionalWitnesses:eligible.length,
  witnessedPublicAsksAvailable:checked.length,
  withUnknownAskOrUncorroborated:eligible.length-checked.length,
  witnessedSelectedSideAskWithDisplayedSize:known.length,
  observedDisplayedSizeAtLeastOne:known.filter(x=>x.displayedSizeAtGHWitness>=1).length,
  observedDisplayedSizeBelowOne:known.filter(x=>x.displayedSizeAtGHWitness<1).length,
  observedAskWithMissingSize:checked.filter(x=>x.displayedSizeAtGHWitness===null).length,
  selectedSideAskAtOrAbove99Cents:checked.filter(x=>x.sidePublicAskAtGHWitness>=.99).length,
  publicAskWorsenedSinceFreeze:checked.filter(x=>x.publicAskChangedAgainstBuyer===true).length,
  publicAskImprovedSinceFreeze:checked.filter(x=>x.publicAskChangedInBuyersFavor===true).length,
  freezeQuoteNotComparable:checked.filter(x=>x.frozenPublicAskAtModelDecision===null).length,
  noActualOrdersVerified:true,oneContractFillVerifications:0,
  independentlyQualifiedCount:0,
  caution:'Public Kalshi market ask and displayed size fetched directly by GitHub AFTER the forecast freeze but BEFORE expiry. These are NOT frozen asks, guaranteed executable one-contract depth, trades, calibrated probabilities, or official BRTI feature verification. Do NOT substitute witness quotes into frozen-price paper PnL.'
 };
 return {...reconciliation,matched,witnessMarketQuoteCoverage:report,
  independentQualifiedCount:0,executionVerified:false,ordersEnabled:false};
}
module.exports={classifyQuote,auditWitnessQuotes};
