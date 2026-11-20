'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {hashEvent}=require('../audit-journal');
const {createOfflineRecoveredMonitor}=require('../audit-archive-offline-monitor');
function fixture(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-offline-monitor-'));
 const marketId='KXBTC15M-TEST-123456',id='Kalshi:'+marketId;
 const capture={id,venue:'Kalshi',marketId,slug:null,
  baselineName:'PUBLIC_MARKET_FAVORED_ASK_V1',baselineSide:'YES',
  quoteSource:'Kalshi public YES/NO asks',normalizedMarketShare:0.6,
  observedAsks:{YES:0.6,NO:0.4},spotCandidate:null,
  serverCapturedAt:'2026-11-19T20:00:00.000Z',
  quoteFetchedAt:'2026-11-19T19:59:59.000Z',
  endTime:'2026-11-19T20:02:00.000Z',leadMs:120000};
 const body={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:04:00.000Z',
  payload:capture,previousHash:'GENESIS'};
 const event={...body,hash:hashEvent(body)};
 const filename='shadow-segment-offline-monitor.jsonl',raw=JSON.stringify(event)+'\n';
 fs.writeFileSync(path.join(directory,filename),raw);
 const activeJournalPath=path.join(directory,'shadow-events.jsonl');
 fs.writeFileSync(activeJournalPath,'');
 const manifest={version:1,segments:[{filename,
  sha256:createHash('sha256').update(raw).digest('hex'),
  chainTip:event.hash,eventCount:1,previousChainTip:'GENESIS'}]};
 return {directory,activeJournalPath,manifest,id};
}
test('offline factory returns archived pending snapshot with no writable monitor',()=>{
 const x=fixture();
 try{
  const result=createOfflineRecoveredMonitor({...x,maxEvents:4,maxRecords:2,
   clock:()=>Date.parse('2026-11-19T20:05:00Z')});
  assert.equal(result.snapshot.pending,1);
  assert.equal(result.snapshot.archivedHistoricalCaptures,1);
  assert.equal(result.liveStartupEnabled,false);
  assert.equal(result.automaticRolloverEnabled,false);
  assert.equal(result.mutatesStorage,false);
  assert.equal(result.evidenceStatus,'FILESYSTEM_JOURNAL_UNVERIFIED');
  assert.equal(Object.hasOwn(result,'monitor'),false);
  assert.equal(fs.existsSync(path.join(x.directory,'.shadow-journal-writer.lock')),false);
 }finally{fs.rmSync(x.directory,{recursive:true,force:true})}
});
test('offline factory fails closed for corrupted active journal and releases lease',()=>{
 const x=fixture();
 try{
  fs.writeFileSync(x.activeJournalPath,'INVALID\n');
  assert.throws(()=>createOfflineRecoveredMonitor(x));
  assert.equal(fs.existsSync(path.join(x.directory,'.shadow-journal-writer.lock')),false);
 }finally{fs.rmSync(x.directory,{recursive:true,force:true})}
});
