'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createShadowJournal}=require('../cash-shadow-journal');
const {observeShadowSnapshot}=require('../cash-shadow-observer');
const {shadowMomentumForecast}=require('../cash-shadow-momentum');
const samples=Array.from({length:14},(_,i)=>({ts:1000+i*15000,price:100+i*.1}));
const forecast=shadowMomentumForecast({samples,asOfMs:196000,marketId:'KXBTC15M-TEST123',strikePrice:99,leadSeconds:300});
test('runner clock sees pre-expiry shadow evidence without qualification',()=>{
 const j=createShadowJournal();j.append(forecast,{recordedAtMs:196500});
 const r=observeShadowSnapshot(j.exportSnapshot(),{observedAtMs:200000,runId:'123'});
 assert.equal(r.observedBeforeExpiryCount,1);
 assert.equal(r.independentlyQualifiedCount,0);
 assert.equal(r.realMoneyOrdersAllowed,false);
 assert.equal(r.observedForecasts[0].source,'UNVERIFIED_PUBLIC_SHADOW_JOURNAL');
});
test('runner clock excludes observations after close or too near close',()=>{
 const j=createShadowJournal();j.append(forecast,{recordedAtMs:196500});
 const snapshot=j.exportSnapshot();
 assert.equal(observeShadowSnapshot(snapshot,{observedAtMs:490000}).observedBeforeExpiryCount,0);
 assert.equal(observeShadowSnapshot(snapshot,{observedAtMs:500000}).observedBeforeExpiryCount,0);
});
test('tampered journal cannot be witnessed',()=>{
 const j=createShadowJournal();j.append(forecast,{recordedAtMs:196500});
 const snapshot=j.exportSnapshot();snapshot.events[0].side='NO';
 assert.throws(()=>observeShadowSnapshot(snapshot,{observedAtMs:200000}));
});
