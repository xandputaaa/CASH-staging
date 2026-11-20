'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {hashEvent}=require('../audit-journal');
const {planArchivedPendingHydration}=require('../audit-archive-pending-hydration-plan');
const {createShadowMonitor}=require('../shadow-monitor');
function capture(marketId){
 return {id:'Kalshi:'+marketId,venue:'Kalshi',marketId,slug:null,
  baselineName:'PUBLIC_MARKET_FAVORED_ASK_V1',baselineSide:'YES',
  quoteSource:'Kalshi public YES/NO asks',normalizedMarketShare:0.6,
  observedAsks:{YES:0.6,NO:0.4},spotCandidate:null,
  serverCapturedAt:'2026-11-19T20:00:00.000Z',
  quoteFetchedAt:'2026-11-19T19:59:59.000Z',
  endTime:'2026-11-19T20:02:00.000Z',leadMs:120000};
}
function event(type,payload,sequence=1,previousHash='GENESIS'){
 const body={sequence,type,recordedAt:'2026-11-19T20:04:00.000Z',payload,previousHash};
 return {...body,hash:hashEvent(body)};
}
test('partitioned filesystem recovery hydrates archived pending and replays distinct active capture',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-partitioned-recovery-'));
 try{
  const archived=capture('KXBTC15M-TEST-123456');
  const activeCapture=capture('KXBTC15M-TEST-654321');
  const archivedEvent=event('CAPTURE',archived),filename='shadow-partition-segment.jsonl';
  const raw=JSON.stringify(archivedEvent)+'\n';
  fs.writeFileSync(path.join(directory,filename),raw);
  const activeEvent=event('CAPTURE',activeCapture);
  const activeJournalPath=path.join(directory,'shadow-events.jsonl');
  fs.writeFileSync(activeJournalPath,JSON.stringify(activeEvent)+'\n');
  const manifest={version:1,segments:[{filename,
   sha256:createHash('sha256').update(raw).digest('hex'),
   chainTip:archivedEvent.hash,eventCount:1,previousChainTip:'GENESIS'}]};
  const plan=planArchivedPendingHydration({manifest,directory,activeJournalPath});
  assert.deepEqual(plan.capturedIds,[archived.id]);
  assert.deepEqual(plan.activeCaptureIds,[activeCapture.id]);
  assert.equal(plan.capturedCount,1);
  assert.equal(plan.activeCaptureCount,1);
  assert.equal(plan.totalCapturedCount,2);
  assert.equal(plan.pendingCount,1);
  assert.equal(plan.activePendingCount,1);
  assert.equal(plan.totalPendingCount,2);
  const monitor=createShadowMonitor({quotes:{},results:{},
   clock:()=>Date.parse('2026-11-19T20:05:00Z'),
   archivedPendingState:plan,journal:{events:[activeEvent]},
   maxEvents:5,maxRecords:4});
  const snapshot=monitor.snapshot();
  assert.equal(snapshot.observed,2);
  assert.equal(snapshot.pending,2);
  assert.equal(snapshot.recordedEvents,1);
  assert.equal(snapshot.recoveredEvents,1);
  assert.equal(snapshot.archivedHistoricalCaptures,1);
  assert.equal(snapshot.capacity.pendingResolutionReservations,2);
  assert.equal(snapshot.headHash,activeEvent.hash);
  assert.equal(snapshot.archiveHydrationEvidenceStatus,'FILESYSTEM_JOURNAL_UNVERIFIED');
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
