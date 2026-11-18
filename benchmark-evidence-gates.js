'use strict';
/*
 * Fail-closed bridge from validated archive identities to offline benchmark
 * candidates. No archive alone proves a complete chronological denominator.
 */
const {comparePrecommittedCohorts}=require('./paired-model-benchmark');
const MARKET=/^KXBTC15M-[A-Za-z0-9-]{6,70}$/;
const HASH=/^[a-f0-9]{64}$/;
function auditBenchmarkInputs({baseline,candidate}={}){
 if(!Array.isArray(baseline)||!Array.isArray(candidate)||
    baseline.length!==candidate.length||baseline.length>100000)
  throw Error('Benchmark evidence inputs must be bounded paired arrays');
 const failures={missingWitness:0,missingSettlement:0,missingSource:0,
  frozenIdentityConflict:0,missingPrecloseCorroboration:0};
 const seen=new Set(),base=[],trial=[];
 for(let i=0;i<baseline.length;i++){
  const a=baseline[i],b=candidate[i];
  if(!a||!b||!MARKET.test(a.marketId||'')||a.marketId!==b.marketId||
     seen.has(a.marketId)||!['YES','NO','WAIT','MISSING'].includes(a.side)||
     !['YES','NO','WAIT','MISSING'].includes(b.side)||
     !['YES','NO',null].includes(a.winner)||a.winner!==b.winner)
   throw Error('Evidence adapter requires unique paired market and common outcome');
  seen.add(a.marketId);
  for(const x of [a,b]){
   if(x.sourcePresent!==true)failures.missingSource++;
   if(x.witnessPresent!==true)failures.missingWitness++;
   if(x.directPrecloseCorroborated!==true)failures.missingPrecloseCorroboration++;
   if(!HASH.test(x.sourceFrozenHash||'')||x.sourceFrozenHash!==x.witnessFrozenHash)
    failures.frozenIdentityConflict++;
   if(x.winner===null||x.directTwoReadSettlementVerified!==true)
    failures.missingSettlement++;
  }
  const outcome=a.winner===null?'PENDING':a.winner;
  base.push({marketId:a.marketId,side:a.side,outcome});
  trial.push({marketId:b.marketId,side:b.side,outcome});
 }
 const descriptive=comparePrecommittedCohorts({baseline:base,candidate:trial});
 return {...descriptive,version:'CASH_BENCHMARK_EVIDENCE_GATES_V1',
  evidenceGaps:failures,
  completeEvidenceForSuppliedRows:Object.values(failures).every(x=>x===0),
  fullEligibleMarketDenominatorVerified:false,
  chronologicalHoldoutVerified:false,independentQualificationCount:0,
  ordersEnabled:false,
  note:'Rows are supplied by caller; this module cannot verify GitHub run provenance, chronological eligibility, complete feed coverage or independence. Missing witness or settlement remains in paired descriptive denominator, never a certified accuracy result.'};
}
module.exports={auditBenchmarkInputs};
