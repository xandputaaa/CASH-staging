'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {hashEvent}=require('../audit-journal');
const {createShadowMonitor}=require('../shadow-monitor');
function capture(id){
 const marketId=id.slice('Kalshi:'.length);
 return {id,venue:'Kalshi',marketId,slug:null,
  baselineName:'PUBLIC_MARKET_FAVORED_ASK_V1',baselineSide:'YES',
  quoteSource:'Kalshi public YES/NO asks',normalizedMarketShare:0.6,
  observedAsks:{YES:0.6,NO:0.4},spotCandidate:null,
  serverCapturedAt:'2026-11-19T20:00:00.000Z',
  quoteFetchedAt:'2026-11-19T19:59:59.000Z',
  endTime:'2026-11-19T20:02:00.000Z',leadMs:120000,status:'PENDING'};
}
function event(payload){
 const body={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00.000Z',
  payload,previousHash:'GENESIS'};
 return {...body,hash:hashEvent(body)};
}
function plan(record,extraIds=[]){
 return {state:'ARCHIVED_PENDING_HYDRATION_PLANNED',
  capturedIds:[record.id,...extraIds],capturedCount:1+extraIds.length,
  pendingCount:1,pendingRecords:[record]};
}
const quotes={},results={},clock=()=>Date.parse('2026-11-19T20:05:00Z');
test('active duplicate of archived capture fails closed before monitor starts',()=>{
 const record=capture('Kalshi:KXBTC15M-TEST-123456');
 assert.throws(()=>createShadowMonitor({quotes,results,clock,
  archivedPendingState:plan(record),journal:{events:[event(record)]},
  maxEvents:4,maxRecords:4}),/Saved capture is semantically invalid/);
});
test('active capture included in historical identity set cannot be silently replayed',()=>{
 const archived=capture('Kalshi:KXBTC15M-TEST-123456');
 const active=capture('Kalshi:KXBTC15M-TEST-654321');
 assert.throws(()=>createShadowMonitor({quotes,results,clock,
  archivedPendingState:plan(archived,[active.id]),journal:{events:[event(active)]},
  maxEvents:4,maxRecords:4}),/Saved capture is semantically invalid/);
});
test('distinct active capture outside archive identity set can coexist offline',()=>{
 const archived=capture('Kalshi:KXBTC15M-TEST-123456');
 const active=capture('Kalshi:KXBTC15M-TEST-654321');
 const monitor=createShadowMonitor({quotes,results,clock,
  archivedPendingState:plan(archived),journal:{events:[event(active)]},
  maxEvents:5,maxRecords:4});
 const snapshot=monitor.snapshot();
 assert.equal(snapshot.observed,2);
 assert.equal(snapshot.pending,2);
 assert.equal(snapshot.recordedEvents,1);
 assert.equal(snapshot.archivedHistoricalCaptures,1);
 assert.equal(snapshot.capacity.pendingResolutionReservations,2);
});
