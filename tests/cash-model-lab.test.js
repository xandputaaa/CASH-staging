'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {evaluateShadowCandidate}=require('../cash-model-lab');
test('empty shadow research cannot promote a model or enable trading',()=>{
 const r=evaluateShadowCandidate({baseline:[],candidate:[],candidateId:'CASH_SHADOW_BASELINE_01'});
 assert.equal(r.candidatePromoted,false);
 assert.equal(r.realMoneyOrdersAllowed,false);
 assert.equal(r.independentQualificationCount,0);
 assert.equal(r.baselineModelUnchanged,true);
});
test('candidate ID must be frozen and explicit',()=>{
 assert.throws(()=>evaluateShadowCandidate({baseline:[],candidate:[],candidateId:'best model'}));
});
