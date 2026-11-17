'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs');
const script=fs.readFileSync('prospective-ui.js','utf8');
function boot(brti){
 const names=['cashProspective','pfStatus','pfSide','pfCount','pfScored','pfAccuracy',
  'pfContext','pfBrti','simpleForecast'];
 const nodes=Object.fromEntries(names.map(id=>[id,{textContent:''}]));
 const report={version:'CASH_PROSPECTIVE_KALSHI_V1',
  qualifiedCount:0,tradingAuthorized:false,automatedOrdersEnabled:false,
  independentlyTimeAttested:false,modelCalibrated:false,active:null,
  directional:0,waits:0,officiallyScored:0,hitRate:null,captureReadiness:{
   lastReason:'INSUFFICIENT_SPOT_HISTORY'}};
 const urls=[];
 const ctx={document:{getElementById:id=>nodes[id]||null,addEventListener(){}},
  Number,Date,String,AbortController,setTimeout:()=>1,clearTimeout(){},
  fetch:async url=>{
   urls.push(url);return {ok:true,json:async()=>url==='/api/brti-health'?brti:report};
  }};
 vm.runInNewContext(script,ctx);
 return {nodes,urls,tick:()=>new Promise(resolve=>setImmediate(resolve))};
}
test('official BRTI connected but not opted in is not described as a model input',async()=>{
 const h=boot({state:'LIVE',forecastOptIn:false,usedForForecasts:false});
 await h.tick();
 assert.match(h.nodes.pfBrti.textContent,/separate forecast opt-in not active/);
 assert.match(h.nodes.pfBrti.textContent,/public BTC proxy/);
 assert.deepEqual(h.urls,['/api/prospective','/api/brti-health']);
});
test('official BRTI opted in and LIVE shows correct unvalidated status',async()=>{
 const h=boot({state:'LIVE',forecastOptIn:true,usedForForecasts:true});
 await h.tick();
 assert.match(h.nodes.pfBrti.textContent,/private live index OPTED IN/);
 assert.match(h.nodes.pfBrti.textContent,/not the final 60-second settlement average/);
});
test('official BRTI opted in but offline indicates WAIT, not proxy fallback',async()=>{
 const h=boot({state:'NOT_ENTITLED',forecastOptIn:true,usedForForecasts:false});
 await h.tick();
 assert.match(h.nodes.pfBrti.textContent,/must WAIT/);
 assert.doesNotMatch(h.nodes.pfBrti.textContent,/model uses a public BTC proxy/);
});
