'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {hashEvent,verifyChain,createAuditJournal}=require('../audit-journal');
const {createLiveRecoveredMonitor}=require('../audit-archive-live-startup');
const {assertSafeStartupConfiguration}=require('../startup-configuration-gate');
const NOW=Date.parse('2026-11-19T20:05:00.000Z');
const sha=x=>createHash('sha256').update(x).digest('hex');
function fixture(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-live-archive-'));
 const marketId='KXBTC15M-TEST-123456';
 const capture={id:'Kalshi:'+marketId,venue:'Kalshi',marketId,slug:null,
  baselineName:'PUBLIC_MARKET_FAVORED_ASK_V1',baselineSide:'YES',
  quoteSource:'Kalshi public YES/NO asks',normalizedMarketShare:0.6,
  observedAsks:{YES:0.6,NO:0.4},spotCandidate:null,
  serverCapturedAt:'2026-11-19T20:00:00.000Z',
  quoteFetchedAt:'2026-11-19T19:59:59.000Z',
  endTime:'2026-11-19T20:02:00.000Z',leadMs:120000};
 const body={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00.000Z',
  payload:capture,previousHash:'GENESIS'};
 const archived={...body,hash:hashEvent(body)};
 const filename='shadow-segment-live-recovery.jsonl';
 const raw=JSON.stringify(archived)+'\n';
 fs.writeFileSync(path.join(directory,filename),raw);
 const manifest={version:1,segments:[{filename,sha256:sha(raw),
  chainTip:archived.hash,eventCount:1,previousChainTip:'GENESIS'}]};
 fs.writeFileSync(path.join(directory,'shadow-archive-manifest.json'),
  JSON.stringify(manifest)+'\n');
 const active=path.join(directory,'shadow-events.jsonl');
 fs.writeFileSync(active,'');
 return {directory,active,filename,manifest,marketId,clock:()=>NOW,
  quotes:{async query(){return null}},
  results:{async lookup(){return {status:'pending'}}}};
}
function quote(marketId='KXBTC15M-TEST-654321'){
 return {venue:'Kalshi',status:'live',marketId,yesAsk:0.6,noAsk:0.4,
  fetchedAt:new Date(NOW-1000).toISOString(),endTime:new Date(NOW+180000).toISOString()};
}
function cleanup(x){fs.rmSync(x.directory,{recursive:true,force:true})}
test('explicit archive startup replays pending history and durably appends new captures',()=>{
 const x=fixture();
 try{
  assert.equal(assertSafeStartupConfiguration({CASH_AUDIT_DIR:x.directory,
   CASH_EXCLUSIVE_JOURNAL_WRITER:'1',CASH_ARCHIVE_LIVE_RECOVERY:'1'}),true);
  assert.throws(()=>createAuditJournal({directory:x.directory}),/Archived journal manifest/);
  const monitor=createLiveRecoveredMonitor({...x,maxEvents:8,maxRecords:4});
  const snap=monitor.snapshot();
  assert.equal(snap.archivedHistoricalCaptures,1);
  assert.equal(snap.pending,1);
  assert.equal(snap.recordedEvents,0);
  assert.equal(snap.storageMode,'FILESYSTEM_ARCHIVE_RECOVERED_UNVERIFIED');
  assert.equal(monitor.capture(quote(x.marketId)),null);
  assert.equal(monitor.capture(quote())?.status,'PENDING');
  assert.equal(monitor.snapshot().pending,2);
  const disk=fs.readFileSync(x.active,'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(disk.length,1);
  assert.equal(disk[0].sequence,1);
  assert.match(verifyChain(disk),/^[a-f0-9]{64}$/);
  assert.equal(fs.existsSync(path.join(x.directory,'.shadow-journal-writer.lock')),false);
  const reboot=createLiveRecoveredMonitor({...x,maxEvents:8,maxRecords:4});
  assert.equal(reboot.snapshot().pending,2);
  assert.equal(reboot.snapshot().observed,2);
  assert.equal(reboot.snapshot().recoveredEvents,1);
 }finally{cleanup(x)}
});
test('committed manifest mutation blocks append and leaves in-memory state untouched',()=>{
 const x=fixture();
 try{
  const monitor=createLiveRecoveredMonitor({...x,maxEvents:8,maxRecords:4});
  fs.writeFileSync(path.join(x.directory,'shadow-archive-manifest.json'),
   JSON.stringify({...x.manifest,unused:'modified'})+'\n');
  assert.throws(()=>monitor.capture(quote()),/changed after verification/);
  assert.equal(monitor.snapshot().observed,1);
  assert.equal(fs.readFileSync(x.active,'utf8'),'');
  assert.equal(fs.existsSync(path.join(x.directory,'.shadow-journal-writer.lock')),false);
 }finally{cleanup(x)}
});
test('byte-identical segment replacement blocks append',()=>{
 const x=fixture();
 try{
  const monitor=createLiveRecoveredMonitor({...x,maxEvents:8,maxRecords:4});
  const filename=path.join(x.directory,x.filename);
  const replacement=filename+'.replacement';
  fs.writeFileSync(replacement,fs.readFileSync(filename));
  fs.renameSync(replacement,filename);
  assert.throws(()=>monitor.capture(quote()),/changed after verification/);
  assert.equal(fs.readFileSync(x.active,'utf8'),'');
 }finally{cleanup(x)}
});
test('exclusive writer lease prevents concurrent capture append',()=>{
 const x=fixture();
 try{
  const monitor=createLiveRecoveredMonitor({...x,maxEvents:8,maxRecords:4});
  const lock=path.join(x.directory,'.shadow-journal-writer.lock');
  fs.writeFileSync(lock,'occupied');
  assert.throws(()=>monitor.capture(quote()),/EEXIST/);
  assert.equal(fs.readFileSync(x.active,'utf8'),'');
  fs.unlinkSync(lock);
 }finally{cleanup(x)}
});
test('archive live startup remains explicit and external manifest fails closed',()=>{
 const x=fixture(),external=fs.mkdtempSync(path.join(os.tmpdir(),'cash-external-archive-'));
 try{
  assert.throws(()=>assertSafeStartupConfiguration({CASH_AUDIT_DIR:x.directory}),/explicit live recovery/);
  assert.throws(()=>assertSafeStartupConfiguration({CASH_AUDIT_DIR:x.directory,
   CASH_ARCHIVE_LIVE_RECOVERY:'1'}),/exclusive writer/);
  fs.writeFileSync(path.join(external,'shadow-archive-manifest.json'),'{}\n');
  assert.throws(()=>assertSafeStartupConfiguration({CASH_AUDIT_DIR:x.directory,
   CASH_ARCHIVE_LIVE_RECOVERY:'1',CASH_EXCLUSIVE_JOURNAL_WRITER:'1',
   CASH_ARCHIVE_DIR:external}),/External archived manifest/);
 }finally{cleanup(x);fs.rmSync(external,{recursive:true,force:true})}
});
