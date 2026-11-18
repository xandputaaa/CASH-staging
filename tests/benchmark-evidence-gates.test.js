'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {auditBenchmarkInputs}=require('../benchmark-evidence-gates');
const id='KXBTC15M-26NOV181200-15',hash='a'.repeat(64);
const record=(side,extras={})=>({marketId:id,side,winner:'YES',
 sourcePresent:true,witnessPresent:true,directPrecloseCorroborated:true,
 sourceFrozenHash:hash,witnessFrozenHash:hash,
 directTwoReadSettlementVerified:true,...extras});
test('complete supplied rows still cannot claim chronological independent qualification',()=>{
 const r=auditBenchmarkInputs({baseline:[record('YES')],candidate:[record('WAIT')]});
 assert.equal(r.completeEvidenceForSuppliedRows,true);
 assert.equal(r.baseline.hits,1);
 assert.equal(r.candidate.waits,1);
 assert.equal(r.fullEligibleMarketDenominatorVerified,false);
 assert.equal(r.chronologicalHoldoutVerified,false);
 assert.equal(r.independentQualificationCount,0);
 assert.equal(r.ordersEnabled,false);
});
test('missing witness, preclose corroboration and settlement stay visible in denominator',()=>{
 const a=record('NO',{witnessPresent:false,directPrecloseCorroborated:false,
  directTwoReadSettlementVerified:false,winner:null});
 const b=record('WAIT',{sourcePresent:false,winner:null,
  sourceFrozenHash:'b'.repeat(64)});
 const r=auditBenchmarkInputs({baseline:[a],candidate:[b]});
 assert.equal(r.baseline.eligible,1);
 assert.equal(r.candidate.eligible,1);
 assert.equal(r.baseline.pending,1);
 assert.equal(r.evidenceGaps.missingWitness,1);
 assert.equal(r.evidenceGaps.missingSource,1);
 assert.equal(r.evidenceGaps.missingPrecloseCorroboration,1);
 assert.equal(r.evidenceGaps.missingSettlement,2);
 assert.equal(r.evidenceGaps.frozenIdentityConflict,1);
 assert.equal(r.completeEvidenceForSuppliedRows,false);
});
test('rejects mismatched markets, winners and duplicate rows',()=>{
 const a=record('YES');
 assert.throws(()=>auditBenchmarkInputs({baseline:[a],candidate:[{...record('NO'),winner:'NO'}]}),/common outcome/);
 assert.throws(()=>auditBenchmarkInputs({baseline:[a,a],candidate:[record('NO'),record('NO')]}),/unique paired/);
 assert.throws(()=>auditBenchmarkInputs({baseline:[a],candidate:[]}),/paired arrays/);
});
