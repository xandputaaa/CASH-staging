'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createShadowMonitor}=require('../shadow-monitor');
const clock=()=>Date.parse('2026-11-19T20:00:00Z');
function capture(){
 const id='Kalshi:KXBTC15M-TEST-123456';
 return {id,venue:'Kalshi',marketId:'KXBTC15M-TEST-123456',slug:null,
  baselineName:'PUBLIC_MARKET_FAVORED_ASK_V1',baselineSide:'YES',
  quoteSource:'Kalshi public YES/NO asks',normalizedMarketShare:0.6,
  observedAsks:{YES:0.6,NO:0.4},spotCandidate:null,
  serverCapturedAt:'2026-11-19T20:00:00.000Z',
  quoteFetchedAt:'2026-11-19T19:59:59.000Z',
  endTime:'2026-11-19T20:02:00.000Z',leadMs:120000,status:'PENDING'};
}
const providers={quotes:{},results:{},clock};
test('offline monitor hydrates archived pending and reserves a settlement event',()=>{
 const record=capture();
 const archivedPendingState={state:'ARCHIVED_PENDING_HYDRATION_PLANNED',
  capturedIds:[record.id],capturedCount:1,pendingCount:1,pendingRecords:[record]};
 const monitor=createShadowMonitor({...providers,archivedPendingState,maxEvents:2,maxRecords:2});
 const snap=monitor.snapshot();
 assert.equal(snap.observed,1);
 assert.equal(snap.capacity.pendingResolutionReservations,1);
 assert.equal(snap.capacity.safeNewCaptures,0);
});
test('offline monitor refuses insufficient event slots and duplicate recovered pending',()=>{
 const record=capture();
 const base={state:'ARCHIVED_PENDING_HYDRATION_PLANNED',
  capturedIds:[record.id],capturedCount:1,pendingCount:1,pendingRecords:[record]};
 assert.throws(()=>createShadowMonitor({...providers,archivedPendingState:base,maxEvents:0}),/requires verified identity/);
 assert.throws(()=>createShadowMonitor({...providers,archivedPendingState:{...base,pendingRecords:[record,record],pendingCount:2}}),/invalid or duplicate/);
 assert.throws(()=>createShadowMonitor({...providers,archivedPendingState:base,
  journal:{events:[{sequence:1,type:'CAPTURE'}]}}),/Audit event chain/);
});
