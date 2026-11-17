'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs');
const script=fs.readFileSync('prospective-ui.js','utf8');
function boot(brti,overrides={}){
 const names=['cashProspective','pfStatus','pfSide','pfCount','pfScored','pfAccuracy',
  'pfContext','pfBrti','simpleForecast','pfResearchCoverage','pfResearchSources'];
 const nodes=Object.fromEntries(names.map(id=>[id,{textContent:''}]));
 const report={version:'CASH_PROSPECTIVE_KALSHI_V1',
  qualifiedCount:0,tradingAuthorized:false,automatedOrdersEnabled:false,
  independentlyTimeAttested:false,modelCalibrated:false,active:null,
  directional:0,waits:0,officiallyScored:0,hitRate:null,captureReadiness:{
   lastReason:'INSUFFICIENT_SPOT_HISTORY'},...overrides};
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

test('research scorecard exposes full frozen denominator and source groups',async()=>{
 const h=boot({state:'NOT_CONFIGURED'},{
  scorecard:{version:'CASH_PROSPECTIVE_DESCRIPTIVE_SCORECARD_V1',
   qualifiedCount:0,independentlyTimeAttested:false,
   overall:{captured:8,directional:3,waits:5,scoredDirectional:1,
    hits:1,misses:0,pendingDirectional:2,pendingWaits:5,voids:0,
    descriptiveWilson95:{lower:.2,upper:1}},
   bySource:{publicSpotProxy:{scoredDirectional:1,directional:3},
    officialBrtiLive:{scoredDirectional:0,directional:0}}}
 });
 await h.tick();
 assert.match(h.nodes.pfResearchCoverage.textContent,/8 markets; 3 YES\/NO attempts, 5 WAITs/);
 assert.match(h.nodes.pfResearchCoverage.textContent,/2 directional outcomes still pending/);
 assert.match(h.nodes.pfResearchCoverage.textContent,/20.0%–100.0%/);
 assert.match(h.nodes.pfResearchCoverage.textContent,/Uncaptured 15m rounds are unknown/);
 assert.match(h.nodes.pfResearchSources.textContent,/public BTC proxy 1\/3/);
 assert.match(h.nodes.pfResearchSources.textContent,/private official BRTI 0\/0/);
});
test('no scorecard does not produce a fabricated accuracy measure',async()=>{
 const h=boot({state:'NOT_CONFIGURED'});await h.tick();
 assert.match(h.nodes.pfResearchCoverage.textContent,/breakdown unavailable/);
 assert.match(h.nodes.pfResearchSources.textContent,/Cannot confirm source-separated/);
});
