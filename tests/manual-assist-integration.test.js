'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {manualAssist}=require('../manual-live-assist');
test('live assist remains manual and blocks invalid quantities and stale quotes',()=>{
 const blocked=manualAssist({quote:{},fees:{},side:'YES',contracts:0});
 assert.equal(blocked.status,'BLOCKED');
 assert.equal(blocked.realOrdersEnabled,false);
 assert.equal(blocked.executionAuthorized,false);
 assert.ok(blocked.blockers.includes('INVALID_CONTRACT_COUNT'));
 assert.ok(blocked.blockers.includes('STALE_QUOTE'));
});
test('dashboard serves a read-only live assist and keeps the $10 server limit',()=>{
 const server=fs.readFileSync('server.js','utf8'),html=fs.readFileSync('index.html','utf8');
 assert.match(server,/req\.url\?\.startsWith\('\/api\/manual-assist\?'\)/);
 assert.match(server,/maxLossUsd:10/);
 assert.match(server,/const \{manualAssist\}=require\('\.\/manual-live-assist'\)/);
 assert.match(html,/id="cashManualAssist"/);
 assert.match(html,/src="\/manual-assist-ui\.js"/);
 assert.doesNotMatch(fs.readFileSync('manual-assist-ui.js','utf8'),/fetch\([^\n]*method:\s*['"]POST/);
});
test('browser rejects expired, changed or inconsistent risk previews',()=>{
 const ui=fs.readFileSync('manual-assist-ui.js','utf8');
 assert.match(ui,/lastSuccessAt/);
 assert.match(ui,/Date\.now\(\)-lastSuccessAt>20000/);
 assert.match(ui,/r\.contracts!==Number\(qty\.value\)/);
 assert.match(ui,/r\.estimatedMaxLossUsd>10/);
 assert.match(ui,/qty\.addEventListener\('input'/);
});

test('manual preview rejects stale or missing fee observation even with live state',()=>{
 const now=Date.parse('2026-11-19T20:00:00Z');
 const quote={venue:'Kalshi',marketId:'KXBTC15M-26NOV192000',status:'live',refreshFailed:false,
  fetchedAt:new Date(now-1000).toISOString(),endTime:new Date(now+300000).toISOString(),
  contractRuleStatus:'BRTI_60S_RULE_TEXT_PRESENT',strikeType:'greater_or_equal',tieGoesToYes:true,yesAsk:0.4,noAsk:0.62};
 const fees={state:'SERIES_METADATA_LIVE',feeType:'quadratic',feeMultiplier:1,refreshedAt:new Date(now-1000).toISOString()};
 assert.equal(manualAssist({quote,fees,side:'YES',contracts:2,now}).status,'INFORMATION_ONLY');
 for(const refreshedAt of [undefined,'invalid',new Date(now-300001).toISOString(),new Date(now+3000).toISOString()]){
  const result=manualAssist({quote,fees:{...fees,refreshedAt},side:'YES',contracts:2,now});
  assert.equal(result.status,'BLOCKED');
  assert.ok(result.blockers.includes('UNVERIFIED_FEE_METADATA'));
  assert.equal(result.executionAuthorized,false);
 }
});

test('risk ceiling blocks a preview above $10 including fees, with no execution',()=>{
 const now=Date.parse('2026-11-19T20:00:00Z');
 const quote={venue:'Kalshi',marketId:'KXBTC15M-26NOV192000',status:'live',refreshFailed:false,
  fetchedAt:new Date(now-1000).toISOString(),endTime:new Date(now+300000).toISOString(),
  contractRuleStatus:'BRTI_60S_RULE_TEXT_PRESENT',strikeType:'greater_or_equal',tieGoesToYes:true,
  yesAsk:0.99,noAsk:0.01};
 const fees={state:'SERIES_METADATA_LIVE',feeType:'quadratic',feeMultiplier:1,refreshedAt:new Date(now-1000).toISOString()};
 const within=manualAssist({quote,fees,side:'YES',contracts:10,now});
 const over=manualAssist({quote,fees,side:'YES',contracts:11,now});
 assert.equal(within.status,'INFORMATION_ONLY');
 assert.ok(within.estimatedMaxLossUsd<=10);
 assert.equal(over.status,'BLOCKED');
 assert.ok(over.estimatedMaxLossUsd>10);
 assert.ok(over.blockers.includes('EXCEEDS_MAX_POTENTIAL_LOSS'));
 assert.equal(over.executionAuthorized,false);
 assert.equal(over.realOrdersEnabled,false);
});
test('bad prices, invalid sides, stale quote and missing settlement rules fail closed',()=>{
 const now=Date.parse('2026-11-19T20:00:00Z');
 const quote={venue:'Kalshi',marketId:'KXBTC15M-26NOV192000',status:'live',refreshFailed:false,
  fetchedAt:new Date(now-1000).toISOString(),endTime:new Date(now+300000).toISOString(),
  contractRuleStatus:'BRTI_60S_RULE_TEXT_PRESENT',strikeType:'greater_or_equal',tieGoesToYes:true,
  yesAsk:0.5,noAsk:0.5};
 const fees={state:'SERIES_METADATA_LIVE',feeType:'quadratic',feeMultiplier:1,refreshedAt:new Date(now-1000).toISOString()};
 const cases=[
  {side:'BUY',quote,reason:'INVALID_SIDE'},
  {side:'YES',quote:{...quote,yesAsk:1},reason:'UNAVAILABLE_ASK_OR_FEE_ESTIMATE'},
  {side:'YES',quote:{...quote,fetchedAt:new Date(now-13000).toISOString()},reason:'STALE_QUOTE'},
  {side:'YES',quote:{...quote,tieGoesToYes:false},reason:'UNVERIFIED_SETTLEMENT_RULE'}
 ];
 for(const c of cases){
  const result=manualAssist({quote:c.quote,fees,side:c.side,contracts:1,now});
  assert.equal(result.status,'BLOCKED');
  assert.ok(result.blockers.includes(c.reason));
  assert.equal(result.executionAuthorized,false);
 }
});
