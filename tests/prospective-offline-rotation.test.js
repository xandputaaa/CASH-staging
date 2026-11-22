'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {digest}=require('../kalshi-prospective-model');
const {createProspectiveStore}=require('../prospective-store');
const {createProspectiveMonitor}=require('../prospective-monitor');
const {archiveSources}=require('../public-session-archive');
const {inspectCompletedEarlySegments,checkOfflineEarlyRotation,
 rotateCompletedEarlyJournal,APPROVAL}=require('../prospective-offline-rotation');
const SHA=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const B=x=>createHash('sha256').update(x).digest('hex');
const iso=n=>new Date(n).toISOString();
const START=Date.parse('2026-11-18T12:00:00Z');
const market=i=>'KXBTC15M-26NOV18'+String(i).padStart(4,'0')+'-30';
function fixture(n=320,fullySettled=true){
 const events=[],source=[],ids=[];let head='GENESIS';
 function push(type,payload,at){
  const body={sequence:events.length+1,recordedAt:iso(at),type,payload,
   previousHash:head};
  const e={...body,hash:SHA(body)};head=e.hash;events.push(e);
 }
 for(let i=0;i<n;i++){
  const at=START+i*900000,id=market(i),end=at+180000;
  ids.push(id);
  const p={marketId:id,model:'KXBTC15M_SETTLEMENT_EARLY_V3',
   at:iso(at),endTime:iso(end),side:null,targetPrice:85000,
   sampleWindow:[],sampleWindowSha256:digest([]),
   validation:'UNVALIDATED_PROXY_MODEL',indexSourceType:'SINGLE_EXCHANGE_PROXY',
   realMoneyAuthorized:false,calibratedProbability:null,expectedValue:null};
  source.push(p);push('FORECAST',p,at);
 }
 const later=START+(n+1)*900000;
 if(fullySettled)for(const p of source){
  const evidence={venue:'Kalshi',ticker:p.marketId,status:'settled',
   result:'void',floor_strike:85000,expiration_value:null,
   strike_type:'greater_or_equal',is_provisional:false};
  const payload={marketId:p.marketId,winner:'VOID',evidence:{
   status:'verified',venue:'Kalshi',marketId:p.marketId,winner:'VOID',
   checkedAt:iso(later+60000),firstObservedAt:iso(later+30000),
   confirmationCount:2,evidenceSnapshot:evidence,evidenceSha256:SHA(evidence),
   evidenceSourceUrl:'https://external-api.kalshi.com/trade-api/v2/markets/'+p.marketId
  }};
  push('OUTCOME',payload,later+62000);
 }
 const exported=createProspectiveMonitor({quotes:{},spot:{},results:{},
  store:{mode:'FILESYSTEM_JOURNAL_UNVERIFIED',events,append(){}},
  clock:()=>later+120000}).exportSession();
 return {events,exported,ids,raw:Buffer.from(events.map(x=>JSON.stringify(x)).join('\n')+'\n'),
  later};
}
function setup(n=320,settled=true){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-early-journal-'));
 const archiveRoot=fs.mkdtempSync(path.join(os.tmpdir(),'cash-early-archive-'));
 const x=fixture(n,settled);
 const file=path.join(dir,'prospective-kalshi-events.jsonl');
 fs.writeFileSync(file,x.raw,{mode:0o600});
 if(settled){
  const snapshot=x.exported;
  const metadata={repository:'xandputaaa/CASH-staging',event:'schedule',
   headBranch:'main',headSha:'a'.repeat(40),runId:'44983844925',
   createdAt:iso(x.later+90000),completedAt:iso(x.later+110000)};
  archiveSources({root:archiveRoot,early:snapshot,late:null,
   source:metadata,earlyBytes:Buffer.from(JSON.stringify(snapshot))});
 }
 return {...x,dir,archiveRoot,file,
  cleanup:()=>{fs.rmSync(dir,{recursive:true,force:true});
   fs.rmSync(archiveRoot,{recursive:true,force:true})}};
}
test('read-only dry run accepts only fully settled early journal plus matching local archive',()=>{
 const x=setup();try{
  const plan=checkOfflineEarlyRotation({
   directory:x.dir,early:x.exported,archiveRoot:x.archiveRoot});
  assert.equal(plan.ready,true);
  assert.equal(plan.frozenInActive,320);
  assert.equal(plan.settledInActive,320);
  assert.equal(plan.activeJournalSha256,B(x.raw));
  assert.equal(plan.independentlyQualifiedCount,0);
  assert.equal(plan.safeToRestartRailway,false);
  assert.deepEqual(fs.readFileSync(x.file),x.raw);
  assert.equal(fs.existsSync(path.join(x.dir,'prospective-kalshi-completed')),false);
 }finally{x.cleanup()}
});
test('offline rotation requires extra approval; preserves exact journal and blocks market reuse',async()=>{
 const x=setup();try{
  assert.throws(()=>rotateCompletedEarlyJournal({
   directory:x.dir,early:x.exported,archiveRoot:x.archiveRoot}),
   /Separate explicit approval/);
  const result=rotateCompletedEarlyJournal({
   directory:x.dir,early:x.exported,archiveRoot:x.archiveRoot,approval:APPROVAL});
  assert.equal(result.completedSegments,1);
  assert.equal(result.safeToRestartRailway,false);
  assert.equal(result.independentlyQualifiedCount,0);
  assert.equal(fs.existsSync(x.file),false);
  const entry=path.join(x.dir,'prospective-kalshi-completed',B(x.raw)+'.jsonl');
  assert.deepEqual(fs.readFileSync(entry),x.raw);
  const inv=inspectCompletedEarlySegments(x.dir);
  assert.equal(inv.previouslyFrozenMarkets,320);
  const store=createProspectiveStore({directory:x.dir});
  assert.equal(store.events.length,0);
  assert.equal(store.priorMarketIds.length,320);
  assert.equal(store.priorCompletedSegments,1);
  let now=START,marketId=market(0);
  const m=createProspectiveMonitor({
   store,clock:()=>now,quotes:{query:async()=>({
    marketId,endTime:iso(now+180000)})},
   spot:{update:async()=>({})},results:{lookup:async()=>({status:'pending'})}
  });
  await m.scan();
  assert.equal(m.snapshot().records,0);
  assert.equal(m.snapshot().captureReadiness.lastReason,'ALREADY_FROZEN');
  assert.equal(m.snapshot().priorCompletedMarketCount,320);
 }finally{x.cleanup()}
});
test('pending settlements, unfilled journal or missing public archive block without mutation',()=>{
 for(const [n,settled] of [[320,false],[319,true]]){
  const x=setup(n,settled);try{
   const p=checkOfflineEarlyRotation({
    directory:x.dir,early:x.exported,archiveRoot:x.archiveRoot});
   assert.equal(p.ready,false);
   assert.equal(p.reason,'ACTIVE_EARLY_JOURNAL_NOT_FULLY_SETTLED');
   assert.deepEqual(fs.readFileSync(x.file),x.raw);
  }finally{x.cleanup()}
 }
 const x=setup();try{
  const first=x.events[0].hash;
  fs.unlinkSync(path.join(x.archiveRoot,'public-sessions','early-v3',first,
   market(0)+'.json'));
  const p=checkOfflineEarlyRotation({
   directory:x.dir,early:x.exported,archiveRoot:x.archiveRoot});
  assert.equal(p.ready,false);
  assert.equal(p.reason,'FULL_LOCAL_PUBLIC_ARCHIVE_COPY_REQUIRED');
  assert.deepEqual(fs.readFileSync(x.file),x.raw);
 }finally{x.cleanup()}
});
test('stale source, stale lock and in-progress hardlink handoff fail closed',()=>{
 const x=setup();try{
  const wrong=structuredClone(x.exported);
  wrong.events[0].payload.side='YES';
  assert.throws(()=>checkOfflineEarlyRotation({
   directory:x.dir,early:wrong,archiveRoot:x.archiveRoot}),/differ/);
  const lock=path.join(x.dir,'.prospective-kalshi-events.write.lock');
  fs.writeFileSync(lock,'unknown-writer');
  const p=checkOfflineEarlyRotation({
   directory:x.dir,early:x.exported,archiveRoot:x.archiveRoot});
  assert.equal(p.reason,'EXISTING_EARLY_WRITER_LOCK_OPERATOR_REVIEW');
  assert.throws(()=>createProspectiveStore({directory:x.dir}),/writer lock/);
  fs.unlinkSync(lock);
  const folder=path.join(x.dir,'prospective-kalshi-completed');
  fs.mkdirSync(folder);
  fs.linkSync(x.file,path.join(folder,B(x.raw)+'.jsonl'));
  assert.throws(()=>createProspectiveStore({directory:x.dir}),
   /repeats completed segment|Incomplete prospective segment handoff/);
  assert.deepEqual(fs.readFileSync(x.file),x.raw);
 }finally{x.cleanup()}
});
test('corrupt, extra or symlink completed segments prevent silent new session start',()=>{
 for(const mode of ['corrupt','extra','symlink']){
  const x=setup();try{
   rotateCompletedEarlyJournal({directory:x.dir,early:x.exported,
    archiveRoot:x.archiveRoot,approval:APPROVAL});
   const folder=path.join(x.dir,'prospective-kalshi-completed');
   if(mode==='corrupt')fs.appendFileSync(
    path.join(folder,B(x.raw)+'.jsonl'),'TAMPER');
   if(mode==='extra')fs.writeFileSync(path.join(folder,'junk.txt'),'x');
   if(mode==='symlink')fs.symlinkSync('/not-present',
    path.join(folder,'f'.repeat(64)+'.jsonl'));
   assert.throws(()=>createProspectiveStore({directory:x.dir}));
  }finally{x.cleanup()}
 }
});
test('standalone CLI is dry-run without side effects and cannot rotate without approval',()=>{
 const x=setup();try{
  const exportPath=path.join(x.dir,'early-source.json');
  fs.writeFileSync(exportPath,JSON.stringify(x.exported));
  const script=path.resolve(__dirname,'../prospective-offline-rotation.js');
  const argv=[exportPath,x.archiveRoot,x.dir];
  const dry=spawnSync(process.execPath,[script,'--dry-run',...argv],{
   encoding:'utf8'});
  assert.equal(dry.status,0,dry.stderr);
  assert.match(dry.stdout,/CASH_EARLY_ROTATION_READY=true/);
  assert.match(dry.stdout,/CASH_EARLY_ROTATION_RESTART_AUTHORIZED=false/);
  const denied=spawnSync(process.execPath,[script,'--explicit-offline-rotation',...argv],
   {encoding:'utf8',env:{...process.env,CASH_ONE_TIME_OFFLINE_EARLY_ROTATION_APPROVAL:''}});
  assert.notEqual(denied.status,0);
  assert.deepEqual(fs.readFileSync(x.file),x.raw);
 }finally{x.cleanup()}
});
