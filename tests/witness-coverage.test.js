'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {summarizeWitnessCoverage}=require('../witness-coverage');
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const ids=[
 'KXBTC15M-26NOV171900-00','KXBTC15M-26NOV171915-15',
 'KXBTC15M-26NOV171930-30','KXBTC15M-26NOV171945-45',
 'KXBTC15M-26NOV172000-00'
];
const models={early:'KXBTC15M_SETTLEMENT_EARLY_V3',
 late:'KXBTC15M_LATE_CHECKPOINT_SHADOW_V1'};
function journal(kind,items=[]){
 let head='GENESIS',events=[];
 for(const [i,p] of items.entries()){
  const event={
   sequence:i+1,type:'FORECAST',recordedAt:'2026-11-17T23:41:00Z',
   payload:{marketId:p.marketId,model:models[kind],
    indexSourceType:p.indexSourceType||'SINGLE_EXCHANGE_PROXY',
    side:p.side,at:'2026-11-17T23:41:00Z',endTime:'2026-11-17T23:45:00Z'},
   previousHash:head
  };
  event.hash=digest(event);head=event.hash;events.push(event);
 }
 return {
  version:kind==='early'?'CASH_PROSPECTIVE_KALSHI_V1':'CASH_LATE_CHECKPOINT_SHADOW_V1',
  format:kind==='early'?'CASH_PROSPECTIVE_HASHED_SESSION_V1':
   'CASH_LATE_CHECKPOINT_UNVERIFIED_HASH_CHAIN_V1',
  records:events.length,pending:events.length,headHash:head,events,
  independentlyTimeAttested:false,
  ...(kind==='early'?{
   qualifiedCount:0,tradingAuthorized:false,automatedOrdersEnabled:false
  }:{
   independentQualification:0,realMoneyAuthorized:false,canExecuteOrders:false
  })
 };
}
function row(kind,marketId,side,state,opts={}){
 return {model:models[kind],marketId,
  witnessedSide:side===null?'WAIT':side,observedCommitmentHash:'a'.repeat(64),
  state,directlyCheckedPublicMarket:false,...opts};
}
function report(matched=[]){
 return {version:'CASH_PROVISIONAL_EXTERNAL_WITNESS_RECONCILIATION_V1',
  matched,independentQualifiedCount:0,ordersEnabled:false};
}
test('all frozen YES/NO calls remain denominator: one externally witnessed hit cannot erase unseen predictions',()=>{
 const early=journal('early',[
  {marketId:ids[0],side:null},{marketId:ids[1],side:null}
 ]);
 const late=journal('late',[
  {marketId:ids[0],side:'NO'},{marketId:ids[1],side:'YES'},
  {marketId:ids[2],side:'NO'},{marketId:ids[3],side:null},
  {marketId:ids[4],side:null}
 ]);
 const r=summarizeWitnessCoverage({early,late,reconciliation:report([
  row('late',ids[0],'NO','OBSERVED_DIRECTIONAL_HIT',{
   directlyCheckedPublicMarket:true,
   directFinalStatus:'DIRECT_FINAL_TWO_READ_JOURNAL_HASH_MATCH'
  }),
  row('late',ids[3],null,'OBSERVED_WAIT_RESOLVED'),
  row('early',ids[0],null,'OBSERVED_WAIT_RESOLVED')
 ])});
 const l=r.groups.late,e=r.groups.early;
 assert.equal(l.allFrozen,5);
 assert.equal(l.publicProxyDirectional,3);
 assert.equal(l.matchedDirectionalWitnesses,1);
 assert.equal(l.publicProxyDirectionalWithoutMatchedWitness,2);
 assert.equal(l.witnessedDirectionalHits,1);
 assert.equal(l.witnessedDirectionalMisses,0);
 assert.equal(l.directlyRecheckedFinalDirectional,1);
 assert.equal(l.finalSourceFieldHashMatches,1);
 assert.equal(l.directMarketMatchedDirectional,1);
 assert.equal(l.matchedWaitWitnesses,1);
 assert.equal(l.publicProxyWaitWithoutMatchedWitness,1);
 assert.equal(l.observedDirectionalFractionOfPublicFrozen,1/3);
 assert.equal(e.allWait,2);
 assert.equal(e.witnessedWaitResolved,1);
 assert.equal(e.publicProxyWaitWithoutMatchedWitness,1);
 assert.equal(r.distinctMarketIdentifiersInCurrentSession,5);
 assert.equal(r.modelsAreNotIndependentContracts,true);
 assert.equal(r.independentlyQualifiedCount,0);
 assert.equal(r.realOrdersEnabled,false);
});
test('licensed BRTI is NEVER silently counted as public-proxy witness coverage',()=>{
 const early=journal('early',[]);
 const late=journal('late',[
  {marketId:ids[0],side:'YES',indexSourceType:'OFFICIAL_BRTI_LIVE'},
  {marketId:ids[1],side:'NO'},
  {marketId:ids[2],side:null,indexSourceType:'OTHER_UNKNOWN'}
 ]);
 const r=summarizeWitnessCoverage({early,late,reconciliation:report([
  row('late',ids[0],'YES','OBSERVED_DIRECTIONAL_HIT')
 ])});
 const l=r.groups.late;
 assert.equal(l.allFrozen,3);
 assert.equal(l.allDirectional,2);
 assert.equal(l.publicProxyDirectional,1);
 assert.equal(l.excludedLicensedBrti,1);
 assert.equal(l.excludedOtherSource,1);
 assert.equal(l.matchedDirectionalWitnesses,0);
 assert.equal(l.publicProxyDirectionalWithoutMatchedWitness,1);
 assert.equal(l.witnessedDirectionalHits,0);
 assert.equal(r.independentlyQualifiedCount,0);
});
test('unconfirmed, disputed or altered side witness is not a verified pre-expiry capture',()=>{
 const early=journal('early',[]);
 const late=journal('late',[
  {marketId:ids[0],side:'NO'},
  {marketId:ids[1],side:'YES'},
  {marketId:ids[2],side:'NO'},
  {marketId:ids[3],side:'YES'}
 ]);
 const r=summarizeWitnessCoverage({early,late,reconciliation:report([
  row('late',ids[0],'YES','OBSERVED_DIRECTIONAL_MISS'),
  row('late',ids[1],'YES','FORECAST_COMMITMENT_NOT_RECONCILED'),
  row('late',ids[2],'NO','DIRECT_EXCHANGE_FROZEN_STRIKE_CONFLICT'),
  row('late',ids[3],'YES','OUTCOME_PENDING',{directlyCheckedPublicMarket:true})
 ])});
 const l=r.groups.late;
 assert.equal(l.rejectedWitnessMatch,2);
 assert.equal(l.matchedDirectionalWitnesses,1);
 assert.equal(l.publicProxyDirectionalWithoutMatchedWitness,3);
 assert.equal(l.witnessedDirectionalUnresolvedOrRejected,1);
 assert.equal(l.directMarketMatchedDirectional,1);
 assert.equal(l.witnessedDirectionalHits,0);
 assert.equal(l.witnessedDirectionalMisses,0);
});
test('real witnessed wrong directional call counts a MISS, not omitted from coverage',()=>{
 const early=journal('early',[]);
 const late=journal('late',[
  {marketId:ids[0],side:'NO'},
  {marketId:ids[1],side:'YES'}
 ]);
 const r=summarizeWitnessCoverage({early,late,reconciliation:report([
  row('late',ids[0],'NO','OBSERVED_DIRECTIONAL_MISS')
 ])});
 assert.equal(r.groups.late.witnessedDirectionalMisses,1);
 assert.equal(r.groups.late.matchedDirectionalWitnesses,1);
 assert.equal(r.groups.late.publicProxyDirectionalWithoutMatchedWitness,1);
 assert.equal(r.groups.late.observedDirectionalFractionOfPublicFrozen,.5);
});
test('empty public sessions have null directional coverage, NOT a fabricated accuracy percentage',()=>{
 const r=summarizeWitnessCoverage({
  early:journal('early',[]),late:journal('late',[]),reconciliation:report([])
 });
 assert.equal(r.groups.late.observedDirectionalFractionOfPublicFrozen,null);
 assert.equal(r.groups.early.observedDirectionalFractionOfPublicFrozen,null);
 assert.equal(r.groups.late.publicProxyDirectional,0);
 assert.equal(r.groups.late.witnessedDirectionalHits,0);
 assert.equal(r.calibrated,false);
});
test('tampered event chain or unauthorized certification fails closed',()=>{
 const early=journal('early',[]),late=journal('late',[
  {marketId:ids[0],side:'NO'}
 ]);
 late.events[0].payload.side='YES';
 assert.throws(()=>summarizeWitnessCoverage({
  early,late,reconciliation:report([])
 }),/checksum mismatch/);
 const validLate=journal('late',[{marketId:ids[0],side:'NO'}]);
 assert.throws(()=>summarizeWitnessCoverage({
  early,late:validLate,
  reconciliation:{...report([]),independentQualifiedCount:100}
 }),/Missing hash-checked/);
});

