'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createDiagnostics,feedState}=require('../diagnostics');
const t=Date.parse('2026-11-16T18:00:00.000Z');
function inputs(){
 return {now:t,spot:{status:'live',price:88000,source:'Kraken BTC/USD',fetchedAt:new Date(t-2000).toISOString()},
  kalshi:{status:'live',marketId:'KXBTC15M-26NOV161100-00',yesAsk:0.52,noAsk:0.49,
   fetchedAt:new Date(t-2000).toISOString(),endTime:new Date(t+100000).toISOString()},
  polymarket:{status:'live',marketId:'0x'+'a'.repeat(64),slug:'btc-updown-5m-1794852000',
   upAsk:0.53,downAsk:0.49,fetchedAt:new Date(t-2000).toISOString(),
   endTime:new Date(t+150000).toISOString()},
  shadow:{lastScanAt:new Date(t-10000).toISOString(),storageMode:'VOLATILE_SERVER_SESSION',observed:12,settled:2}};
}
test('all three fresh read-only data feeds do not imply validated trading',()=>{
 const d=createDiagnostics(inputs());
 assert.equal(d.dataStatus,'LIVE');
 assert.equal(d.mode,'SIMULATION_ONLY');assert.equal(d.monitor.state,'ACTIVE');
 assert.equal(d.validation.state,'NOT_VALIDATED');
 assert.equal(d.validation.qualifyingProspectiveContracts,0);
 assert.equal(d.validation.realOrdersEnabled,false);
 assert.equal(d.validation.independentTimeAttestation,false);
 assert.equal(d.feeds.Kalshi.state,'LIVE');
});
test('a missing Kalshi side or expired market is partial or stale, never live',()=>{
 const a=inputs();a.kalshi.noAsk=null;
 const d=createDiagnostics(a);assert.equal(d.feeds.Kalshi.state,'PARTIAL');assert.equal(d.dataStatus,'DEGRADED');
 const b=inputs();b.kalshi.endTime=new Date(t-1).toISOString();
 assert.equal(createDiagnostics(b).feeds.Kalshi.state,'STALE');
});
test('future-dated quotes, stale spot, invalid IDs, and offline feeds fail closed',()=>{
 const a=inputs();a.spot.fetchedAt=new Date(t+6000).toISOString();
 assert.equal(createDiagnostics(a).feeds.spot.state,'OFFLINE');
 const b=inputs();b.spot.fetchedAt=new Date(t-40000).toISOString();
 assert.equal(createDiagnostics(b).feeds.spot.state,'STALE');
 const c=inputs();c.polymarket.marketId='0x123';assert.equal(createDiagnostics(c).feeds.Polymarket.state,'OFFLINE');
 const d=createDiagnostics({now:t});assert.equal(d.dataStatus,'OFFLINE');
});
test('diagnostics detect stalled session observation polling independently of quote status',()=>{
 const data=inputs();data.shadow.lastScanAt=new Date(t-120000).toISOString();
 const status=createDiagnostics(data);assert.equal(status.monitor.state,'STALE');
 assert.equal(status.dataStatus,'LIVE');
 assert.equal(status.validation.independentModelValidated,false);
});
test('only actual captured ask prices count as valid market quote sides',()=>{
 assert.equal(feedState('Kalshi',{status:'live',marketId:'KXBTC15M-ABCDEF',
  yesAsk:null,noAsk:null,fetchedAt:new Date(t).toISOString(),endTime:new Date(t+120000).toISOString()},t).state,'OFFLINE');
});
