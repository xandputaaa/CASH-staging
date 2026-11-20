'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {hashEvent}=require('../audit-journal');
const {assessArchivedPendingCapacity}=require('../audit-archive-pending-capacity');
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
function fixture(activeEvents){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-capacity-boundary-'));
 const archived=capture('KXBTC15M-TEST-123456');
 const segment=event('CAPTURE',archived),filename='shadow-segment-capacity.jsonl';
 const raw=JSON.stringify(segment)+'\n';
 fs.writeFileSync(path.join(directory,filename),raw);
 const manifest={version:1,segments:[{filename,
  sha256:createHash('sha256').update(raw).digest('hex'),
  chainTip:segment.hash,eventCount:1,previousChainTip:'GENESIS'}]};
 const activeJournalPath=path.join(directory,'shadow-events.jsonl');
 fs.writeFileSync(activeJournalPath,activeEvents.map(x=>JSON.stringify(x)).join('\n')+(activeEvents.length?'\n':''));
 return {directory,manifest,activeJournalPath,archived};
}
test('capacity reserves both archive and active unresolved captures',()=>{
 const active=event('CAPTURE',capture('KXBTC15M-TEST-654321'));
 const x=fixture([active]);
 try{
  const result=assessArchivedPendingCapacity({...x,maxEvents:3,maxRecords:2});
  assert.equal(result.pending,2);
  assert.equal(result.archiveBoundaryPending,1);
  assert.equal(result.activePending,1);
  assert.equal(result.hydratedRecords,2);
  assert.equal(result.requiredResolutionEvents,2);
  assert.equal(result.safeNewCaptures,0);
  assert.equal(result.state,'ARCHIVED_PENDING_CAPACITY_RESERVED');
  const blocked=assessArchivedPendingCapacity({...x,maxEvents:2,maxRecords:2});
  assert.equal(blocked.state,'ARCHIVED_PENDING_CAPACITY_BLOCKED');
  assert.equal(blocked.reason,'PENDING_EXCEEDS_EVENT_CAPACITY');
 }finally{fs.rmSync(x.directory,{recursive:true,force:true})}
});
test('settlement in active journal frees final resolution reserve but not historical record slot',()=>{
 const marketId='KXBTC15M-TEST-123456',id='Kalshi:'+marketId;
 const evidenceSnapshot={venue:'Kalshi',ticker:marketId,status:'settled',result:'yes'};
 const resolution={id,venue:'Kalshi',marketId,winner:'YES',
 source:'Kalshi public market',checkedAt:'2026-11-19T20:03:00.000Z',
 firstObservedAt:'2026-11-19T20:02:30.000Z',
 evidenceSourceUrl:'https://external-api.kalshi.com/trade-api/v2/markets/'+marketId,
 evidenceSnapshot,confirmationCount:2,
 evidenceSha256:createHash('sha256').update(JSON.stringify(evidenceSnapshot)).digest('hex')};
 const x=fixture([event('RESOLUTION',resolution)]);
 try{
  const result=assessArchivedPendingCapacity({...x,maxEvents:3,maxRecords:1});
  assert.equal(result.pending,0);
  assert.equal(result.archiveBoundaryPending,1);
  assert.equal(result.hydratedRecords,1);
  assert.equal(result.requiredResolutionEvents,0);
  assert.equal(result.remainingRecordSlots,0);
  assert.equal(result.state,'ARCHIVED_PENDING_CAPACITY_RESERVED');
  const blocked=assessArchivedPendingCapacity({...x,maxEvents:3,maxRecords:0});
  assert.fail('Invalid zero record limit should have thrown');
 }catch(e){
  if(e.code==='ERR_ASSERTION')throw e;
  assert.match(e.message,/Invalid monitor capacity limits/);
 }finally{fs.rmSync(x.directory,{recursive:true,force:true})}
});
