'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {hashEvent}=require('../audit-journal');
const {createOfflineRecoveredMonitor}=require('../audit-archive-offline-monitor');
function event(type,payload){
 const body={sequence:1,type,recordedAt:'2026-11-19T20:04:00.000Z',
  payload,previousHash:'GENESIS'};
 return {...body,hash:hashEvent(body)};
}
test('offline factory replays active settlement against archived pending capture',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-boundary-settlement-'));
 try{
  const marketId='KXBTC15M-TEST-123456',id='Kalshi:'+marketId;
  const capture={id,venue:'Kalshi',marketId,slug:null,
   baselineName:'PUBLIC_MARKET_FAVORED_ASK_V1',baselineSide:'YES',
   quoteSource:'Kalshi public YES/NO asks',normalizedMarketShare:0.6,
   observedAsks:{YES:0.6,NO:0.4},spotCandidate:null,
   serverCapturedAt:'2026-11-19T20:00:00.000Z',
   quoteFetchedAt:'2026-11-19T19:59:59.000Z',
   endTime:'2026-11-19T20:02:00.000Z',leadMs:120000};
  const archived=event('CAPTURE',capture);
  const filename='shadow-segment-boundary-resolution.jsonl';
  const raw=JSON.stringify(archived)+'\n';
  fs.writeFileSync(path.join(directory,filename),raw);
  const manifest={version:1,segments:[{filename,
   sha256:createHash('sha256').update(raw).digest('hex'),
   chainTip:archived.hash,eventCount:1,previousChainTip:'GENESIS'}]};
  const evidenceSnapshot={venue:'Kalshi',ticker:marketId,status:'settled',result:'yes'};
  const resolution={id,venue:'Kalshi',marketId,winner:'YES',
   source:'Kalshi public market',checkedAt:'2026-11-19T20:03:00.000Z',
   firstObservedAt:'2026-11-19T20:02:30.000Z',
   evidenceSourceUrl:'https://external-api.kalshi.com/trade-api/v2/markets/'+marketId,
   evidenceSnapshot,confirmationCount:2,
   evidenceSha256:createHash('sha256').update(JSON.stringify(evidenceSnapshot)).digest('hex')};
  const active=event('RESOLUTION',resolution);
  const activeJournalPath=path.join(directory,'shadow-events.jsonl');
  fs.writeFileSync(activeJournalPath,JSON.stringify(active)+'\n');
  const result=createOfflineRecoveredMonitor({manifest,directory,activeJournalPath,
   clock:()=>Date.parse('2026-11-19T20:05:00Z'),maxEvents:4,maxRecords:2});
  const snapshot=result.snapshot;
  assert.equal(snapshot.observed,1);
  assert.equal(snapshot.pending,0);
  assert.equal(snapshot.recordedEvents,1);
  assert.equal(snapshot.recoveredEvents,1);
  assert.equal(snapshot.headHash,active.hash);
  assert.equal(snapshot.capacity.pendingResolutionReservations,0);
  assert.equal(snapshot.archiveHydrationEvidenceStatus,'FILESYSTEM_JOURNAL_UNVERIFIED');
  assert.equal(result.liveStartupEnabled,false);
  assert.equal(result.mutatesStorage,false);
  assert.equal(fs.existsSync(path.join(directory,'.shadow-journal-writer.lock')),false);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
