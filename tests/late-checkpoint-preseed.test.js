'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createLateCheckpointMonitor}=require('../late-checkpoint-monitor');
const {createLateCheckpointStore}=require('../late-checkpoint-store');
const {archiveSources}=require('../public-session-archive');
const {analyzeLatePreseed,preseedOfflineLateDirectory,APPROVAL}=
 require('../late-checkpoint-preseed');
const NOW=Date.parse('2026-11-17T16:00:00Z');
const iso=n=>new Date(n).toISOString(),market='KXBTC15M-26NOV170915-15';
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'cash-late-cutover-'));
function inputs(t=NOW){
 const history=Array.from({length:25},(_,i)=>({
  time:iso(t-(24-i)*15000),price:85500+(i-24),source:'Kraken BTC/USD'
 }));
 return {quote:{venue:'Kalshi',marketId:market,status:'live',refreshFailed:false,
  fetchedAt:iso(t),endTime:iso(NOW+180000),openTime:iso(t-500000),
  targetPrice:85000,targetSource:'KALSHI_FLOOR_STRIKE',
  strikeType:'greater_or_equal',tieGoesToYes:true,
  contractRuleStatus:'BRTI_60S_RULE_TEXT_PRESENT',yesAsk:.55,noAsk:.46},
 spot:{status:'live',source:'Kraken BTC/USD',
  price:history.at(-1).price,fetchedAt:iso(t),history}};
}
function settlement(t=NOW+240000,winner='YES'){
 const evidence={venue:'Kalshi',ticker:market,status:'settled',
  result:winner.toLowerCase(),floor_strike:85000,
  expiration_value:winner==='YES'?85200:84800,
  strike_type:'greater_or_equal',is_provisional:false};
 return {status:'verified',winner,checkedAt:iso(t),
  firstObservedAt:iso(t-24000),confirmationCount:2,
  evidenceSnapshot:evidence,evidenceSha256:hash(evidence),
  evidenceSourceUrl:'https://external-api.kalshi.com/trade-api/v2/markets/'+market};
}
function monitor(store=null){
 let t=NOW,reply={status:'pending'};
 const feed=inputs(t);
 const m=createLateCheckpointMonitor({quotes:{query:async()=>feed.quote},
  spot:{update:async()=>feed.spot},results:{lookup:async()=>reply},
  clock:()=>t,store});
 return {m,time:x=>{t=x},result:x=>{reply=x}};
}
const metadata={
 repository:'xandputaaa/CASH-staging',event:'schedule',
 headBranch:'main',headSha:'a'.repeat(40),runId:'44355555555',
 createdAt:'2026-11-17T16:05:00.000Z',
 completedAt:'2026-11-17T16:05:30.000Z'
};
function archive(late,root){
 return archiveSources({early:null,late,
  source:metadata,root,lateBytes:Buffer.from(JSON.stringify(late))});
}
const rm=d=>fs.rmSync(d,{recursive:true,force:true});
const denied=APPROVAL;
test('pending late forecast gets public archive coverage, but dry-run never writes or approves restart',async()=>{
 const a=temp(),d=temp();try{
  const h=monitor();await h.m.scan();const late=h.m.exportSession();
  archive(late,a);
  const audit=analyzeLatePreseed({late,archiveRoot:a});
  assert.equal(audit.status,'SOURCE_AND_PUBLIC_GIT_ARCHIVE_MATCH_OFFLINE_PRESEED_ONLY');
  assert.equal(audit.sourceForecasts,1);
  assert.equal(audit.sourceOutcomes,0);
  assert.equal(audit.sourcePending,1);
  assert.equal(audit.archiveForecastsMatched,1);
  assert.equal(audit.preseedCandidate,true);
  assert.equal(audit.safeToRestartRunningRailway,false);
  assert.deepEqual(fs.readdirSync(d),[]);
  assert.throws(()=>preseedOfflineLateDirectory({
   late,archiveRoot:a,directory:d
  }),/requires separate explicit operator approval/);
  assert.deepEqual(fs.readdirSync(d),[]);
 }finally{rm(a);rm(d)}
});
test('explicit one-time offline file seeding preserves original event hash and pending settlement replay',async()=>{
 const a=temp(),d=temp();try{
  const h=monitor();await h.m.scan();const late=h.m.exportSession();
  archive(late,a);
  const r=preseedOfflineLateDirectory({
   late,archiveRoot:a,directory:d,approval:denied});
  assert.equal(r.status,'OFFLINE_DISK_PRESEED_COMPLETE_NOT_RAILWAY_ACTIVATION');
  assert.equal(r.journalEventCount,1);
  assert.equal(r.journalFileMode,0o600);
  assert.equal(r.safeToRestartRunningRailway,false);
  const store=createLateCheckpointStore({directory:d});
  assert.equal(store.events.length,1);
  assert.deepEqual(store.events,late.events);
  const restored=monitor(store);
  assert.equal(restored.m.snapshot().records,1);
  assert.equal(restored.m.snapshot().pending,1);
  restored.time(NOW+240000);restored.result(settlement());
  await restored.m.scan();
  assert.equal(restored.m.snapshot().pending,0);
  assert.equal(restored.m.snapshot().scorecard.overall.hits,1);
  const again=createLateCheckpointStore({directory:d});
  assert.equal(again.events.length,2);
  assert.deepEqual(again.events[0],late.events[0]);
  assert.equal(restored.m.snapshot().canExecuteOrders,false);
 }finally{rm(a);rm(d)}
});
test('already settled full latest source imports same history and never duplicates final',async()=>{
 const a=temp(),d=temp();try{
  const h=monitor();await h.m.scan();
  h.time(NOW+240000);h.result(settlement());
  await h.m.scan();const late=h.m.exportSession();archive(late,a);
  const audit=analyzeLatePreseed({late,archiveRoot:a});
  assert.equal(audit.archiveOutcomesMatched,1);
  const r=preseedOfflineLateDirectory({
   late,archiveRoot:a,directory:d,approval:denied});
  assert.equal(r.journalEventCount,2);
  const reboot=monitor(createLateCheckpointStore({directory:d}));
  assert.equal(reboot.m.snapshot().pending,0);
  assert.equal(reboot.m.snapshot().scorecard.overall.hits,1);
  assert.equal(reboot.m.exportSession().headHash,late.headHash);
 }finally{rm(a);rm(d)}
});
test('stale branch with pending outcome cannot be used to seed a newer resolved export',async()=>{
 const a=temp(),d=temp();try{
  const h=monitor();await h.m.scan();archive(h.m.exportSession(),a);
  h.time(NOW+240000);h.result(settlement());await h.m.scan();
  const resolved=h.m.exportSession();
  const audit=analyzeLatePreseed({late:resolved,archiveRoot:a});
  assert.equal(audit.status,'INCOMPLETE_GIT_ARCHIVE_COVERAGE_NO_PRESEED');
  assert.equal(audit.preseedCandidate,false);
  assert.equal(audit.sourceOutcomes,1);
  assert.throws(()=>preseedOfflineLateDirectory({
   late:resolved,archiveRoot:a,directory:d,approval:denied
  }),/Incomplete archive/);
  assert.deepEqual(fs.readdirSync(d),[]);
 }finally{rm(a);rm(d)}
});
test('existing journal, empty journal, symlink journal and interrupted stage are never overwritten',async()=>{
 const a=temp(),d=temp(),other=temp();try{
  const h=monitor();await h.m.scan();const late=h.m.exportSession();archive(late,a);
  const file=path.join(d,'late-checkpoint-events.jsonl');
  for(const state of ['existing','symlink','staging']){
   if(state==='existing')fs.writeFileSync(file,'');
   if(state==='symlink')fs.symlinkSync(path.join(other,'missing'),file);
   if(state==='staging')fs.writeFileSync(path.join(d,'.late-checkpoint-events.jsonl.incoming'),'PARTIAL');
   assert.throws(()=>preseedOfflineLateDirectory({
    late,archiveRoot:a,directory:d,approval:denied
   }),/never overwrite/);
   if(state!=='staging')fs.unlinkSync(file);
  }
  fs.unlinkSync(path.join(d,'.late-checkpoint-events.jsonl.incoming'));
  assert.deepEqual(fs.readdirSync(d),[]);
 }finally{rm(a);rm(d);rm(other)}
});
test('bad source hash, altered privacy fields or unverified flags cannot become durable',async()=>{
 const a=temp(),d=temp();try{
  const h=monitor();await h.m.scan();const late=h.m.exportSession();archive(late,a);
  const changed=structuredClone(late);
  changed.events[0].payload.side='NO';
  assert.throws(()=>analyzeLatePreseed({late:changed,archiveRoot:a}),
   /hash mismatch/);
  const privateField=structuredClone(late);
  privateField.events[0].payload.apiKey='BAD';
  assert.throws(()=>analyzeLatePreseed({late:privateField,archiveRoot:a}),
   /Sensitive field/);
  const unsafe={...late,realMoneyAuthorized:true};
  assert.throws(()=>analyzeLatePreseed({late:unsafe,archiveRoot:a}),
   /safe research-only identity/);
  const noHistory={...late,records:2};
  assert.throws(()=>analyzeLatePreseed({late:noHistory,archiveRoot:a}),
   /source count/);
  assert.deepEqual(fs.readdirSync(d),[]);
 }finally{rm(a);rm(d)}
});
test('licensed/nonpublic cohorts cannot be imported using a public-proxy archive copy',async()=>{
 const a=temp(),d=temp();try{
  const h=monitor();await h.m.scan();const late=h.m.exportSession();archive(late,a);
  const altered=structuredClone(late);altered.events[0].payload.sourceType='OFFICIAL_BRTI_LIVE';
  altered.events[0].payload.indexSourceType='OFFICIAL_BRTI_LIVE';
  const {hash:prior,...body}=altered.events[0];
  altered.events[0].hash=hash(body);altered.headHash=altered.events[0].hash;
  const audit=analyzeLatePreseed({late:altered,archiveRoot:a});
  assert.equal(audit.preseedCandidate,false);
  assert.equal(audit.archivePublicCoverageVerified,false);
  assert.equal(audit.safeToRestartRunningRailway,false);
  assert.deepEqual(fs.readdirSync(d),[]);
 }finally{rm(a);rm(d)}
});
test('path must be pre-existing absolute and not a symlink mount',async()=>{
 const a=temp(),d=temp(),other=temp();try{
  const h=monitor();await h.m.scan();const late=h.m.exportSession();archive(late,a);
  const l=path.join(other,'volume');
  fs.symlinkSync(d,l);
  assert.throws(()=>preseedOfflineLateDirectory({
   late,archiveRoot:a,directory:l,approval:denied
  }),/not a valid existing directory/);
  assert.throws(()=>preseedOfflineLateDirectory({
   late,archiveRoot:a,directory:'relative/data',approval:denied
  }),/existing absolute mounted directory/);
  assert.deepEqual(fs.readdirSync(d),[]);
 }finally{rm(a);rm(d);rm(other)}
});
