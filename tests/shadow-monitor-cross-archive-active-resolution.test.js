'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {hashEvent}=require('../audit-journal');
const {createShadowMonitor}=require('../shadow-monitor');
test('offline monitor replays verified active resolution against archived capture',()=>{
 const marketId='KXBTC15M-TEST-123456',id='Kalshi:'+marketId;
 const capture={id,venue:'Kalshi',marketId,slug:null,
  baselineName:'PUBLIC_MARKET_FAVORED_ASK_V1',baselineSide:'YES',
  quoteSource:'Kalshi public YES/NO asks',normalizedMarketShare:0.6,
  observedAsks:{YES:0.6,NO:0.4},spotCandidate:null,
  serverCapturedAt:'2026-11-19T20:00:00.000Z',
  quoteFetchedAt:'2026-11-19T19:59:59.000Z',
  endTime:'2026-11-19T20:02:00.000Z',leadMs:120000,status:'PENDING'};
 const evidenceSnapshot={venue:'Kalshi',ticker:marketId,status:'settled',result:'yes'};
 const resolution={id,venue:'Kalshi',marketId,winner:'YES',
  source:'Kalshi public market',checkedAt:'2026-11-19T20:03:00.000Z',
  firstObservedAt:'2026-11-19T20:02:30.000Z',
  evidenceSourceUrl:'https://external-api.kalshi.com/trade-api/v2/markets/'+marketId,
  evidenceSnapshot,confirmationCount:2,
  evidenceSha256:createHash('sha256').update(JSON.stringify(evidenceSnapshot)).digest('hex')};
 const body={sequence:1,type:'RESOLUTION',recordedAt:'2026-11-19T20:04:00.000Z',
  payload:resolution,previousHash:'GENESIS'};
 const active={...body,hash:hashEvent(body)};
 const monitor=createShadowMonitor({quotes:{},results:{},
  clock:()=>Date.parse('2026-11-19T20:05:00Z'),
  archivedPendingState:{state:'ARCHIVED_PENDING_HYDRATION_PLANNED',
   capturedIds:[id],capturedCount:1,pendingCount:1,pendingRecords:[capture]},
  journal:{events:[active]},maxEvents:3,maxRecords:2});
 const snapshot=monitor.snapshot();
 assert.equal(snapshot.pending,0);
 assert.equal(snapshot.recordedEvents,1);
 assert.equal(snapshot.recoveredEvents,1);
 assert.equal(snapshot.archivedPendingHydrated,true);
 assert.equal(snapshot.archivedHistoricalCaptures,1);
 assert.equal(snapshot.archiveHydrationEvidenceStatus,'FILESYSTEM_JOURNAL_UNVERIFIED');
 assert.equal(snapshot.capacity.pendingResolutionReservations,0);
 assert.equal(snapshot.headHash,active.hash);
});
