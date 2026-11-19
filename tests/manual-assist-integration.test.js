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
