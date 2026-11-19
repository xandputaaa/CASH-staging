'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {hashEvent}=require('../audit-journal');
const {planArchivedPendingHydration}=require('../audit-archive-pending-hydration-plan');
test('valid archived pending capture is deeply immutable in recovery plan',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-hydration-freeze-'));
 try{
  const captured='2026-11-19T20:00:00.000Z';
  const payload={id:'Kalshi:KXBTC15M-TEST-123456',venue:'Kalshi',
   marketId:'KXBTC15M-TEST-123456',slug:null,
   baselineName:'PUBLIC_MARKET_FAVORED_ASK_V1',baselineSide:'YES',
   quoteSource:'Kalshi public YES/NO asks',normalizedMarketShare:0.6,
   observedAsks:{YES:0.6,NO:0.4},spotCandidate:null,
   serverCapturedAt:captured,quoteFetchedAt:'2026-11-19T19:59:59.000Z',
   endTime:'2026-11-19T20:02:00.000Z',leadMs:120000};
  const body={sequence:1,type:'CAPTURE',recordedAt:captured,payload,previousHash:'GENESIS'};
  const event={...body,hash:hashEvent(body)};
  const filename='shadow-segment-freeze.jsonl',raw=JSON.stringify(event)+'\n';
  fs.writeFileSync(path.join(directory,filename),raw);
  const activeJournalPath=path.join(directory,'shadow-events.jsonl');
  fs.writeFileSync(activeJournalPath,'');
  const manifest={version:1,segments:[{filename,
   sha256:createHash('sha256').update(raw).digest('hex'),
   chainTip:event.hash,eventCount:1,previousChainTip:'GENESIS'}]};
  const plan=planArchivedPendingHydration({manifest,directory,activeJournalPath});
  assert.equal(plan.pendingCount,1);
  assert.equal(plan.capturedCount,1);
  assert.equal(plan.liveStartupEnabled,false);
  const recovered=plan.pendingRecords[0];
  assert.equal(recovered.archiveRecovered,true);
  assert.equal(Object.isFrozen(recovered),true);
  assert.equal(Object.isFrozen(recovered.observedAsks),true);
  assert.throws(()=>{recovered.observedAsks.YES=0.1},TypeError);
  assert.equal(recovered.observedAsks.YES,0.6);
  assert.equal(plan.evidenceStatus,'FILESYSTEM_JOURNAL_UNVERIFIED');
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
