'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../settlement-call-ui.js'),'utf8');
function setup(data){
 const names=['cashSettlementCall','simpleCall','simpleWhy','settlementCallStatus',
  'settlementLiveSide','settlementLiveReason','settlementFrozenSide',
  'settlementFrozenTime','settlementAccuracy','settlementScored','settlementPendingDiagnostics',
  'settlementYesAskLine','settlementCallMark','settlementChartCaption'];
 const nodes=Object.fromEntries(names.map(n=>[n,{
  textContent:'',style:{},attrs:{},setAttribute(k,v){this.attrs[k]=v}}]));
 let count=0;
 const ctx={document:{getElementById:id=>nodes[id]||null},
  AbortController,setTimeout:()=>42,clearTimeout:()=>{},
  fetch:async (url,opts)=>{
   count++;assert.equal(url,'/api/prospective');
   assert.equal(opts.cache,'no-store');
   return {ok:true,json:async()=>data}
  }};
 vm.runInNewContext(script,ctx);
 return {nodes,tick:()=>new Promise(resolve=>setImmediate(resolve)),
  callCount:()=>count};
}
const at='2026-11-17T12:01:00.000Z',later='2026-11-17T12:01:20.000Z';
function sample(overrides={}){
 return {version:'CASH_PROSPECTIVE_KALSHI_V1',
  model:'KXBTC15M_SETTLEMENT_EARLY_V3',
  tradingAuthorized:false,automatedOrdersEnabled:false,
  qualifiedCount:0,independentlyTimeAttested:false,modelCalibrated:false,
  officiallyScored:0,hits:0,misses:0,hitRate:null,
  captureReadiness:{lastReason:'STRIKE_GAP_EXCEEDS_VOLATILITY_AND_PROXY_BUFFER'},
  liveAssessment:{marketId:'KXBTC15M-SAMPLE-11',side:'YES',reason:'STRIKE_GAP_EXCEEDS_VOLATILITY_AND_PROXY_BUFFER',leadMs:610000,gapBps:35},
  active:{marketId:'KXBTC15M-SAMPLE-11',at,side:'YES',leadMs:610000},
  publicQuoteChart:{kind:'KALSHI_PUBLIC_YES_ASK_SNAPSHOTS',marketId:'KXBTC15M-SAMPLE-11',points:[
    {marketId:'KXBTC15M-SAMPLE-11',at,yesAsk:.55},
    {marketId:'KXBTC15M-SAMPLE-11',at:later,yesAsk:.61}]},
  ...overrides};
}
test('Simple Mode and research panel show same live experimental YES/NO settlement lean',async()=>{
 const x=setup(sample());await x.tick();
 assert.equal(x.nodes.simpleCall.textContent,'EXPERIMENTAL YES · NOT VALIDATED');
 assert.equal(x.nodes.settlementFrozenSide.textContent,'FROZEN YES');
 assert.match(x.nodes.simpleWhy.textContent,/not a verified profitable signal/i);
 assert.match(x.nodes.settlementScored.textContent,/0\/100 independently validated/);
 assert.ok(x.nodes.settlementYesAskLine.attrs.points);
 assert.equal(x.callCount(),1);
});
test('live NO can differ from earlier frozen YES without rewriting historical call',async()=>{
 const s=sample({liveAssessment:{marketId:'KXBTC15M-SAMPLE-11',side:'NO',
  leadMs:450000,reason:'STRIKE_GAP_EXCEEDS_VOLATILITY_AND_PROXY_BUFFER',gapBps:-42}});
 const x=setup(s);await x.tick();
 assert.equal(x.nodes.simpleCall.textContent,'EXPERIMENTAL NO · NOT VALIDATED');
 assert.equal(x.nodes.settlementFrozenSide.textContent,'FROZEN YES');
 assert.match(x.nodes.settlementLiveSide.textContent,/NO · DOWN AT SETTLEMENT/);
});
test('WAIT never fabricates YES/NO or a numeric confidence',async()=>{
 const s=sample({liveAssessment:{marketId:'KXBTC15M-SAMPLE-11',side:null,
  reason:'EDGE_UNCLEAR_VS_VOLATILITY',leadMs:500000,gapBps:2},
  active:{marketId:'KXBTC15M-SAMPLE-11',at,side:null,leadMs:500000}});
 const x=setup(s);await x.tick();
 assert.match(x.nodes.simpleCall.textContent,/WAIT · NO CLEAR YES\/NO CALL/);
 assert.equal(x.nodes.settlementFrozenSide.textContent,'FROZEN WAIT');
 assert.equal(x.nodes.settlementCallStatus.textContent,'WAIT · RESEARCH ONLY');
});
test('an unsafe alleged trading-enabled prediction is rejected instead of displayed',async()=>{
 const s=sample({tradingAuthorized:true});const x=setup(s);await x.tick();
 assert.equal(x.nodes.simpleCall.textContent,'NO VERIFIED SETTLEMENT CALL');
 assert.match(x.nodes.settlementLiveSide.textContent,/WAIT · NOT VERIFIED/);
});

test('unscored Kalshi forecasts show official evidence blockers, not invented losses',async()=>{
 const r=sample({pendingResolutionDiagnostics:{
  pendingTotal:5,notExpired:1,expiredAwaitingEvidence:4,overdueTenMinutes:2,
  blockedReasons:{AWAITING_OFFICIAL_FINALIZATION:3,SECOND_FINALIZED_READ_PENDING:1}
 }});
 const x=setup(r);await x.tick();
 const msg=x.nodes.settlementPendingDiagnostics.textContent;
 assert.match(msg,/5 forecasts/);
 assert.match(msg,/4 past expiry/);
 assert.match(msg,/2 overdue/);
 assert.match(msg,/awaiting official finalization \(3\)/);
 assert.match(msg,/NOT counted as wins or losses/);
 assert.equal(x.nodes.settlementScored.textContent.includes('0 frozen'),true);
});
test('absence of detailed evidence telemetry never invents an outcome',async()=>{
 const x=setup(sample());await x.tick();
 assert.match(x.nodes.settlementPendingDiagnostics.textContent,/breakdown unavailable/);
});
