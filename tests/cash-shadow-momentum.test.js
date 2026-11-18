'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {shadowMomentumForecast,ID}=require('../cash-shadow-momentum');
const history=Array.from({length:14},(_,i)=>({ts:1000+i*15000,price:100+i*.1}));
const base={samples:history,asOfMs:196000,marketId:'KXBTC15M-TEST123',strikePrice:99,leadSeconds:300};
test('shadow candidate is deterministic and never permits execution',()=>{
 const a=shadowMomentumForecast(base),b=shadowMomentumForecast(base);
 assert.deepEqual(a,b);
 assert.equal(a.modelId,ID);
 assert.equal(a.side,'YES');
 assert.equal(a.executionAllowed,false);
 assert.equal(a.probability,null);
 assert.equal(a.calibrated,false);
});
test('insufficient history abstains without inventing probability',()=>{
 const r=shadowMomentumForecast({...base,samples:history.slice(-4)});
 assert.equal(r.side,'WAIT');
 assert.equal(r.reason,'INSUFFICIENT_HISTORY');
 assert.equal(r.probability,null);
});
test('stale or future samples and invalid horizons fail closed',()=>{
 assert.throws(()=>shadowMomentumForecast({...base,asOfMs:300000}));
 assert.throws(()=>shadowMomentumForecast({...base,leadSeconds:30}));
 assert.throws(()=>shadowMomentumForecast({...base,asOfMs:190000}));
});
