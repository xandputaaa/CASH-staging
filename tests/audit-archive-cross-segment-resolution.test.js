'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {hashEvent}=require('../audit-journal');
const {verifyArchiveRecoveryConsistency}=require('../audit-archive-recovery-consistency');
function event(type,payload){
 const body={sequence:1,type,recordedAt:'2026-11-19T20:04:00.000Z',
  payload,previousHash:'GENESIS'};
 return {...body,hash:hashEvent(body)};
}
test('active settlement resolves an archived capture without counting it twice',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-cross-archive-resolution-'));
 try{
  const marketId='KXBTC15M-TEST-123456',id='Kalshi:'+marketId;
  const capture={id,venue:'Kalshi',marketId,slug:null,
   baselineName:'PUBLIC_MARKET_FAVORED_ASK_V1',baselineSide:'YES',
   quoteSource:'Kalshi public YES/NO asks',normalizedMarketShare:0.6,
   observedAsks:{YES:0.6,NO:0.4},spotCandidate:null,
   serverCapturedAt:'2026-11-19T20:00:00.000Z',
   quoteFetchedAt:'2026-11-19T19:59:59.000Z',
   endTime:'2026-11-19T20:02:00.000Z',leadMs:120000};
  const archived=event('CAPTURE',capture),filename='shadow-segment-cross-resolution.jsonl';
  const raw=JSON.stringify(archived)+'\n';
  fs.writeFileSync(path.join(directory,filename),raw);
  const manifest={version:1,segments:[{filename,
   sha256:createHash('sha256').update(raw).digest('hex'),
   chainTip:archived.hash,eventCount:1,previousChainTip:'GENESIS'}]};
  const activeJournalPath=path.join(directory,'shadow-events.jsonl');
  fs.writeFileSync(activeJournalPath,'');
  const options={manifest,directory,activeJournalPath};
  const before=verifyArchiveRecoveryConsistency(options);
  assert.equal(before.pendingCount,1);
  assert.equal(before.capturedCount,1);
  const evidenceSnapshot={venue:'Kalshi',ticker:marketId,status:'settled',result:'yes'};
  const resolution={id,venue:'Kalshi',marketId,winner:'YES',
   source:'Kalshi public market',checkedAt:'2026-11-19T20:03:00.000Z',
   firstObservedAt:'2026-11-19T20:02:30.000Z',
   evidenceSourceUrl:'https://external-api.kalshi.com/trade-api/v2/markets/'+marketId,
   evidenceSnapshot,confirmationCount:2,
   evidenceSha256:createHash('sha256').update(JSON.stringify(evidenceSnapshot)).digest('hex')};
  fs.writeFileSync(activeJournalPath,JSON.stringify(event('RESOLUTION',resolution))+'\n');
  const after=verifyArchiveRecoveryConsistency(options);
  assert.equal(after.capturedCount,1);
  assert.equal(after.resolvedCount,1);
  assert.equal(after.pendingCount,0);
  assert.deepEqual(after.capturedIds,[id]);
  assert.equal(after.archivedEvents,1);
  assert.equal(after.activeEvents,1);
  assert.equal(after.liveStartupEnabled,false);
  assert.equal(after.evidenceStatus,'FILESYSTEM_JOURNAL_UNVERIFIED');
  assert.throws(()=>verifyArchiveRecoveryConsistency({...options,activeJournalPath:path.join(directory,'missing.jsonl')}));
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
