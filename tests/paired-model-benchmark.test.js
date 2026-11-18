'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {comparePrecommittedCohorts,summarizeCohort}=require('../paired-model-benchmark');
const id=n=>'KXBTC15M-26NOV18'+String(n).padStart(4,'0')+'-15';
const row=(n,side,outcome)=>({marketId:id(n),side,outcome});
test('paired benchmark preserves WAIT, pending, void and conditional accuracy',()=>{
 const r=comparePrecommittedCohorts({
  baseline:[row(1,'YES','YES'),row(2,'WAIT','NO'),row(3,'NO','YES'),row(4,'WAIT','PENDING'),row(5,'YES','VOID')],
  candidate:[row(1,'WAIT','YES'),row(2,'NO','NO'),row(3,'YES','YES'),row(4,'WAIT','PENDING'),row(5,'NO','VOID')]
 });
 assert.equal(r.baseline.eligible,5);
 assert.equal(r.baseline.waits,2);
 assert.equal(r.baseline.scoredDirectional,2);
 assert.equal(r.baseline.hits,1);
 assert.equal(r.baseline.conditionalHitRate,.5);
 assert.equal(r.candidate.hits,2);
 assert.equal(r.candidate.scoredDirectional,2);
 assert.equal(r.candidate.conditionalHitRate,1);
 assert.equal(r.candidate.directionalCoverage,3/5);
 assert.equal(r.preExpiryWitnessingVerified,false);
 assert.equal(r.independentQualificationCount,0);
 assert.equal(r.ordersEnabled,false);
});
test('rejects missing markets, contradictory outcomes and duplicate markets',()=>{
 const a=[row(1,'YES','YES'),row(2,'NO','NO')];
 assert.throws(()=>comparePrecommittedCohorts({baseline:a,candidate:[row(1,'YES','YES')]}),/denominator/);
 assert.throws(()=>comparePrecommittedCohorts({baseline:a,candidate:[row(1,'YES','YES'),row(3,'NO','NO')]}),/mismatched/);
 assert.throws(()=>comparePrecommittedCohorts({baseline:a,candidate:[row(1,'YES','NO'),row(2,'NO','NO')]}),/mismatched/);
 assert.throws(()=>summarizeCohort([row(1,'YES','YES'),row(1,'YES','YES')]),/duplicate/);
});
test('empty cohorts do not fabricate performance or completeness',()=>{
 const r=comparePrecommittedCohorts({baseline:[],candidate:[]});
 assert.equal(r.baseline.conditionalHitRate,null);
 assert.equal(r.candidate.directionalCoverage,null);
 assert.equal(r.chronologicalOrderingVerified,false);
});
