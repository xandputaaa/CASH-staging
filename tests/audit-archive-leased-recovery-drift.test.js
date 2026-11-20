'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {hashEvent}=require('../audit-journal');
const {withLeasedArchiveRecovery}=require('../audit-archive-leased-recovery');
function fixture(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-lease-drift-'));
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
 const filename='shadow-segment-drift.jsonl',raw=JSON.stringify(event)+'\n';
 fs.writeFileSync(path.join(directory,filename),raw);
 const activeJournalPath=path.join(directory,'shadow-events.jsonl');
 fs.writeFileSync(activeJournalPath,'');
 const manifest={version:1,segments:[{filename,
  sha256:createHash('sha256').update(raw).digest('hex'),
  chainTip:event.hash,eventCount:1,previousChainTip:'GENESIS'}]};
 return {directory,activeJournalPath,manifest};
}
test('noncooperating append during consumer invalidates leased recovery',()=>{
 const x=fixture(),lock=path.join(x.directory,'.shadow-journal-writer.lock');
 try{
  let called=false;
  assert.throws(()=>withLeasedArchiveRecovery(x,()=>{
   called=true;
   assert.equal(fs.existsSync(lock),true);
   fs.appendFileSync(x.activeJournalPath,'UNVERIFIED\n');
   return 'must not be accepted';
  }),/Active journal changed during leased recovery/);
  assert.equal(called,true);
  assert.equal(fs.existsSync(lock),false);
 }finally{fs.rmSync(x.directory,{recursive:true,force:true})}
});
test('noncooperating replacement during consumer invalidates leased recovery',()=>{
 const x=fixture(),lock=path.join(x.directory,'.shadow-journal-writer.lock');
 try{
  assert.throws(()=>withLeasedArchiveRecovery(x,()=>{
   fs.renameSync(x.activeJournalPath,x.activeJournalPath+'.old');
   fs.writeFileSync(x.activeJournalPath,'replacement\n');
  }),/Active journal changed during leased recovery/);
  assert.equal(fs.existsSync(lock),false);
 }finally{fs.rmSync(x.directory,{recursive:true,force:true})}
});
test('unchanged active journal permits synchronous consumer result',()=>{
 const x=fixture();
 try{
  const result=withLeasedArchiveRecovery(x,({plan,capacity})=>{
   assert.equal(plan.pendingCount,1);
   assert.equal(capacity.requiredResolutionEvents,1);
   return 'verified-offline';
  });
  assert.equal(result,'verified-offline');
 }finally{fs.rmSync(x.directory,{recursive:true,force:true})}
});
