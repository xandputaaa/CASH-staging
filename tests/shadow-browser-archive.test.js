'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createBrowserArchive,verifySession}=require('../shadow-browser-archive');
function storage(){
 const state=new Map();return {getItem:k=>state.get(k)||null,
  setItem:(k,v)=>state.set(k,v),removeItem:k=>state.delete(k)};
}
let seq=0;
function makeSession(events=2){
 const now=Date.now()+seq++*5000,base=new Date(now).toISOString();
 let previous='GENESIS';const out=[];
 for(let i=0;i<events;i++){
  const body={sequence:i+1,type:'CAPTURE',recordedAt:new Date(now+i*1000).toISOString(),
   payload:{id:'Kalshi:KXBTC15M-TEST'+i},previousHash:previous};
  const hash=crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  out.push({...body,hash});previous=hash;
 }
 return {format:'CASH-shadow-volatile-v1',mode:'PUBLIC_MARKET_FAVORED_ASK_V1',
  storageMode:'VOLATILE_SERVER_SESSION',bootAt:base,events:out,headHash:previous,
  recordedEvents:out.length,qualifyingForModelAccuracy:false,
  qualifyingProspectiveContracts:0,independentForecastModel:false};
}
const factory=store=>createBrowserArchive({storage:store,cryptoImpl:crypto.webcrypto,clock:()=>Date.now()});
test('browser archive keeps different verified-for-consistency server sessions across redeploys',async()=>{
 const local=storage(),a=factory(local);
 const first=makeSession(2),second=makeSession(3);
 assert.equal((await a.capture(first)).saved,true);
 assert.equal((await a.capture(second)).saved,true);
 const reopened=factory(local),sum=reopened.summary();
 assert.equal(sum.sessions,2);assert.equal(sum.events,5);
 const v=JSON.parse(reopened.exportJson());
 assert.equal(v.qualifyingForModelAccuracy,false);
 assert.equal(v.sessions.length,2);
 assert.match(v.warning,/Not an immutable audit/);
});
test('browser archive refuses tampered event, fake qualification, or inconsistent head',async()=>{
 const local=storage(),archive=factory(local),a=makeSession(1);
 await verifySession(a,crypto.webcrypto);
 const changed={...a,events:a.events.map(e=>({...e,payload:{id:'tampered'}}))};
 await assert.rejects(archive.capture(changed),/checksum mismatch/);
 await assert.rejects(archive.capture({...a,qualifyingForModelAccuracy:true}),/invalid/);
 await assert.rejects(archive.capture({...a,headHash:'b'.repeat(64)}),/head hash mismatch/);
 assert.equal(archive.summary().events,0);
});
test('same session only grows by exact chain prefix; weaker or conflicting copies never overwrite',async()=>{
 const local=storage(),archive=factory(local),one=makeSession(1);
 await archive.capture(one);
 const newer={...one,events:one.events.concat()};
 const last=newer.events[newer.events.length-1].hash;
 const body={sequence:2,type:'RESOLUTION',recordedAt:new Date(Date.now()).toISOString(),
  payload:{id:'resolved'},previousHash:last};
 const hash=crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
 newer.events.push({...body,hash});newer.headHash=hash;newer.recordedEvents=2;
 await archive.capture(newer);
 assert.equal(archive.summary().events,2);
 assert.equal((await archive.capture(one)).saved,false);
 assert.equal((await archive.capture(newer)).saved,false);
 assert.equal(archive.summary().sessions,1);
});
test('corrupt archive and denied browser storage fail visibly, never silently reset history',async()=>{
 const local=storage();local.setItem('cash-shadow-local-archive-v1','broken-json');
 assert.throws(()=>factory(local).summary(),/invalid/);
 const denied={getItem:()=>null,setItem:()=>{throw Error('quota exceeded')},removeItem:()=>{}};
 await assert.rejects(factory(denied).capture(makeSession(1)),/quota exceeded/);
});
test('no events never implies retained history, and user can clear local archive explicitly',async()=>{
 const local=storage(),archive=factory(local);
 assert.equal((await archive.capture(makeSession(0))).saved,false);
 assert.equal(archive.summary().sessions,0);
 await archive.capture(makeSession(1));archive.clear();
 assert.equal(archive.summary().sessions,0);
});
test('browser archive script and controls are present without order submission',()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 for(const file of ['shadow-browser-archive.js','shadow-browser-archive-ui.js'])
  new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});
 const html=fs.readFileSync('index.html','utf8');
 assert.match(html,/id="cashBrowserArchive"/);
 assert.match(html,/Download browser archive/);
 assert.match(html,/storage can be cleared or evicted/);
 assert.match(html,/shadow-browser-archive-ui\.js/);
});

