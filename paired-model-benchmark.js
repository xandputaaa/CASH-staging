'use strict';
/*
 * Offline descriptive comparison of precommitted forecast cohorts.
 * Inputs must be constructed from independently audited, timestamped
 * records upstream. This module does not authenticate evidence or promote
 * any strategy into a trading model.
 */
const {wilson95}=require('./prospective-scorecard');
const SIDES=new Set(['YES','NO','WAIT','MISSING']);
function summarizeCohort(rows){
 if(!Array.isArray(rows)||rows.length>100000)throw Error('Invalid bounded benchmark cohort');
 const seen=new Set();
 const counts={eligible:rows.length,directional:0,waits:0,scoredDirectional:0,
  hits:0,misses:0,pending:0,voids:0,missingForecasts:0};
 for(const row of rows){
  if(!row||typeof row.marketId!=='string'||!/^KXBTC15M-[A-Za-z0-9-]{6,70}$/.test(row.marketId)||
   seen.has(row.marketId)||!SIDES.has(row.side)||
   !['YES','NO','PENDING','VOID'].includes(row.outcome))
   throw Error('Invalid or duplicate chronological benchmark market');
  seen.add(row.marketId);
  if(row.side==='WAIT')counts.waits++;
  else if(row.side==='MISSING')counts.missingForecasts++;
  else counts.directional++;
  if(row.outcome==='PENDING')counts.pending++;
  else if(row.outcome==='VOID')counts.voids++;
  else if(row.side==='YES'||row.side==='NO'){
   counts.scoredDirectional++;
   if(row.side===row.outcome)counts.hits++;
   else counts.misses++;
  }
 }
 return {...counts,conditionalHitRate:counts.scoredDirectional?
  counts.hits/counts.scoredDirectional:null,
  directionalCoverage:counts.eligible?counts.directional/counts.eligible:null,
  actualForecastCoverage:counts.eligible?(counts.eligible-counts.missingForecasts)/counts.eligible:null,
  wilson95:wilson95(counts.hits,counts.scoredDirectional)};
}
function comparePrecommittedCohorts({baseline,candidate}={}){
 if(!Array.isArray(baseline)||!Array.isArray(candidate)||
    baseline.length!==candidate.length)throw Error('Benchmark cohorts must share a complete denominator');
 const a=new Map(baseline.map(x=>[x?.marketId,x]));
 const b=new Map(candidate.map(x=>[x?.marketId,x]));
 const base=summarizeCohort(baseline),trial=summarizeCohort(candidate);
 if(a.size!==baseline.length||b.size!==candidate.length||
    [...a.keys()].some(k=>!b.has(k)||a.get(k).outcome!==b.get(k).outcome))
  throw Error('Cohorts have mismatched markets or settlement labels');
 return {version:'CASH_OFFLINE_PAIRED_BENCHMARK_V1',
  baseline:base,candidate:trial,
  sameMarketDenominator:true,chronologicalOrderingVerified:false,
  preExpiryWitnessingVerified:false,precommitmentVerified:false,
  independentQualificationCount:0,ordersEnabled:false,
  note:'Descriptive paired cohort math only. Upstream evidence audit must establish chronological eligibility, frozen model identity, pre-expiry witnessing, settlement provenance, and missing markets. Never use this report alone to promote a trading model.'};
}
module.exports={summarizeCohort,comparePrecommittedCohorts};
