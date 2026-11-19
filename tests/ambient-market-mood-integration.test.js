'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('ambient script uses only public spot observations and is actually served',()=>{
 const html=fs.readFileSync('index.html','utf8'),server=fs.readFileSync('server.js','utf8'),script=fs.readFileSync('ambient-market-mood.js','utf8');
 assert.match(html,/src="\/ambient-market-mood\.js"/);
 assert.match(server,/req\.url==='\/ambient-market-mood\.js'/);
 assert.match(server,/res\.end\(ambientMarketMoodScript\)/);
 assert.match(script,/fetch\('\/api\/spot'/);
 assert.match(script,/q\.status!=='live'/);
 assert.match(script,/now-timestamp>12000/);
 assert.match(script,/neutral\(\)/);
 assert.doesNotMatch(script,/api\/forecast|api\/predict|api\/trade/);
});
