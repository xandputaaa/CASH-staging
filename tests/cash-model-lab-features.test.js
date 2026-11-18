'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {extractSpotFeatures}=require('../cash-model-lab-features');
const history=[{ts:1000,price:100},{ts:2000,price:101},{ts:3000,price:102},{ts:4000,price:103}];
test('extracts deterministic label-free spot features',()=>{
 const f=extractSpotFeatures(history,{asOfMs:4500});
 assert.equal(f.sampleCount,4);
 assert.equal(f.spotPrice,103);
 assert.equal(f.lastSampleAgeMs,500);
 assert.equal(f.labelFree,true);
 assert.equal(f.tradeSignal,false);
 assert.ok(f.momentumBps>0);
});
test('rejects future timestamps and stale observations',()=>{
 assert.throws(()=>extractSpotFeatures(history,{asOfMs:3500}));
 assert.throws(()=>extractSpotFeatures(history,{asOfMs:20000,maxAgeMs:1000}));
});
test('rejects unordered and invalid prices',()=>{
 assert.throws(()=>extractSpotFeatures([...history.slice(0,3),{ts:2500,price:103}],{asOfMs:4500}));
 assert.throws(()=>extractSpotFeatures([...history.slice(0,3),{ts:4000,price:0}],{asOfMs:4500}));
});
