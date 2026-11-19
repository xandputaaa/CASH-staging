'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {evaluateShadow}=require('../shadow-benchmark');
const sample=[
 {model:'baseline',contractId:'A',predictedProbability:0.8,outcome:1,forecastAt:1,settledAt:2},
 {model:'baseline',contractId:'B',predictedProbability:0.7,outcome:0,forecastAt:3,settledAt:4},
 {model:'candidate',contractId:'A',predictedProbability:0.6,outcome:1,forecastAt:1,settledAt:2}
];
test('scores models separately with Brier and accuracy, never invents PnL',()=>{
 const result=evaluateShadow(sample);
 assert.equal(result[0].model,'baseline');
 assert.equal(result[0].independentContracts,2);
 assert.equal(result[0].directionalAccuracy,0.5);
 assert.ok(Math.abs(result[0].meanBrier-0.265)<1e-10);
 assert.equal(result[0].executionPnl,'NOT_MEASURED');
 assert.equal(result[1].independentContracts,1);
});
test('rejects duplicated contract per model but permits fair model comparison',()=>{
 assert.throws(()=>evaluateShadow([sample[0],sample[0]]),/duplicate/);
 assert.equal(evaluateShadow([sample[0],sample[2]]).length,2);
});
test('rejects future leakage, missing settlement and invalid probabilities',()=>{
 assert.throws(()=>evaluateShadow([{...sample[0],forecastAt:2}]),/precede/);
 assert.throws(()=>evaluateShadow([{...sample[0],outcome:null}]),/settled/);
 assert.throws(()=>evaluateShadow([{...sample[0],predictedProbability:1.2}]),/probability/);
});
