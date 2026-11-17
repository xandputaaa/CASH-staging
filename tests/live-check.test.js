'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {assessLiveCheck}=require('../live-check');
const at=Date.parse('2026-11-16T23:30:00Z');
const iso=x=>new Date(x).toISOString();
function good(){
 return {now:at,kalshi:{venue:'Kalshi',status:'live',refreshFailed:false,
  marketId:'KXBTC15M-26NOV161600-00',fetchedAt:iso(at-2000),endTime:iso(at+400000),
  yesAsk:0.58,noAsk:0.45},
  spot:{status:'live',source:'Kraken BTC/USD',price:86665.23,fetchedAt:iso(at-1000)},
  terminal:{version:'CASH_KALSHI15_TERMINAL_V1',paperMonitorReady:true,
   displayState:'PAPER_MONITOR_READY',liveDecision:'NO_CALL_MODEL_NOT_VALIDATED',
   finalization:{realTradingGatePassed:false}},
  assets:{page:true,simple:true,switcher:true,advanced:true,paper:true}};
}
test('healthy public data and app assets mean paper monitoring, never qualified prediction',()=>{
 const x=assessLiveCheck(good());
 assert.equal(x.state,'LIVE_PAPER_MONITOR');
 assert.equal(x.site.online,true);
 assert.equal(x.site.simpleModeAssetsReady,true);
 assert.equal(x.market.kalshiQuotesFresh,true);
 assert.equal(x.market.spotReferenceFresh,true);
 assert.equal(x.paperPractice.clientAvailable,true);
 assert.equal(x.model.independentValidatedForecasts,0);
 assert.equal(x.model.canExecuteRealTrade,false);
 assert.equal(x.model.verifiedTradingEdge,false);
});
test('expired or incomplete Kalshi quotes cannot be labeled as live',()=>{
 for(const data of [
  {status:'stale'},{noAsk:null},{endTime:iso(at-1000)},{fetchedAt:iso(at-30000)},
  {refreshFailed:true},{marketId:'KXETH15M-UNKNOWN'}
 ]){
  const v=good();Object.assign(v.kalshi,data);
  const r=assessLiveCheck(v);
  assert.equal(r.market.kalshiQuotesFresh,false);
  assert.equal(r.state,'ONLINE_QUOTES_UNAVAILABLE');
  assert.equal(r.model.canExecuteRealTrade,false);
 }
});
test('healthy Kalshi with stale BTC proxy or unconfirmed BRTI rules is partial, not paper-ready',()=>{
 const v=good();v.spot.fetchedAt=iso(at-25000);
 assert.equal(assessLiveCheck(v).state,'ONLINE_PARTIAL_DATA');
 const w=good();w.terminal.paperMonitorReady=false;
 assert.equal(assessLiveCheck(w).state,'ONLINE_PARTIAL_DATA');
});
test('missing scripts do not change real-trading gate and cannot pass all paper checks',()=>{
 const v=good();v.assets.paper=false;
 const r=assessLiveCheck(v);
 assert.equal(r.paperPractice.clientAvailable,false);
 assert.equal(r.model.canExecuteRealTrade,false);
 assert.equal(r.state,'ONLINE_PARTIAL_DATA');
 assert.ok(r.issues.some(x=>x.includes('asset')));
});
