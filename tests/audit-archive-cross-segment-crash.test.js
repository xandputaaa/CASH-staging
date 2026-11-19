'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {hashEvent}=require('../audit-journal');
const {verifyArchiveRecoveryConsistency}=require('../audit-archive-recovery-consistency');
function makeEvent(type,payload,sequence=1,previousHash='GENESIS'){
 const body={sequence,type,recordedAt:'2026-11-19T20:04:00.000Z',payload,previousHash};
 return {...body,hash:hashEvent(body)};
}
function fixture(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-cross-crash-'));
 const marketId='KXBTC15M-TEST-123456',id='Kalshi:'+marketId;
 const payload={id,venue:'Kalshi',marketId,slug:null,
  baselineName:'PUBLIC_MARKET_FAVORED_ASK_V1',baselineSide:'YES',
  quoteSource:'Kalshi public YES/NO asks',normalizedMarketShare:0.6,
  observedAsks:{YES:0.6,NO:0.4},spotCandidate:null,
  serverCapturedAt:'2026-11-19T20:00:00.000Z',
  quoteFetchedAt:'2026-11-19T19:59:59.000Z',
  endTime:'2026-11-19T20:02:00.000Z',leadMs:120000};
 const archived=makeEvent('CAPTURE',payload);
 const filename='shadow-segment-crash.jsonl',raw=JSON.stringify(archived)+'\n';
 fs.writeFileSync(path.join(directory,filename),raw);
 const activeJournalPath=path.join(directory,'shadow-events.jsonl');
 fs.writeFileSync(activeJournalPath,'');
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
 return {directory,activeJournalPath,manifest,resolution,
  options:{manifest,directory,activeJournalPath}};
}
test('truncated active resolution is rejected, never interpreted as pending or settled',()=>{
 const f=fixture();
 try{
  const event=makeEvent('RESOLUTION',f.resolution);
  fs.writeFileSync(f.activeJournalPath,JSON.stringify(event).slice(0,-5));
  assert.throws(()=>verifyArchiveRecoveryConsistency(f.options),/Incomplete active journal/);
 }finally{fs.rmSync(f.directory,{recursive:true,force:true})}
});
test('orphan and duplicate active resolutions are rejected across archive boundary',()=>{
 const f=fixture();
 try{
  const orphan=makeEvent('RESOLUTION',{...f.resolution,id:'Kalshi:KXBTC15M-OTHER-123456'});
  fs.writeFileSync(f.activeJournalPath,JSON.stringify(orphan)+'\n');
  assert.throws(()=>verifyArchiveRecoveryConsistency(f.options),/Orphan or duplicate resolution/);
  const first=makeEvent('RESOLUTION',f.resolution);
  const second=makeEvent('RESOLUTION',f.resolution,2,first.hash);
  fs.writeFileSync(f.activeJournalPath,JSON.stringify(first)+'\n'+JSON.stringify(second)+'\n');
  assert.throws(()=>verifyArchiveRecoveryConsistency(f.options),/Orphan or duplicate resolution/);
 }finally{fs.rmSync(f.directory,{recursive:true,force:true})}
});
test('invalid settlement hash does not resolve archived pending capture',()=>{
 const f=fixture();
 try{
  const event=makeEvent('RESOLUTION',{...f.resolution,evidenceSha256:'0'.repeat(64)});
  fs.writeFileSync(f.activeJournalPath,JSON.stringify(event)+'\n');
  assert.throws(()=>verifyArchiveRecoveryConsistency(f.options),/Semantically invalid archived resolution/);
 }finally{fs.rmSync(f.directory,{recursive:true,force:true})}
});
