'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {manualAssist}=require('../manual-live-assist');
const now=Date.parse('2026-11-19T20:00:00Z');
const quote={venue:'Kalshi',marketId:'KXBTC15M-26NOV192000',status:'live',refreshFailed:false,
 fetchedAt:new Date(now-1000).toISOString(),endTime:new Date(now+300000).toISOString(),
 contractRuleStatus:'BRTI_60S_RULE_TEXT_PRESENT',strikeType:'greater_or_equal',tieGoesToYes:true,yesAsk:0.4,noAsk:0.62};
const fees={state:'SERIES_METADATA_LIVE',feeType:'quadratic',feeMultiplier:1,refreshedAt:new Date(now-1000).toISOString()};
test('manual assist displays estimated risk but never permits execution',()=>{
 const r=manualAssist({quote,fees,side:'YES',contracts:2,now});
 assert.equal(r.status,'INFORMATION_ONLY');
 assert.equal(r.realOrdersEnabled,false);
 assert.equal(r.executionAuthorized,false);
 assert.ok(r.estimatedMaxLossUsd>0.8&&r.estimatedMaxLossUsd<1);
});
test('fails closed on stale data and unverified terms',()=>{
 assert.ok(manualAssist({quote:{...quote,fetchedAt:new Date(now-30000).toISOString()},fees,side:'YES',now}).blockers.includes('STALE_QUOTE'));
 assert.ok(manualAssist({quote:{...quote,strikeType:'greater'},fees,side:'YES',now}).blockers.includes('UNVERIFIED_SETTLEMENT_RULE'));
});
test('enforces maximum potential loss including estimated fees',()=>{
 const r=manualAssist({quote,fees,side:'YES',contracts:25,now});
 assert.equal(r.status,'BLOCKED');
 assert.ok(r.blockers.includes('EXCEEDS_MAX_POTENTIAL_LOSS'));
});
test('rejects invalid side, unknown fees and invalid limit',()=>{
 assert.equal(manualAssist({quote,fees,side:'UP',now}).status,'BLOCKED');
 assert.equal(manualAssist({quote,fees:{},side:'YES',now}).status,'BLOCKED');
 assert.equal(manualAssist({quote,fees,side:'YES',now,maxLossUsd:20}).status,'BLOCKED');
});

test('fee metadata timestamp must be independently fresh even when state claims live',()=>{
 for(const refreshedAt of [undefined,'invalid',new Date(now-300001).toISOString(),new Date(now+3000).toISOString()]){
  const r=manualAssist({quote,fees:{...fees,refreshedAt},side:'YES',now});
  assert.equal(r.status,'BLOCKED');
  assert.ok(r.blockers.includes('UNVERIFIED_FEE_METADATA'));
  assert.equal(r.executionAuthorized,false);
 }
 assert.equal(manualAssist({quote,fees:{...fees,refreshedAt:new Date(now-300000).toISOString()},side:'YES',now}).status,'INFORMATION_ONLY');
});
