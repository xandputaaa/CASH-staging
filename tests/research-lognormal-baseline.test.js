'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {benchmark}=require('../research-lognormal-baseline');
const now=Date.parse('2026-11-19T20:00:00Z');
const valid={spot:100000,strike:100000,volatilityPerSqrtSecond:0.0001,secondsRemaining:300,observedAt:now,inputLatestAt:now-1000};
test('benchmark is bounded and explicitly research only',()=>{
 const r=benchmark(valid);
 assert.equal(r.status,'RESEARCH_BASELINE_ONLY');
 assert.ok(r.probabilityYes>0&&r.probabilityYes<1);
 assert.ok(Math.abs(r.probabilityYes+r.probabilityNo-1)<1e-12);
 assert.equal(r.tradeSignal,false);assert.equal(r.independentlyQualified,false);
 assert.equal(r.calibrated,false);assert.equal(r.realOrdersEnabled,false);
});
test('increasing spot increases the baseline probability',()=>{
 assert.ok(benchmark({...valid,spot:101000}).probabilityYes>benchmark(valid).probabilityYes);
 assert.ok(benchmark({...valid,spot:99000}).probabilityYes<benchmark(valid).probabilityYes);
});
test('rejects future, stale, missing, invalid and near-expiry inputs',()=>{
 for(const v of [{inputLatestAt:now+1},{inputLatestAt:now-60001},{secondsRemaining:30},{spot:0},{volatilityPerSqrtSecond:0},{volatilityPerSqrtSecond:Infinity},{strike:NaN},{observedAt:undefined}]){
  const r=benchmark({...valid,...v});assert.equal(r.status,'BLOCKED');assert.equal(r.probabilityYes,null);
 }
});
