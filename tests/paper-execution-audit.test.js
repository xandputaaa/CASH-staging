'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {oneContractPaper,paperSummary}=require('../paper-execution-audit');
const freeze='2026-11-17T22:01:00Z';
function rec(opts={}){
 return {marketId:'KXBTC15M-TEST-15',side:'YES',status:'HIT',
  winner:'YES',at:freeze,indexSourceType:'SINGLE_EXCHANGE_PROXY',
  publicAskQuoteFetchedAt:'2026-11-17T22:00:58Z',
  publicAskAtFreeze:{YES:.5,NO:.51},
  feeScheduleAtFreeze:{
   source:'KALSHI_PUBLIC_SERIES_API',feeType:'quadratic',
   multiplier:1,refreshedAt:'2026-11-17T21:59:00Z'
  },...opts};
}
test('one-contract 50-cent YES win includes centicent fee and more conservative cent rounding',()=>{
 const p=oneContractPaper(rec());
 assert.equal(p.state,'SETTLED_COUNTERFACTUAL_ONLY');
 assert.equal(p.selectedSide,'YES');
 assert.equal(p.observedAsk,.5);
 assert.equal(p.takerFeeCentiCent,.0175);
 assert.equal(p.takerFeeConservativeCent,.02);
 assert.deepEqual(p.netAfterFees,{lower:.48,upper:.4825});
 assert.equal(p.breakEvenHitRateHigh,.52);
 assert.equal(p.executableQuoteConfirmed,false);
 assert.equal(p.realOrdersEnabled,false);
 assert.equal(p.expectedValue,null);
});
test('one-contract high-ask YES winner can yield ZERO net after conservative fee assumption',()=>{
 const p=oneContractPaper(rec({publicAskAtFreeze:{YES:.99,NO:.02}}));
 assert.equal(p.state,'SETTLED_COUNTERFACTUAL_ONLY');
 assert.equal(p.netAfterFees.lower,0);
 assert.equal(p.netAfterFees.upper,.0093);
 assert.equal(p.breakEvenHitRateHigh,1);
});
test('a wrong side loses full hypothetical cost and taker fee even with direction signal',()=>{
 const p=oneContractPaper(rec({status:'MISS',winner:'NO',side:'YES'}));
 assert.equal(p.state,'SETTLED_COUNTERFACTUAL_ONLY');
 assert.deepEqual(p.netAfterFees,{lower:-.52,upper:-.5175});
});
test('WAIT, pending and void are not fabricated trades or settled gains',()=>{
 const abstained=oneContractPaper(rec({side:null,status:'WAIT_RESOLVED'}));
 assert.equal(abstained.state,'ABSTAINED_WAIT');
 assert.equal(abstained.eligible,false);
 assert.equal(abstained.netAfterFees,null);
 const pending=oneContractPaper(rec({status:'PENDING',winner:null}));
 assert.equal(pending.state,'AWAITING_FINAL_RESULT');
 assert.equal(pending.payoutVerified,false);
 assert.equal(pending.netAfterFees,null);
 const v=oneContractPaper(rec({status:'VOID',winner:'VOID'}));
 assert.equal(v.state,'VOID_EXCLUDED');
 assert.equal(v.netAfterFees,null);
});
test('unpriced, stale, unsupported or future quotes never imply a zero-cost fill',()=>{
 const invalid=[
  {publicAskAtFreeze:{YES:null,NO:.2}},
  {publicAskQuoteFetchedAt:'2026-11-17T21:59:00Z'},
  {publicAskQuoteFetchedAt:'2026-11-17T22:01:15Z'},
  {feeScheduleAtFreeze:null},
  {feeScheduleAtFreeze:{source:'KALSHI_PUBLIC_SERIES_API',feeType:'quadratic',multiplier:1,refreshedAt:'2026-11-17T21:50:00Z'}},
  {feeScheduleAtFreeze:{source:'MYSTERY',feeType:'quadratic',multiplier:1,refreshedAt:freeze}},
  {feeScheduleAtFreeze:{source:'KALSHI_PUBLIC_SERIES_API',feeType:'quadratic',multiplier:-1,refreshedAt:freeze}},
  {status:'HIT',winner:'NO'}
 ];
 for(const patch of invalid){
  const p=oneContractPaper(rec(patch));
  assert.equal(p.eligible,false,JSON.stringify(patch));
  assert.equal(p.netAfterFees,null,JSON.stringify(patch));
 }
});
test('NO side exclusively uses NO ask, and no later reassessment can modify the paper price',()=>{
 const p=oneContractPaper(rec({side:'NO',winner:'NO',publicAskAtFreeze:{YES:.99,NO:.12}}));
 assert.equal(p.observedAsk,.12);
 assert.equal(p.selectedSide,'NO');
 assert.equal(p.breakEvenHitRateHigh,.13);
});
test('paper cohort summary includes only separately priced resolved claims, not missing ones',()=>{
 const rows=[
  rec({marketId:'a'}),
  rec({marketId:'b',side:'NO',status:'MISS',winner:'YES',
   publicAskAtFreeze:{YES:.9,NO:.5},indexSourceType:'OFFICIAL_BRTI_LIVE'}),
  rec({marketId:'c',side:'NO',status:'PENDING',winner:null}),
  rec({marketId:'d',side:null,status:'WAIT_RESOLVED'}),
  rec({marketId:'e',side:'YES',status:'HIT',winner:'YES',
   publicAskAtFreeze:{YES:null,NO:.2}}),
  rec({marketId:'f',side:'NO',status:'VOID',winner:'VOID'})
 ];
 const s=paperSummary(rows);
 assert.equal(s.totalFrozen,6);
 assert.equal(s.directional,5);
 assert.equal(s.waits,1);
 assert.equal(s.unpriced,1);
 assert.equal(s.pricedSettlements,2);
 assert.equal(s.paperWins,1);
 assert.equal(s.paperLosses,1);
 assert.equal(s.pendingResultsWithQuote,1);
 assert.equal(s.pricedVoids,1);
 assert.equal(s.conservativePnlDollars,-.04);
 assert.equal(s.optimisticPnlDollars,-.035);
 assert.equal(s.bySource.publicSpotProxy.pricedSettlements,1);
 assert.equal(s.bySource.officialBrtiLive.pricedSettlements,1);
 assert.equal(s.independentQualification,0);
 assert.equal(s.tradingAuthorized,false);
});
test('no priced outcomes means null PnL, not a claim of profit',()=>{
 const s=paperSummary([rec({marketId:'a',side:null,status:'WAIT_RESOLVED'})]);
 assert.equal(s.pricedSettlements,0);
 assert.equal(s.conservativePnlDollars,null);
 assert.equal(s.optimisticPnlDollars,null);
});
