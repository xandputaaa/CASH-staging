'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createShadowJournal,verifyShadowJournal}=require('../cash-shadow-journal');
const {shadowMomentumForecast}=require('../cash-shadow-momentum');
const samples=Array.from({length:14},(_,i)=>({ts:1000+i*15000,price:100+i*.1}));
const forecast=shadowMomentumForecast({samples,asOfMs:196000,marketId:'KXBTC15M-TEST123',strikePrice:99,leadSeconds:300});
test('isolated journal records deterministic frozen commitments, never qualification',()=>{
 const journal=createShadowJournal();
 journal.append(forecast,{recordedAtMs:196500});
 const snapshot=journal.exportSnapshot();
 assert.equal(verifyShadowJournal(snapshot),true);
 assert.equal(snapshot.independentQualificationCount,0);
 assert.equal(snapshot.independentlyWitnessed,false);
 assert.equal(snapshot.realMoneyOrdersAllowed,false);
 assert.throws(()=>journal.append(forecast,{recordedAtMs:196600}),/duplicate|Invalid/);
});
test('altered commitments and head hashes fail verification',()=>{
 const journal=createShadowJournal();
 journal.append(forecast,{recordedAtMs:196500});
 const snapshot=journal.exportSnapshot();
 snapshot.events[0].side='NO';
 assert.throws(()=>verifyShadowJournal(snapshot));
});
test('late recording and executable forecasts fail closed',()=>{
 const journal=createShadowJournal();
 assert.throws(()=>journal.append(forecast,{recordedAtMs:500000}));
 assert.throws(()=>journal.append({...forecast,executionAllowed:true},{recordedAtMs:196500}));
});
