'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createAuditJournal,verifyChain}=require('../audit-journal');
const {createShadowMonitor}=require('../shadow-monitor');
async function sandbox(fn){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-audit-test-'));
 try{return await fn(directory)}finally{fs.rmSync(directory,{recursive:true,force:true})}
}
const fixture=(now,venue)=>venue==='Kalshi'?{
 venue,status:'live',marketId:'KXBTC15M-26NOV161000-00',
 yesAsk:0.61,noAsk:0.4,fetchedAt:new Date(now).toISOString(),endTime:new Date(now+180000).toISOString()
}:{
 venue,status:'live',marketId:'0x'+'a'.repeat(64),
 slug:'btc-updown-5m-'+Math.floor(now/300000)*300,
 upAsk:0.58,downAsk:0.43,fetchedAt:new Date(now).toISOString(),endTime:new Date(now+180000).toISOString()
};
function officialFixture(info,now,winner){
 const isKal=info.venue==='Kalshi';
 const evidence=isKal?
  {venue:'Kalshi',ticker:info.marketId,status:'settled',result:({YES:'yes',NO:'no',VOID:'void'})[winner],is_provisional:false}:
  {venue:'Polymarket',slug:info.slug,conditionId:info.marketId,closed:true,
   resolutionStatus:'resolved',outcomes:['Up','Down'],outcomePrices:winner==='UP'?['1','0']:['0','1']};
 return {...info,status:'verified',winner,source:'test-official',
  checkedAt:new Date(now).toISOString(),firstObservedAt:new Date(now-21000).toISOString(),
  confirmationCount:2,evidenceSnapshot:evidence,
  evidenceSha256:require('node:crypto').createHash('sha256').update(JSON.stringify(evidence)).digest('hex'),
  evidenceSourceUrl:isKal?'https://external-api.kalshi.com/trade-api/v2/markets/'+info.marketId:
   'https://gamma-api.polymarket.com/events?slug='+info.slug};
}
function make(directory,now,outcome=null){
 const journal=createAuditJournal({directory});
 const monitor=createShadowMonitor({quotes:{query:async venue=>fixture(now,venue)},
  results:{lookup:async info=>outcome?officialFixture(info,now+200000,outcome):null},
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

test('independent spot candidate and source evidence survive journal replay, still not qualifying',()=>sandbox(async directory=>{
 const t=Date.now(),history=[-100000,-90000,-75000,-60000,-45000,-30000,-15000,0].map((dt,i)=>({
   time:new Date(t+dt).toISOString(),price:85100+i*4,source:'Kraken BTC/USD'
 }));
 const quotes={query:async venue=>fixture(t,venue)},results={lookup:async()=>({status:'pending'})};
 const first=createShadowMonitor({journal:createAuditJournal({directory}),quotes,results,clock:()=>t,
   spot:{view:()=>({status:'live',source:'Kraken BTC/USD',history})}});
 await first.scan();
 assert.equal(first.snapshot().spotCandidateObservations,2);
 assert.equal(first.snapshot().qualifyingProspectiveContracts,0);
 const restored=createShadowMonitor({journal:createAuditJournal({directory}),quotes,results,clock:()=>t});
 assert.equal(restored.snapshot().spotCandidateObservations,2);
 assert.ok(restored.snapshot().recent.every(x=>x.spotCandidate?.name==='SPOT_MOMENTUM_90S_V1'));
 assert.equal(restored.snapshot().spotCandidateSettled,0);
 assert.equal(restored.snapshot().qualifyingProspectiveContracts,0);
}));
test('checksum-valid but semantically fabricated independent prediction fails closed',()=>sandbox(async directory=>{
 const t=Date.now(),first=make(directory,t);await first.monitor.scan();
 const file=path.join(directory,'shadow-events.jsonl'),events=fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);
 events[0].payload.spotCandidate={name:'SPOT_MOMENTUM_90S_V1',predictedDirection:'UP',
  predictedContractSide:'NO',source:'Kraken BTC/USD',calibratedProbability:null};
 const crypto=require('node:crypto');let previous='GENESIS';
 for(const event of events){event.previousHash=previous;const {hash,...body}=event;
   event.hash=crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');previous=event.hash}
 fs.writeFileSync(file,events.map(x=>JSON.stringify(x)).join('\n')+'\n');
 const journal=createAuditJournal({directory});
 assert.throws(()=>createShadowMonitor({journal,quotes:{},results:{}}),/Saved capture is semantically invalid/);
}));

test('public evidence fields and digest remain auditable after filesystem journal replay',()=>sandbox(async directory=>{
 const t=Date.now();let clock=t;
 const evidenceSnapshot={venue:'Kalshi',ticker:'KXBTC15M-26NOV161000-00',status:'settled',result:'yes',
   is_provisional:false,settlement_ts:null,close_time:new Date(t+180000).toISOString()};
 const crypto=require('node:crypto');
 const digest=crypto.createHash('sha256').update(JSON.stringify(evidenceSnapshot)).digest('hex');
 const quotes={query:async venue=>fixture(t,venue)};
 const results={lookup:async info=>info.venue==='Kalshi'?{...info,status:'verified',winner:'YES',
   checkedAt:new Date(clock).toISOString(),source:'Kalshi public market result',settledAt:null,
   confirmationCount:2,firstObservedAt:new Date(clock-21000).toISOString(),
   evidenceSha256:digest,evidenceSnapshot,
   evidenceSourceUrl:'https://external-api.kalshi.com/trade-api/v2/markets/'+info.marketId
  }:{...info,status:'pending',reason:'Not final'}};
 const first=createShadowMonitor({journal:createAuditJournal({directory}),clock:()=>clock,quotes,results});
 await first.scan();clock=t+200000;await first.resolvePending();
 const before=first.exportSession();
 assert.equal(before.events.length,3);
 const resolved=before.events.find(e=>e.type==='RESOLUTION');
 assert.equal(resolved.payload.confirmationCount,2);
 assert.equal(resolved.payload.evidenceSha256,digest);
 const restored=createShadowMonitor({journal:createAuditJournal({directory}),clock:()=>clock,quotes,results});
 const record=restored.snapshot().recent.find(x=>x.venue==='Kalshi');
 assert.equal(record.status,'CORRECT');
 assert.equal(record.outcomeEvidence.evidenceSha256,digest);
 assert.equal(restored.exportSession().headHash,before.headHash);
}));
test('tampered public evidence snapshot fails semantic audit replay even with recomputed chain hashes',()=>sandbox(async directory=>{
 const t=Date.now();let clock=t;
 const crypto=require('node:crypto');
 const evidenceSnapshot={venue:'Kalshi',ticker:'KXBTC15M-26NOV161000-00',status:'settled',result:'yes'};
 const digest=crypto.createHash('sha256').update(JSON.stringify(evidenceSnapshot)).digest('hex');
 const monitor=createShadowMonitor({journal:createAuditJournal({directory}),clock:()=>clock,
  quotes:{query:async venue=>fixture(t,venue)},
  results:{lookup:async info=>info.venue==='Kalshi'?{...info,status:'verified',winner:'YES',source:'official',
   checkedAt:new Date(clock).toISOString(),confirmationCount:2,
   firstObservedAt:new Date(clock-22000).toISOString(),evidenceSha256:digest,evidenceSnapshot,
   evidenceSourceUrl:'https://external-api.kalshi.com/trade-api/v2/markets/'+info.marketId}:null}});
 await monitor.scan();clock=t+200000;await monitor.resolvePending();
 const filename=path.join(directory,'shadow-events.jsonl'),events=fs.readFileSync(filename,'utf8').trim().split('\n').map(JSON.parse);
 const outcome=events.find(e=>e.type==='RESOLUTION');
 assert.ok(outcome);
 outcome.payload.evidenceSnapshot.result='no';
 let previous='GENESIS';
 for(const e of events){e.previousHash=previous;const {hash,...body}=e;e.hash=crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');previous=e.hash}
 fs.writeFileSync(filename,events.map(e=>JSON.stringify(e)).join('\n')+'\n');
 const journal=createAuditJournal({directory});
 assert.throws(()=>createShadowMonitor({journal,quotes:{},results:{}}),/Saved resolution is semantically invalid/);
}));
