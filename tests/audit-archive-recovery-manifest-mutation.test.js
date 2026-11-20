'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {hashEvent}=require('../audit-journal');
const {withLeasedArchiveRecovery}=require('../audit-archive-leased-recovery');
function fixture(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-recovery-inode-'));
 const marketId='KXBTC15M-TEST-123456';
 const capture={id:'Kalshi:'+marketId,venue:'Kalshi',marketId,slug:null,
  baselineName:'PUBLIC_MARKET_FAVORED_ASK_V1',baselineSide:'YES',
  quoteSource:'Kalshi public YES/NO asks',normalizedMarketShare:0.6,
  observedAsks:{YES:0.6,NO:0.4},spotCandidate:null,
  serverCapturedAt:'2026-11-19T20:00:00.000Z',
  quoteFetchedAt:'2026-11-19T19:59:59.000Z',
  endTime:'2026-11-19T20:02:00.000Z',leadMs:120000};
 const body={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:04:00.000Z',payload:capture,previousHash:'GENESIS'};
 const event={...body,hash:hashEvent(body)};
 const filename='shadow-segment-inode.jsonl',segmentPath=path.join(directory,filename),raw=JSON.stringify(event)+'\n';
 fs.writeFileSync(segmentPath,raw);
 const activeJournalPath=path.join(directory,'shadow-events.jsonl');fs.writeFileSync(activeJournalPath,'');
 const manifest={version:1,segments:[{filename,sha256:createHash('sha256').update(raw).digest('hex'),chainTip:event.hash,eventCount:1,previousChainTip:'GENESIS'}]};
 return {directory,segmentPath,activeJournalPath,manifest};
}
test('manifest metadata mutation during consumer is rejected and lease released',()=>{
 const x=fixture();
 try{
  assert.throws(()=>withLeasedArchiveRecovery(x,()=>{
   x.manifest.segments[0].previousChainTip='CHANGED';
  }),/Archive manifest changed during leased recovery/);
  assert.equal(fs.existsSync(path.join(x.directory,'.shadow-journal-writer.lock')),false);
 }finally{fs.rmSync(x.directory,{recursive:true,force:true})}
});
test('manifest segment order mutation during consumer is rejected',()=>{
 const x=fixture();
 try{
  assert.throws(()=>withLeasedArchiveRecovery(x,()=>{
   x.manifest.segments.reverse();
   x.manifest.segments[0].eventCount=2;
  }),/Archive manifest changed during leased recovery/);
  assert.equal(fs.existsSync(path.join(x.directory,'.shadow-journal-writer.lock')),false);
 }finally{fs.rmSync(x.directory,{recursive:true,force:true})}
});
