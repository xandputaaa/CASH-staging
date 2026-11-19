'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {manualAssist}=require('../manual-live-assist');
const {takerPreview}=require('../kalshi-fees');
const NOW=Date.parse('2026-11-19T20:00:00Z');
const quote={venue:'Kalshi',marketId:'KXBTC15M-26NOV192000',status:'live',refreshFailed:false,
 fetchedAt:new Date(NOW-1000).toISOString(),endTime:new Date(NOW+300000).toISOString(),
 contractRuleStatus:'BRTI_60S_RULE_TEXT_PRESENT',strikeType:'greater_or_equal',tieGoesToYes:true,
 yesAsk:0.4,noAsk:0.62};
const fees={state:'SERIES_METADATA_LIVE',feeType:'quadratic',feeMultiplier:1,
 refreshedAt:new Date(NOW-1000).toISOString()};
test('read-only JSON preview has explicit risk numbers and execution-disabled fields',()=>{
 const result=JSON.parse(JSON.stringify(manualAssist({quote,fees,side:'YES',contracts:2,now:NOW})));
 assert.equal(result.mode,'MANUAL_INFORMATION_ONLY');
 assert.equal(result.status,'INFORMATION_ONLY');
 assert.deepEqual(result.blockers,[]);
 assert.equal(result.marketId,quote.marketId);
 assert.equal(result.side,'YES');
 assert.equal(result.contracts,2);
 assert.equal(result.observedAsk,0.4);
 assert.equal(result.estimatedFee,0.0336);
 assert.equal(result.estimatedMaxLossUsd,0.8336);
 assert.equal(result.estimatedMaxGrossPayoutUsd,2);
 assert.equal(result.realOrdersEnabled,false);
 assert.equal(result.executionAuthorized,false);
});
test('NO side preview uses NO ask, not YES ask',()=>{
 const result=manualAssist({quote,fees,side:'NO',contracts:2,now:NOW});
 const expected=takerPreview(quote.noAsk,1,2);
 assert.equal(result.observedAsk,quote.noAsk);
 assert.equal(result.estimatedFee,expected.fee);
 assert.equal(result.estimatedMaxLossUsd,expected.hypotheticalCost);
 assert.equal(result.executionAuthorized,false);
});
test('fee-inclusive guardrail blocks borderline $10 previews',()=>{
 const q={...quote,yesAsk:0.5};
 const result=manualAssist({quote:q,fees,side:'YES',contracts:20,now:NOW});
 assert.equal(result.status,'BLOCKED');
 assert.ok(result.blockers.includes('EXCEEDS_MAX_POTENTIAL_LOSS'));
 assert.ok(result.estimatedMaxLossUsd>10);
 assert.equal(result.executionAuthorized,false);
});
test('unavailable quotes preserve blocked JSON response without invented prices',()=>{
 const result=JSON.parse(JSON.stringify(manualAssist({quote:{},fees:{},side:'YES',contracts:1,now:NOW})));
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.estimatedMaxLossUsd,null);
 assert.equal(result.observedAsk,null);
 assert.equal(result.executionAuthorized,false);
});
