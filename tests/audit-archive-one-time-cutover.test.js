'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {hashEvent}=require('../audit-journal');
const {cutoverFullShadowJournal}=require('../audit-archive-one-time-cutover');
const {createLiveRecoveredMonitor}=require('../audit-archive-live-startup');
const {verifyArchiveManifest}=require('../audit-archive-manifest');
const stamp='2026-11-19T20:03:00.000Z';
const SHA=s=>createHash('sha256').update(s).digest('hex');
function fixture(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-full-journal-'));
 const active=path.join(directory,'shadow-events.jsonl');
 const events=[];let last='GENESIS';
 function append(type,payload){
  const body={sequence:events.length+1,type,recordedAt:stamp,payload,previousHash:last};
  const event={...body,hash:hashEvent(body)};
  events.push(event);last=event.hash;
 }
 const captures=[];
 for(let i=0;i<300;i++){
  const marketId='KXBTC15M-TEST-'+String(i).padStart(6,'0');
  const capture={id:'Kalshi:'+marketId,venue:'Kalshi',marketId,slug:null,
   baselineName:'PUBLIC_MARKET_FAVORED_ASK_V1',baselineSide:'YES',
   quoteSource:'Kalshi public YES/NO asks',normalizedMarketShare:0.6,
   observedAsks:{YES:0.6,NO:0.4},spotCandidate:null,
   serverCapturedAt:'2026-11-19T20:00:00.000Z',
   quoteFetchedAt:'2026-11-19T19:59:59.000Z',
   endTime:'2026-11-19T20:02:00.000Z',leadMs:120000};
  captures.push(capture);append('CAPTURE',capture);
 }
 for(const capture of captures){
  const evidenceSnapshot={venue:'Kalshi',ticker:capture.marketId,status:'settled',result:'yes'};
  const resolution={id:capture.id,venue:'Kalshi',marketId:capture.marketId,winner:'YES',
   source:'Kalshi official public market',checkedAt:'2026-11-19T20:03:00.000Z',
   firstObservedAt:'2026-11-19T20:02:30.000Z',
   evidenceSourceUrl:'https://external-api.kalshi.com/trade-api/v2/markets/'+capture.marketId,
   evidenceSnapshot,confirmationCount:2,evidenceSha256:SHA(JSON.stringify(evidenceSnapshot))};
  append('RESOLUTION',resolution);
 }
 const bytes=Buffer.from(events.map(x=>JSON.stringify(x)).join('\n')+'\n');
 fs.writeFileSync(active,bytes);
 return {directory,active,bytes,events};
}
function cleanup(x){fs.rmSync(x.directory,{recursive:true,force:true})}
test('one-time cutover preserves all settled history and live monitor gains new capacity',()=>{
 const x=fixture();
 try{
  const result=cutoverFullShadowJournal({directory:x.directory,expectedEvents:600});
  assert.equal(result.state,'VERIFIED_CUTOVER_COMMITTED');
  assert.equal(result.archivedEvents,600);
  assert.equal(fs.readFileSync(x.active).length,0);
  const manifest=JSON.parse(fs.readFileSync(path.join(x.directory,'shadow-archive-manifest.json'),'utf8'));
  assert.equal(verifyArchiveManifest(manifest,{directory:x.directory}).totalEvents,600);
  assert.equal(fs.readFileSync(path.join(x.directory,manifest.segments[0].filename)).equals(x.bytes),true);
  const now=Date.parse('2026-11-19T20:05:00Z');
  const options={directory:x.directory,clock:()=>now,maxEvents:650,maxRecords:300,
   quotes:{async query(){return null}},results:{async lookup(){return {status:'pending'}}}};
  const monitor=createLiveRecoveredMonitor(options);
  assert.equal(monitor.snapshot().archivedHistoricalCaptures,300);
  assert.equal(monitor.snapshot().observed,0);
  assert.ok(monitor.snapshot().capacity.safeNewCaptures>0);
  const quote={venue:'Kalshi',status:'live',marketId:'KXBTC15M-TEST-999999',
   yesAsk:0.6,noAsk:0.4,fetchedAt:new Date(now-1000).toISOString(),
   endTime:new Date(now+180000).toISOString()};
  assert.equal(monitor.capture(quote)?.status,'PENDING');
  const content=fs.readFileSync(x.active);
  assert.ok(content.length>0);
  assert.equal(cutoverFullShadowJournal({directory:x.directory}).state,'ARCHIVE_ALREADY_COMMITTED');
  assert.equal(fs.readFileSync(x.active).equals(content),true);
  assert.equal(createLiveRecoveredMonitor(options).snapshot().pending,1);
 }finally{cleanup(x)}
});
test('interrupted manifest-first cutover resumes without losing original bytes',()=>{
 const x=fixture();
 try{
  const filename='shadow-segment-0600-'+SHA(x.bytes).slice(0,16)+'.jsonl';
  fs.writeFileSync(path.join(x.directory,filename),x.bytes);
  const manifest={version:1,segments:[{filename,sha256:SHA(x.bytes),
   chainTip:x.events.at(-1).hash,eventCount:600,previousChainTip:'GENESIS'}]};
  fs.writeFileSync(path.join(x.directory,'shadow-archive-manifest.json'),
   JSON.stringify(manifest)+'\n');
  const recovery=cutoverFullShadowJournal({directory:x.directory,expectedEvents:600});
  assert.equal(recovery.state,'COMMITTED_CUTOVER_CRASH_RECOVERED');
  assert.equal(fs.readFileSync(x.active).length,0);
  assert.equal(fs.readFileSync(path.join(x.directory,filename)).equals(x.bytes),true);
 }finally{cleanup(x)}
});
test('unexpected count and invalid journal refuse cutover without committing manifest',()=>{
 const x=fixture();
 try{
  assert.throws(()=>cutoverFullShadowJournal({directory:x.directory,expectedEvents:599}),/Expected full source/);
  assert.equal(fs.existsSync(path.join(x.directory,'shadow-archive-manifest.json')),false);
  fs.appendFileSync(x.active,'CORRUPT\n');
  assert.throws(()=>cutoverFullShadowJournal({directory:x.directory}),/chain verification|Invalid|Audit event|JSON/i);
  assert.equal(fs.existsSync(path.join(x.directory,'shadow-archive-manifest.json')),false);
 }finally{cleanup(x)}
});
test('active competing writer lease blocks cutover and preserves original journal',()=>{
 const x=fixture();
 try{
  const lock=path.join(x.directory,'.shadow-journal-writer.lock');
  fs.writeFileSync(lock,'held');
  assert.throws(()=>cutoverFullShadowJournal({directory:x.directory}),/EEXIST/);
  assert.equal(fs.readFileSync(x.active).equals(x.bytes),true);
  assert.equal(fs.existsSync(path.join(x.directory,'shadow-archive-manifest.json')),false);
 }finally{cleanup(x)}
});
