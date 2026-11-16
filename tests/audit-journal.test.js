'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createAuditJournal,verifyChain}=require('../audit-journal');
const {createShadowMonitor}=require('../shadow-monitor');
function sandbox(fn){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-audit-test-'));
 try{return fn(directory)}finally{fs.rmSync(directory,{recursive:true,force:true})}
}
const fixture=(now,venue)=>venue==='Kalshi'?{
 venue,status:'live',marketId:'KXBTC15M-26NOV161000-00',
 yesAsk:0.61,noAsk:0.4,fetchedAt:new Date(now).toISOString(),endTime:new Date(now+180000).toISOString()
}:{
 venue,status:'live',marketId:'0x'+'a'.repeat(64),
 slug:'btc-updown-5m-'+Math.floor(now/300000)*300,
 upAsk:0.58,downAsk:0.43,fetchedAt:new Date(now).toISOString(),endTime:new Date(now+180000).toISOString()
};
function make(directory,now,outcome=null){
 const journal=createAuditJournal({directory});
 const monitor=createShadowMonitor({quotes:{query:async venue=>fixture(now,venue)},
  results:{lookup:async info=>outcome?{...info,status:'verified',winner:outcome,source:'test-official',checkedAt:new Date(now+200000).toISOString()}:null},
  clock:()=>now,journal});
 return {monitor,journal};
}
test('unset CASH audit directory retains explicit volatile mode',()=>{
 const j=createAuditJournal({directory:null});
 assert.equal(j.configured,false);assert.equal(j.mode,'VOLATILE_SERVER_SESSION');assert.equal(j.events.length,0);
});
test('durable adapter rejects relative or nonexistent directories rather than silently falling back',()=>{
 assert.throws(()=>createAuditJournal({directory:'relative'}),/absolute/);
 assert.throws(()=>createAuditJournal({directory:'/missing-cash-shadow-mount-expected'}));
});
test('filesystem event append is replayed after a simulated server restart',()=>sandbox(async directory=>{
 const t=Date.now();
 let a=make(directory,t);await a.monitor.scan();
 assert.equal(a.monitor.snapshot().observed,2);
 assert.equal(a.monitor.snapshot().storageMode,'FILESYSTEM_JOURNAL_UNVERIFIED');
 assert.equal(a.monitor.snapshot().qualifyingProspectiveContracts,0);
 const first=a.monitor.exportSession();
 assert.equal(first.events.length,2);
 const file=path.join(directory,'shadow-events.jsonl');
 assert.ok(fs.statSync(file).size>0);
 a=make(directory,t);
 const snap=a.monitor.snapshot();
 assert.equal(snap.recoveredEvents,2);
 assert.equal(snap.observed,2);assert.equal(snap.pending,2);
 assert.equal((await a.monitor.scan()).captured,0);
 assert.equal(a.monitor.exportSession().headHash,first.headHash);
 assert.equal(verifyChain(a.monitor.exportSession().events),first.headHash);
}));
test('official resolution append survives restart without double scoring',()=>sandbox(async directory=>{
 const t=Date.now();
 const initial=make(directory,t);await initial.monitor.scan();
 const reopened=make(directory,t+200000,'YES');
 await reopened.monitor.resolvePending();
 assert.equal(reopened.monitor.snapshot().correct,1);
 assert.equal(reopened.monitor.snapshot().pending,1);
 const next=make(directory,t+210000);
 assert.equal(next.monitor.snapshot().correct,1);
 assert.equal(next.monitor.snapshot().pending,1);
 assert.equal(next.monitor.snapshot().settled,1);
 assert.equal(next.monitor.exportSession().events.length,3);
}));
test('checksum mismatch and truncated journal fail closed on startup',()=>sandbox(async directory=>{
 const t=Date.now(),a=make(directory,t);await a.monitor.scan();
 const file=path.join(directory,'shadow-events.jsonl'),original=fs.readFileSync(file,'utf8');
 fs.writeFileSync(file,original.replace('"baselineSide":"YES"','"baselineSide":"NO"'));
 assert.throws(()=>createAuditJournal({directory}),/verification failed/);
 fs.writeFileSync(file,original.slice(0,-10));
 assert.throws(()=>createAuditJournal({directory}),/incomplete trailing entry/);
}));
test('broken audit sink never creates an in-memory capture disguised as persisted',async()=>{
 const t=Date.now(),journal={mode:'FILESYSTEM_JOURNAL_UNVERIFIED',configured:true,
  events:[],append(){throw Error('disk full')}};
 const monitor=createShadowMonitor({journal,clock:()=>t,
  quotes:{query:async venue=>fixture(t,venue)},
  results:{lookup:async()=>({status:'pending'})}});
 await monitor.scan();
 assert.equal(monitor.snapshot().observed,0);
 assert.equal(monitor.snapshot().recordedEvents,0);
 assert.match(monitor.snapshot().lastError,/journal/);
});
test('unexpected but checksum-valid resolution without capture is rejected',()=>sandbox(directory=>{
 const file=path.join(directory,'shadow-events.jsonl');
 const {createHash}=require('node:crypto');
 const body={sequence:1,type:'RESOLUTION',recordedAt:new Date().toISOString(),
  payload:{id:'bad',venue:'Kalshi',marketId:'KXBTC15M-BAD',winner:'YES',source:'bad',
  checkedAt:new Date().toISOString()},previousHash:'GENESIS'};
 const hash=createHash('sha256').update(JSON.stringify(body)).digest('hex');
 fs.writeFileSync(file,JSON.stringify({...body,hash})+'\n');
 const journal=createAuditJournal({directory});
 assert.throws(()=>createShadowMonitor({journal,quotes:{},results:{}}),/Saved resolution is semantically invalid/);
}));
