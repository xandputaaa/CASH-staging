'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createLateCheckpointStore}=require('../late-checkpoint-store');
const {createLateCheckpointMonitor}=require('../late-checkpoint-monitor');
const {archiveSources}=require('../public-session-archive');
const {inspectCompletedLateSegments,checkOfflineLateRotation,rotateCompletedLateJournal,APPROVAL}
 =require('../late-checkpoint-rotation');
const SHA=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const BUF_SHA=x=>crypto.createHash('sha256').update(x).digest('hex');
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'cash-late-rotation-'));
const iso=n=>new Date(n).toISOString(),START=Date.parse('2026-11-18T12:00:00.000Z');
const MODEL='KXBTC15M_LATE_CHECKPOINT_SHADOW_V1';
const market=i=>'KXBTC15M-26NOV18'+String(i).padStart(4,'0')+'-00';
function fixture(n=160,withOutcomes=true){
 const events=[],inputs=[],idSet=new Set();
 let previousHash='GENESIS';
 function push(type,p,at){
  const body={sequence:events.length+1,recordedAt:iso(at),type,
    payload:p,previousHash};
  const e={...body,hash:SHA(body)};
  events.push(e);previousHash=e.hash;
 }
 for(let i=0;i<n;i++){
  const at=START+i*60000,id=market(i);
  idSet.add(id);
  const p={marketId:id,model:MODEL,
   referenceModel:'KXBTC15M_SETTLEMENT_EARLY_V3',
   sourceType:'SINGLE_EXCHANGE_PROXY',indexSourceType:'SINGLE_EXCHANGE_PROXY',
   at:iso(at),endTime:iso(at+180000),leadMs:180000,side:null,
   officialStrikeAtFreeze:85000,strikeTypeAtFreeze:'greater_or_equal',
   inputCommitment:SHA('input'+i),sampleCommitment:SHA('samples'+i),
   publicAskAtFreeze:{YES:.56,NO:.45},publicAskQuoteFetchedAt:iso(at),
   feeScheduleAtFreeze:null,
   validation:'UNVALIDATED_LATE_CHECKPOINT',realMoneyAuthorized:false,
   calibratedProbability:null,expectedValue:null};
  inputs.push(p);push('FORECAST',p,at);
 }
 if(withOutcomes){
  const at=START+n*60000+4*60000;
  for(const p of inputs){
   push('OUTCOME',{
    marketId:p.marketId,winner:'VOID',checkedAt:iso(at),
    firstObservedAt:iso(at-1000),evidenceSha256:SHA('void'+p.marketId),
    evidenceSourceUrl:'https://external-api.kalshi.com/trade-api/v2/markets/'+p.marketId,
    confirmationCount:2,numericRuleStatus:'VOID',
   },at);
  }
 }
 return {late:{
  version:'CASH_LATE_CHECKPOINT_SHADOW_V1',
  format:'CASH_LATE_CHECKPOINT_UNVERIFIED_HASH_CHAIN_V1',
  storage:'FILESYSTEM_JOURNAL_UNVERIFIED',events,headHash:previousHash,
  records:n,pending:withOutcomes?0:n,
  independentQualification:0,independentlyTimeAttested:false,
  calibrated:false,realMoneyAuthorized:false,canExecuteOrders:false,
 },idSet};
}
const metadata={
 repository:'xandputaaa/CASH-staging',event:'schedule',
 headBranch:'main',headSha:'a'.repeat(40),runId:'44380000001',
 createdAt:'2026-11-18T15:00:00Z',
 completedAt:'2026-11-18T15:02:00Z'
};
function setup(n=160,settled=true){
 const d=tmp(),archiveRoot=tmp(),{late,idSet}=fixture(n,settled);
 const raw=Buffer.from(late.events.map(e=>JSON.stringify(e)).join('\n')+'\n');
 fs.writeFileSync(path.join(d,'late-checkpoint-events.jsonl'),raw,{mode:0o600});
 archiveSources({early:null,late,root:archiveRoot,source:metadata,
  lateBytes:Buffer.from(JSON.stringify(late))});
 return {d,archiveRoot,late,idSet,raw,clean(){fs.rmSync(d,{recursive:true,force:true});
  fs.rmSync(archiveRoot,{recursive:true,force:true})}};
}
test('fully settled 160 freeze source can be audited offline with no mutation or restart',()=>{
 const x=setup();try{
  const before=fs.readFileSync(path.join(x.d,'late-checkpoint-events.jsonl'));
  const plan=checkOfflineLateRotation({directory:x.d,late:x.late,archiveRoot:x.archiveRoot});
  assert.equal(plan.ready,true);
  assert.equal(plan.frozenInActive,160);
  assert.equal(plan.settledInActive,160);
  assert.equal(plan.completeSegments,0);
  assert.equal(plan.safeToRestartRunningRailway,false);
  assert.equal(plan.activeJournalSha256,BUF_SHA(before));
  assert.equal(plan.independentlyQualifiedCount,0);
  assert.deepEqual(fs.readdirSync(x.d),['late-checkpoint-events.jsonl']);
 }finally{x.clean()}
});
test('operator-approved offline completed rotation preserves every historical byte and forbids market reuse',async()=>{
 const x=setup();try{
  const before=x.raw;
  assert.throws(()=>rotateCompletedLateJournal({
   directory:x.d,late:x.late,archiveRoot:x.archiveRoot
  }),/separate explicit operator approval/);
  const result=rotateCompletedLateJournal({
   directory:x.d,late:x.late,archiveRoot:x.archiveRoot,approval:APPROVAL
  });
  assert.equal(result.completedSegments,1);
  assert.equal(result.safeToRestartRunningRailway,false);
  assert.equal(result.independentlyQualifiedCount,0);
  assert.equal(fs.existsSync(path.join(x.d,'late-checkpoint-events.jsonl')),false);
  const segments=inspectCompletedLateSegments(x.d);
  assert.equal(segments.completedSegments,1);
  assert.equal(segments.previouslyFrozenMarkets,160);
  assert.equal(segments.priorMarketIds.length,160);
  const seg=path.join(x.d,'late-checkpoint-completed',BUF_SHA(before)+'.jsonl');
  assert.deepEqual(fs.readFileSync(seg),before);
  const store=createLateCheckpointStore({directory:x.d});
  assert.equal(store.events.length,0);
  assert.equal(store.priorMarketIds.length,160);
  assert.equal(store.priorCompletedSegments,1);
  let t=START,marketId=market(0);
  const monitor=createLateCheckpointMonitor({
   store,clock:()=>t,
   quotes:{query:async()=>({marketId,endTime:iso(t+180000)})},
   spot:{update:async()=>({})},results:{lookup:async()=>({status:'pending'})}
  });
  await monitor.scan();
  assert.equal(monitor.snapshot().records,0);
  assert.equal(monitor.snapshot().lastReason,'ALREADY_FROZEN');
  assert.equal(monitor.snapshot().priorCompletedMarketCount,160);
  assert.equal(store.priorMarketIds.includes(market(0)),true);
 }finally{x.clean()}
});
test('pending outcome or fewer than 160 frozen markets blocks rotation',()=>{
 for(const [n,settled] of [[160,false],[159,true]]){
  const x=setup(n,settled);try{
   const p=checkOfflineLateRotation({directory:x.d,late:x.late,archiveRoot:x.archiveRoot});
   assert.equal(p.ready,false);
   assert.equal(p.reason,'ACTIVE_LATE_JOURNAL_NOT_FULLY_SETTLED');
   assert.throws(()=>rotateCompletedLateJournal({
    directory:x.d,late:x.late,archiveRoot:x.archiveRoot,approval:APPROVAL
   }),/Offline rotation blocked/);
   assert.deepEqual(fs.readFileSync(path.join(x.d,'late-checkpoint-events.jsonl')),x.raw);
  }finally{x.clean()}
 }
});
test('stale local archive lacking all source-reported outcomes blocks rotation',()=>{
 const x=setup();try{
  const p=path.join(x.archiveRoot,'public-sessions','late-v1',x.late.events[0].hash,market(0)+'.json');
  const record=JSON.parse(fs.readFileSync(p,'utf8'));
  record.outcome=null;
  fs.writeFileSync(p,JSON.stringify(record,null,2)+'\n');
  const state=checkOfflineLateRotation({directory:x.d,late:x.late,archiveRoot:x.archiveRoot});
  assert.equal(state.ready,false);
  assert.equal(state.reason,'CURRENT_SOURCE_MISSING_COMPLETE_LOCAL_ARCHIVE_COPY');
  assert.equal(fs.existsSync(path.join(x.d,'late-checkpoint-completed')),false);
 }finally{x.clean()}
});
test('stale source export not matching disk event head cannot rotate',()=>{
 const x=setup();try{
  const changed=structuredClone(x.late);
  changed.events[0].payload.side='YES';
  assert.throws(()=>checkOfflineLateRotation({
   directory:x.d,late:changed,archiveRoot:x.archiveRoot
  }),/checksum|hash mismatch/);
  assert.deepEqual(fs.readFileSync(path.join(x.d,'late-checkpoint-events.jsonl')),x.raw);
 }finally{x.clean()}
});
test('existing lock prevents rotation and is never deleted or bypassed',()=>{
 const x=setup();try{
  const lock=path.join(x.d,'.late-checkpoint-events.write.lock');
  fs.writeFileSync(lock,'writer');
  const p=checkOfflineLateRotation({directory:x.d,late:x.late,archiveRoot:x.archiveRoot});
  assert.equal(p.reason,'EXISTING_WRITER_LOCK_OPERATOR_REVIEW');
  assert.equal(p.ready,false);
  assert.throws(()=>rotateCompletedLateJournal({
   directory:x.d,late:x.late,archiveRoot:x.archiveRoot,approval:APPROVAL
  }),/Offline rotation blocked/);
  assert.equal(fs.readFileSync(lock,'utf8'),'writer');
 }finally{x.clean()}
});
test('crash after completed hardlink but before active unlink refuses automatic resume',()=>{
 const x=setup();try{
  const folder=path.join(x.d,'late-checkpoint-completed');
  fs.mkdirSync(folder);
  fs.linkSync(path.join(x.d,'late-checkpoint-events.jsonl'),
    path.join(folder,BUF_SHA(x.raw)+'.jsonl'));
  assert.throws(()=>createLateCheckpointStore({directory:x.d}),
   /repeats previously completed|Incomplete completed-journal handoff/);
  assert.throws(()=>rotateCompletedLateJournal({
   directory:x.d,late:x.late,archiveRoot:x.archiveRoot,approval:APPROVAL
  }),/previously completed market/);
  assert.deepEqual(fs.readFileSync(path.join(x.d,'late-checkpoint-events.jsonl')),x.raw);
 }finally{x.clean()}
});
test('completed segment corruption, unexpected files, or dangling symlink blocks new session startup',()=>{
 for(const variant of ['tamper','extra','symlink']){
  const x=setup();try{
   rotateCompletedLateJournal({
    directory:x.d,late:x.late,archiveRoot:x.archiveRoot,approval:APPROVAL
   });
   const folder=path.join(x.d,'late-checkpoint-completed');
   if(variant==='tamper'){
    const f=path.join(folder,BUF_SHA(x.raw)+'.jsonl');
    fs.appendFileSync(f,'X');
   }else if(variant==='extra'){
    fs.writeFileSync(path.join(folder,'unknown.ini'),'unexpected');
   }else fs.symlinkSync('/nonexistent',
      path.join(folder,'f'.repeat(64)+'.jsonl'));
   assert.throws(()=>createLateCheckpointStore({directory:x.d}),
     /mismatch|filename|Unsafe completed/);
  }finally{x.clean()}
 }
});
test('original market in newly started active journal is blocked by completed history index',()=>{
 const x=setup();try{
  rotateCompletedLateJournal({
   directory:x.d,late:x.late,archiveRoot:x.archiveRoot,approval:APPROVAL
  });
  const first=x.late.events[0];
  fs.writeFileSync(path.join(x.d,'late-checkpoint-events.jsonl'),
    JSON.stringify(first)+'\n');
  assert.throws(()=>createLateCheckpointStore({directory:x.d}),
   /repeats previously completed/);
 }finally{x.clean()}
});

