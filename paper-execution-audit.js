'use strict';
/*
 * Historical, read-only economics of ONE hypothetical Kalshi KXBTC15M
 * taker buy at the PUBLIC quote available at the frozen forecast time.
 * Not a fill, an executable order, expected value or an investment signal.
 * No market depth, slippage, market-specific overrides or member fees known.
 */
const {takerPreview}=require('./kalshi-fees');
const STATUSES=new Set(['PENDING','HIT','MISS','WAIT_RESOLVED','VOID']);
const CUTOFF_MS=12000;
const round4=x=>Math.round((x+Number.EPSILON)*10000)/10000;
function centsCeil(x){return Math.ceil((x-1e-12)*100)/100}
function oneContractPaper(record){
 const fail=(reason)=>({state:reason,eligible:false,
  payoutVerified:false,netAfterFees:null,realOrdersEnabled:false});
 if(!record||!['YES','NO',null].includes(record.side)||
    !STATUSES.has(record.status))return fail('RECORD_NOT_ELIGIBLE');
 if(record.side===null)return fail('ABSTAINED_WAIT');
 const freeze=Date.parse(record.at),seen=Date.parse(record.publicAskQuoteFetchedAt);
 if(!Number.isFinite(freeze)||!Number.isFinite(seen)||seen>freeze+2000||
    freeze-seen>CUTOFF_MS)return fail('UNVERIFIABLE_PRE_CLOSE_QUOTE_TIME');
 const fee=record.feeScheduleAtFreeze;
 if(!fee||fee.source!=='KALSHI_PUBLIC_SERIES_API'||
  !['quadratic','quadratic_with_maker_fees'].includes(fee.feeType)||
  !Number.isFinite(fee.multiplier)||fee.multiplier<0||fee.multiplier>5)
  return fail('NO_VERIFIED_SERIES_FEE_MULTIPLIER');
 const feeAt=Date.parse(fee.refreshedAt);
 if(!Number.isFinite(feeAt)||feeAt>freeze+2000||freeze-feeAt>300000)
  return fail('SERIES_FEE_METADATA_STALE');
 const ask=record.publicAskAtFreeze?.[record.side];
 const x=takerPreview(ask,fee.multiplier,1);
 if(!x)return fail('PUBLIC_SELECTED_SIDE_ASK_MISSING');
 const feeCentUpper=centsCeil(x.feeBeforeRounding);
 const lowerNetFee=x.fee,upperNetFee=feeCentUpper;
 const base={
  state:'QUOTED_UNFILLED_PAPER_BUY',eligible:true,
  contractsAssumed:1,selectedSide:record.side,
  observedAsk:ask,observedAt:record.publicAskQuoteFetchedAt,
  feeMetadataObservedAt:fee.refreshedAt,
  takerFeeCentiCent:lowerNetFee,takerFeeConservativeCent:upperNetFee,
  totalAssumedCostLow:round4(ask+lowerNetFee),
  totalAssumedCostHigh:round4(ask+upperNetFee),
  breakEvenHitRateLow:round4(ask+lowerNetFee),
  breakEvenHitRateHigh:round4(ask+upperNetFee),
  grossMaxPayout:1,feeMultiplierAtFreeze:fee.multiplier,
  feeSchedule:'KALSHI_GENERAL_QUADRATIC_JUL_2026_ASSUMPTION',
  feeModelUnconfirmedEventOverrides:true,
  executableQuoteConfirmed:false,marketDepthKnown:false,
  feesFinalAccountVerified:false,realOrdersEnabled:false,
  expectedValue:null,calibratedWinProbability:null,
  payoutVerified:false,netAfterFees:null
 };
 if(record.status==='PENDING')
  return {...base,state:'AWAITING_FINAL_RESULT'};
 if(record.status==='VOID')
  return {...base,state:'VOID_EXCLUDED'};
 if(!['YES','NO'].includes(record.winner)||
   (record.status==='HIT'&&record.winner!==record.side)||
   (record.status==='MISS'&&record.winner===record.side)||
   !['HIT','MISS'].includes(record.status))
  return fail('INCONSISTENT_RESULT');
 const paid=record.status==='HIT'?1:0;
 const conservative=round4(paid-ask-upperNetFee);
 const optimistic=round4(paid-ask-lowerNetFee);
 return {...base,state:'SETTLED_COUNTERFACTUAL_ONLY',
  payoutVerified:true,winner:record.winner,
  netAfterFees:{lower:conservative,upper:optimistic},
  warning:'These are hypothetical outcomes conditional on a 1-contract fill at a past public ask. No observed order, fill, liquidity, slippage, member-specific fees, or independently witnessed prediction.'};
}
function paperSummary(records){
 if(!Array.isArray(records))throw Error('Paper research records must be array');
 const tally={
  version:'CASH_PAPER_EXECUTION_AUDIT_V1',totalFrozen:records.length,
  directional:0,waits:0,quoteAndFeeObserved:0,unpriced:0,
  pendingResultsWithQuote:0,pricedVoids:0,pricedSettlements:0,
  paperWins:0,paperLosses:0,
  conservativePnlDollars:null,optimisticPnlDollars:null,
  negativeNetWins:0,
  bySource:{publicSpotProxy:{pricedSettlements:0,conservativePnlDollars:null},
   officialBrtiLive:{pricedSettlements:0,conservativePnlDollars:null}},
  tradingAuthorized:false,realOrdersEnabled:false,independentQualification:0,
  title:'Hypothetical one-contract buys using observed public asks',
  warning:'NOT actual trades, fills, backtest-validated PnL or expected value. Price may have moved; depth/slippage, override fees and actual member costs unknown. Missing quotes are EXCLUDED, never treated as free or winning fills.'
 };
 let lower=0,upper=0,priced=0;
 const bucket={publicSpotProxy:{lower:0},officialBrtiLive:{lower:0}};
 for(const r of records){
  if(r.side===null){tally.waits++;continue}
  tally.directional++;
  const p=oneContractPaper(r);
  if(!p.eligible){tally.unpriced++;continue}
  tally.quoteAndFeeObserved++;
  if(p.state==='AWAITING_FINAL_RESULT'){tally.pendingResultsWithQuote++;continue}
  if(p.state==='VOID_EXCLUDED'){tally.pricedVoids++;continue}
  if(p.state!=='SETTLED_COUNTERFACTUAL_ONLY'||!p.netAfterFees){
   tally.unpriced++;tally.quoteAndFeeObserved--;continue;
  }
  priced++;lower+=p.netAfterFees.lower;upper+=p.netAfterFees.upper;
  tally.paperWins+=(r.status==='HIT'?1:0);
  tally.paperLosses+=(r.status==='MISS'?1:0);
  if(r.status==='HIT'&&p.netAfterFees.lower<=0)tally.negativeNetWins++;
  const src=r.indexSourceType==='OFFICIAL_BRTI_LIVE'?'officialBrtiLive':'publicSpotProxy';
  bucket[src].lower+=p.netAfterFees.lower;
  tally.bySource[src].pricedSettlements++;
 }
 tally.pricedSettlements=priced;
 if(priced){
  tally.conservativePnlDollars=round4(lower);
  tally.optimisticPnlDollars=round4(upper);
  for(const k of Object.keys(bucket)){
   if(tally.bySource[k].pricedSettlements>0)
    tally.bySource[k].conservativePnlDollars=round4(bucket[k].lower);
  }
 }
 return tally;
}
module.exports={oneContractPaper,paperSummary};
