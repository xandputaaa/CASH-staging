'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createShadowMonitor}=require('../shadow-monitor');
const clock=()=>Date.parse('2026-11-19T20:04:00Z');
function capture(){
 return {id:'Kalshi:KXBTC15M-TEST-123456',venue:'Kalshi',
  marketId:'KXBTC15M-TEST-123456',slug:null,
  baselineName:'PUBLIC_MARKET_FAVORED_ASK_V1',baselineSide:'YES',
  quoteSource:'Kalshi public YES/NO asks',normalizedMarketShare:0.6,
  observedAsks:{YES:0.6,NO:0.4},spotCandidate:null,
  serverCapturedAt:'2026-11-19T20:00:00.000Z',
  quoteFetchedAt:'2026-11-19T19:59:59.000Z',
  endTime:'2026-11-19T20:02:00.000Z',leadMs:120000,status:'PENDING'};
}
function plan(record){
 return {state:'ARCHIVED_PENDING_HYDRATION_PLANNED',capturedIds:[record.id],
  capturedCount:1,pendingCount:1,pendingRecords:[record]};
}
test('archived pending is not silently scored by an unverified settlement response',async()=>{
 const record=capture();
 const monitor=createShadowMonitor({quotes:{},results:{lookup:async()=>({
  status:'verified',venue:'Kalshi',marketId:record.marketId,winner:'YES',
  checkedAt:'2026-11-19T20:04:00Z',confirmationCount:0
 })},clock,archivedPendingState:plan(record),maxEvents:2,maxRecords:2});
 const outcome=await monitor.resolvePending();
 assert.equal(outcome.changed,0);
 assert.equal(monitor.snapshot().pending,1);
 assert.equal(monitor.snapshot().recordedEvents,0);
 assert.equal(monitor.snapshot().capacity.pendingResolutionReservations,1);
});
test('recovered historical identity blocks duplicate capture after hydration',()=>{
 const record=capture();
 const monitor=createShadowMonitor({quotes:{},results:{},clock,
  archivedPendingState:plan(record),maxEvents:4,maxRecords:3});
 const quote={venue:'Kalshi',status:'live',marketId:record.marketId,
  fetchedAt:'2026-11-19T20:04:00Z',endTime:'2026-11-19T20:06:00Z',
  yesAsk:0.6,noAsk:0.4};
 assert.equal(monitor.capture(quote),null);
 assert.equal(monitor.snapshot().observed,1);
 assert.equal(monitor.snapshot().recordedEvents,0);
});