test('standalone CLI defaults to read-only plan and rejects offline rotation without separate approval',()=>{
 const x=setup();try{
  const source=path.join(x.d,'late-export-original.json');
  fs.writeFileSync(source,JSON.stringify(x.late));
  const script=path.resolve(__dirname,'../late-checkpoint-rotation.js');
  const args=[source,x.archiveRoot,x.d];
  const dry=spawnSync(process.execPath,[script,'--dry-run',...args],
   {encoding:'utf8'});
  assert.equal(dry.status,0,dry.stderr);
  assert.match(dry.stdout,/CASH_LATE_ROTATION_READY=true/);
  assert.match(dry.stdout,/CASH_LATE_ROTATION_RAILWAY_RESTART_ALLOWED=false/);
  assert.deepEqual(fs.readFileSync(path.join(x.d,'late-checkpoint-events.jsonl')),x.raw);
  const unapproved=spawnSync(process.execPath,[script,'--explicit-offline-rotation',...args],
   {encoding:'utf8',env:{...process.env,CASH_ONE_TIME_OFFLINE_ROTATION_APPROVAL:''}});
  assert.notEqual(unapproved.status,0);
  assert.match(unapproved.stderr,/separate explicit operator approval/);
  assert.equal(fs.existsSync(path.join(x.d,'late-checkpoint-completed')),false);
 }finally{x.clean()}
});
