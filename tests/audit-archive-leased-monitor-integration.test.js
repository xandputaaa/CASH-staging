'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {hashEvent}=require('../audit-journal');
const {withLeasedArchiveRecovery}=require('../audit-archive-leased-recovery');
const {withExclusiveJournalLease}=require('../audit-journal-writer-lease');
const {createShadowMonitor}=require('../shadow-monitor');
function fixture(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-lease-monitor-'));
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
 const filename='shadow-segment-lease-monitor.jsonl',raw=JSON.stringify(event)+'\n';
 fs.writeFileSync(path.join(directory,filename),raw);
 const activeJournalPath=path.join(directory,'shadow-events.jsonl');
 fs.writeFileSync(activeJournalPath,'');
 const manifest={version:1,segments:[{filename,
  sha256:createHash('sha256').update(raw).digest('hex'),
  chainTip:event.hash,eventCount:1,previousChainTip:'GENESIS'}]};
 return {directory,activeJournalPath,manifest,id};
}
test('valid archive recovery holds lease through monitor construction and releases after return',()=>{
 const x=fixture(),lock=path.join(x.directory,'.shadow-journal-writer.lock');
 try{
  let entered=false;
  const snapshot=withLeasedArchiveRecovery(x,({plan,capacity})=>{
   entered=true;
   assert.equal(fs.existsSync(lock),true);
   assert.throws(()=>withExclusiveJournalLease({directory:x.directory},()=>{}),/EEXIST/);
   assert.equal(plan.pendingCount,1);
   assert.equal(capacity.requiredResolutionEvents,1);
   const monitor=createShadowMonitor({quotes:{},results:{},
    clock:()=>Date.parse('2026-11-19T20:05:00Z'),
    archivedPendingState:plan,journal:{events:[]},
    maxEvents:4,maxRecords:2});
   return monitor.snapshot();
  });
  assert.equal(entered,true);
  assert.equal(snapshot.pending,1);
  assert.equal(snapshot.archivedHistoricalCaptures,1);
  assert.equal(fs.existsSync(lock),false);
  withExclusiveJournalLease({directory:x.directory},()=>assert.equal(fs.existsSync(lock),true));
 }finally{fs.rmSync(x.directory,{recursive:true,force:true})}
});
test('async consumer is refused and lease released even for a valid archive',()=>{
 const x=fixture(),lock=path.join(x.directory,'.shadow-journal-writer.lock');
 try{
  assert.throws(()=>withLeasedArchiveRecovery(x,async()=>true),
   /Async archive recovery consumer unsupported/);
  assert.equal(fs.existsSync(lock),false);
 }finally{fs.rmSync(x.directory,{recursive:true,force:true})}
});