test('a correct witnessed forecast can have negative conservative paper net at a 0.995 ask',()=>{
 const early=journal('early',[]);
 const late=journal('late',[
  {marketId:ids[0],side:'NO'},
  {marketId:ids[1],side:'NO'},
  {marketId:ids[2],side:'YES'}
 ]);
 const won=(id,ask,netLow,be)=>row('late',id,'NO','OBSERVED_DIRECTIONAL_HIT',{
  directlyCheckedPublicMarket:true,
  directFinalStatus:'DIRECT_FINAL_TWO_READ_JOURNAL_HASH_MATCH',
  witnessedPaper:{
   state:'WITNESSED_QUOTED_COUNTERFACTUAL_ONLY',
   observedAsk:ask,selectedSide:'NO',
   breakEvenHitRateHigh:be,
   netAfterFees:{lower:netLow,upper:netLow+.002},
   executableQuoteConfirmed:false,
   actualFillConfirmed:false,
   actualProfitVerified:false
  }
 });
 const a=summarizeWitnessCoverage({early,late,reconciliation:report([
  won(ids[0],.927,.063,.937),
  won(ids[1],.995,-.005,1.005)
 ])});
 const c=a.groups.late;
 assert.equal(c.witnessedDirectionalHits,2);
 assert.equal(c.witnessedDirectionalPaperPriced,2);
 assert.equal(c.witnessedCorrectPaperProfitableConservative,1);
 assert.equal(c.witnessedCorrectPaperNonpositiveConservative,1);
 assert.equal(c.witnessedPaperBreakEvenAtOrAbove100Pct,1);
 assert.equal(c.publicProxyDirectionalWithoutMatchedWitness,1);
 assert.equal(a.independentlyQualifiedCount,0);
 assert.equal(a.realOrdersEnabled,false);
});
test('scored wrong call remains loss and unpriced win remains explicitly unpriced',()=>{
 const early=journal('early',[]);
 const late=journal('late',[
  {marketId:ids[0],side:'YES'},
  {marketId:ids[1],side:'NO'}
 ]);
 const a=summarizeWitnessCoverage({early,late,reconciliation:report([
  row('late',ids[0],'YES','OBSERVED_DIRECTIONAL_MISS',{
   witnessedPaper:{
    state:'WITNESSED_QUOTED_COUNTERFACTUAL_ONLY',
    breakEvenHitRateHigh:.3,netAfterFees:{lower:-.3,upper:-.29}
   }
  }),
  row('late',ids[1],'NO','OBSERVED_DIRECTIONAL_HIT')
 ])});
 const c=a.groups.late;
 assert.equal(c.witnessedDirectionalMisses,1);
 assert.equal(c.witnessedDirectionalHits,1);
 assert.equal(c.witnessedDirectionalPaperPriced,1);
 assert.equal(c.witnessedScoredDirectionalWithoutPaperPrice,1);
 assert.equal(c.witnessedCorrectPaperProfitableConservative,0);
 assert.equal(c.witnessedCorrectPaperNonpositiveConservative,0);
});
