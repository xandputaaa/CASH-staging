'use strict';
/*
 * Denominators for the CURRENT VOLATILE Railway research journal against
 * currently retrieved GitHub pre-expiry observation artifacts.
 *
 * Deliberately NO qualification, no win-rate extrapolation to unwitnessed
 * contracts, and no assumed fill or execution edge.
 */
const {verifiedJournal}=require('./preexpiry-observer');

const MODEL={early:'KXBTC15M_SETTLEMENT_EARLY_V3',
 late:'KXBTC15M_LATE_CHECKPOINT_SHADOW_V1'};
const MATCHES=new Set([
 'OBSERVED_WAIT_RESOLVED','OBSERVED_DIRECTIONAL_HIT',
 'OBSERVED_DIRECTIONAL_MISS','OUTCOME_PENDING',
 'OUTCOME_EVIDENCE_REJECTED','DUPLICATE_OUTCOMES_REJECTED'
]);
const FINAL_DIRECT=new Set([
 'DIRECT_FINAL_TWO_READ_JOURNAL_HASH_MATCH',
 'DIRECT_FINAL_TWO_READ_NUMERIC_MATCH_FIELDS_DIFFER'
]);
function summarizeModel(kind,journal,report){
 const frozen=verifiedJournal(journal,kind).map(x=>x.p);
 const scored=(report?.matched||[]).filter(x=>x.model===MODEL[kind]);
 const byMarket=new Map(scored.map(x=>[x.marketId,x]));
 const counts={
  model:MODEL[kind],
  allFrozen:0,
  allDirectional:0,
  allWait:0,
  publicProxyFrozen:0,
  publicProxyDirectional:0,
  publicProxyWait:0,
  excludedLicensedBrti:0,
  excludedOtherSource:0,
  matchedWitnesses:0,
  matchedDirectionalWitnesses:0,
  matchedWaitWitnesses:0,
  publicProxyDirectionalWithoutMatchedWitness:0,
  publicProxyWaitWithoutMatchedWitness:0,
  directMarketMatchedWitnesses:0,
  directMarketMatchedDirectional:0,
  directlyRecheckedFinalDirectional:0,
  finalSourceFieldHashMatches:0,
  witnessedDirectionalHits:0,
  witnessedDirectionalMisses:0,
  witnessedDirectionalUnresolvedOrRejected:0,
  witnessedDirectionalPaperPriced:0,
  witnessedScoredDirectionalWithoutPaperPrice:0,
  witnessedCorrectPaperProfitableConservative:0,
  witnessedCorrectPaperNonpositiveConservative:0,
  witnessedPaperBreakEvenAtOrAbove100Pct:0,
  witnessedWaitResolved:0,
  rejectedWitnessMatch:0,
  frozenMarketIdsNotInCurrentWitnessSet:[],
  independentlyQualified:0,
  realOrdersEnabled:false
 };
 for(const p of frozen){
  counts.allFrozen++;
  if(p.side===null)counts.allWait++;
  else counts.allDirectional++;
  if(p.indexSourceType!=='SINGLE_EXCHANGE_PROXY'){
   if(p.indexSourceType==='OFFICIAL_BRTI_LIVE')counts.excludedLicensedBrti++;
   else counts.excludedOtherSource++;
   continue;
  }
  counts.publicProxyFrozen++;
  if(p.side===null)counts.publicProxyWait++;
  else counts.publicProxyDirectional++;
  const r=byMarket.get(p.marketId);
  if(r&&!MATCHES.has(r.state))counts.rejectedWitnessMatch++;
  if(!r||!MATCHES.has(r.state)||
    r.observedCommitmentHash===undefined||
    r.witnessedSide!==(p.side===null?'WAIT':p.side)){
   counts.frozenMarketIdsNotInCurrentWitnessSet.push(p.marketId);
   if(p.side===null)counts.publicProxyWaitWithoutMatchedWitness++;
   else counts.publicProxyDirectionalWithoutMatchedWitness++;
   continue;
  }
  counts.matchedWitnesses++;
  if(p.side===null){
   counts.matchedWaitWitnesses++;
   if(r.state==='OBSERVED_WAIT_RESOLVED')counts.witnessedWaitResolved++;
  }else{
   counts.matchedDirectionalWitnesses++;
   if(r.state==='OBSERVED_DIRECTIONAL_HIT')counts.witnessedDirectionalHits++;
   else if(r.state==='OBSERVED_DIRECTIONAL_MISS')counts.witnessedDirectionalMisses++;
   else counts.witnessedDirectionalUnresolvedOrRejected++;
   if(['OBSERVED_DIRECTIONAL_HIT','OBSERVED_DIRECTIONAL_MISS'].includes(r.state)){
    const paper=r.witnessedPaper;
    if(paper?.state==='WITNESSED_QUOTED_COUNTERFACTUAL_ONLY'&&
      Number.isFinite(paper.netAfterFees?.lower)&&
      Number.isFinite(paper.breakEvenHitRateHigh)){
     counts.witnessedDirectionalPaperPriced++;
     if(r.state==='OBSERVED_DIRECTIONAL_HIT'){
      if(paper.netAfterFees.lower>0)
       counts.witnessedCorrectPaperProfitableConservative++;
      else
       counts.witnessedCorrectPaperNonpositiveConservative++;
     }
     if(paper.breakEvenHitRateHigh>=1)
      counts.witnessedPaperBreakEvenAtOrAbove100Pct++;
    }else{
     counts.witnessedScoredDirectionalWithoutPaperPrice++;
    }
   }
   if(FINAL_DIRECT.has(r.directFinalStatus)){
    counts.directlyRecheckedFinalDirectional++;
    if(r.directFinalStatus==='DIRECT_FINAL_TWO_READ_JOURNAL_HASH_MATCH')
     counts.finalSourceFieldHashMatches++;
   }
  }
  if(r.directlyCheckedPublicMarket===true){
   counts.directMarketMatchedWitnesses++;
   if(p.side!==null)counts.directMarketMatchedDirectional++;
  }
 }
 const numericKeys=[
  'allFrozen','allDirectional','allWait','publicProxyFrozen',
  'publicProxyDirectional','publicProxyWait','matchedWitnesses',
  'matchedDirectionalWitnesses','matchedWaitWitnesses',
  'publicProxyDirectionalWithoutMatchedWitness',
  'publicProxyWaitWithoutMatchedWitness',
  'directMarketMatchedDirectional'
 ];
 if(numericKeys.some(k=>!Number.isInteger(counts[k])||counts[k]<0)||
    counts.matchedDirectionalWitnesses+
     counts.publicProxyDirectionalWithoutMatchedWitness!==counts.publicProxyDirectional||
    counts.matchedWaitWitnesses+
     counts.publicProxyWaitWithoutMatchedWitness!==counts.publicProxyWait||
    counts.allDirectional+counts.allWait!==counts.allFrozen||
    counts.witnessedDirectionalPaperPriced+
     counts.witnessedScoredDirectionalWithoutPaperPrice!==
      counts.witnessedDirectionalHits+counts.witnessedDirectionalMisses)
  throw Error('CASH witness denominator invariant violated');
 counts.observedDirectionalFractionOfPublicFrozen=
  counts.publicProxyDirectional?counts.matchedDirectionalWitnesses/counts.publicProxyDirectional:null;
 // Avoid full public market ID exposure in aggregate report: only counts.
 delete counts.frozenMarketIdsNotInCurrentWitnessSet;
 return counts;
}
function summarizeWitnessCoverage({early,late,reconciliation}){
 if(!early||!late||!reconciliation||
    reconciliation.version!=='CASH_PROVISIONAL_EXTERNAL_WITNESS_RECONCILIATION_V1'||
    reconciliation.independentQualifiedCount!==0||
    reconciliation.ordersEnabled!==false||
    !Array.isArray(reconciliation.matched))
  throw Error('Missing hash-checked public reconciliation input');
 const groups={
  early:summarizeModel('early',early,reconciliation),
  late:summarizeModel('late',late,reconciliation)
 };
 const distinctFrozenMarkets=new Set([
  ...verifiedJournal(early,'early').map(x=>x.p.marketId),
  ...verifiedJournal(late,'late').map(x=>x.p.marketId)
 ]).size;
 return {
  version:'CASH_VOLATILE_RESEARCH_WITNESS_COVERAGE_V1',
  denominatorScope:'CURRENT_VOLATILE_RAILWAY_JOURNALS_AND_FETCHED_RECENT_GITHUB_OBSERVATIONS',
  archivalCompletenessProven:false,
  githubRunsAndArtifactsMayBeDelayedSkippedOrExpired:true,
  historicalMissedCapturesMayNotBeRecoverable:true,
  modelsAreNotIndependentContracts:true,
  distinctMarketIdentifiersInCurrentSession:distinctFrozenMarkets,
  groups,
  independentlyQualifiedCount:0,
  realOrdersEnabled:false,
  actualFillsVerified:0,
  calibrated:false,
  explanatoryNote:'Coverage is a bounded cross-section of the current server RAM journal and GitHub observation artifacts retrieved for this reconciliation run. A forecast without a hash-matched pre-expiry witness is UNWITNESSED, not a hit, a miss or independently validated. Licensed BRTI forecasts are excluded from public-proxy witness denominators. No confidence/accuracy claim is inferred from incomplete coverage.'
 };
}
module.exports={summarizeWitnessCoverage,summarizeModel};