test('downloaded browser archive restores to another browser and deduplicates sessions',async()=>{
 const src=factory(storage()),a=makeSession(2),b=makeSession(3);
 await src.capture(a);await src.capture(b);
 const dest=factory(storage()),result=await dest.importJson(src.exportJson());
 assert.equal(result.importedSessions,2);assert.equal(result.events,5);
 assert.equal(dest.summary().sessions,2);
 assert.equal((await dest.importJson(src.exportJson())).importedSessions,0);
 assert.equal(dest.summary().events,5);
});
test('restore accepts a raw CASH server session export and refuses to shorten the saved chain',async()=>{
 const dst=factory(storage()),full=makeSession(3);
 assert.equal((await dst.importJson(JSON.stringify(full))).importedSessions,1);
 const older={...full,events:full.events.slice(0,1),headHash:full.events[0].hash,recordedEvents:1};
 const result=await dst.importJson(JSON.stringify(older));
 assert.equal(result.updatedSessions,0);assert.equal(dst.summary().events,3);
});
test('importing a longer matching session extends the archive without adding a duplicate',async()=>{
 const dst=factory(storage()),full=makeSession(3);
 const short={...full,events:full.events.slice(0,1),headHash:full.events[0].hash,recordedEvents:1};
 await dst.capture(short);
 const result=await dst.importJson(JSON.stringify(full));
 assert.equal(result.updatedSessions,1);assert.equal(dst.summary().sessions,1);
 assert.equal(dst.summary().events,3);
});
test('conflicting, fraudulent or partly invalid imports preserve existing history atomically',async()=>{
 const dst=factory(storage()),original=makeSession(2);
 await dst.capture(original);
 const other={...makeSession(1),bootAt:original.bootAt};
 await assert.rejects(dst.importJson(JSON.stringify(other)),/Conflicting event history/);
 await assert.rejects(dst.importJson(JSON.stringify({...original,independentForecastModel:true})),/invalid/);
 const okay=makeSession(1),broken={...makeSession(1),headHash:'a'.repeat(64)};
 const packageFile={format:'CASH-local-shadow-archive-v1',evictedSessions:0,
  qualifyingForModelAccuracy:false,sessions:[
   {bootAt:okay.bootAt,savedAt:new Date().toISOString(),session:okay},
   {bootAt:broken.bootAt,savedAt:new Date().toISOString(),session:broken}]};
 await assert.rejects(dst.importJson(JSON.stringify(packageFile)),/head hash mismatch/);
 assert.equal(dst.summary().events,2);assert.equal(dst.summary().sessions,1);
});
test('browser restore enforces import size and session count limits without losing existing data',async()=>{
 const dst=factory(storage()),initial=makeSession(1);await dst.capture(initial);
 await assert.rejects(dst.importJson('x'.repeat(2400000)),/too large/);
 const bundle={format:'CASH-local-shadow-archive-v1',evictedSessions:0,
  qualifyingForModelAccuracy:false,sessions:[]};
 for(let i=0;i<9;i++){
  const s=makeSession(1);bundle.sessions.push({bootAt:s.bootAt,savedAt:new Date().toISOString(),session:s});
 }
 await assert.rejects(dst.importJson(JSON.stringify(bundle)),/invalid format/);
 assert.equal(dst.summary().sessions,1);assert.equal(dst.summary().events,1);
});
test('restore JSON file picker is exposed on CASH staging page',()=>{
 const html=require('node:fs').readFileSync('index.html','utf8');
 assert.match(html,/id="archiveRestore"/);assert.match(html,/Restore JSON backup/);
});
