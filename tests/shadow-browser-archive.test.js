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
