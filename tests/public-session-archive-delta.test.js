'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {auditSessionArchiveDelta}=require('../public-session-archive-delta');
const SHA=x=>x.repeat(64);
const BEFORE='44332973399',AFTER='44340000002';
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'cash-monotonic-'));
const make=(dir,{id='KXBTC15M-26NOV181015-15',first=BEFORE,
 side='WAIT',outcome=null,source=FIRST_MODEL}={})=>{
 const folder='late-v1',session=SHA('a');
 const file=path.join(dir,'public-sessions',folder,session,id+'.json');
 const entry={
  version:'CASH_PUBLIC_UNWITNESSED_SESSION_RECORD_V1',
  provenanceClass:'UNVERIFIED_RAILWAY_JOURNAL_EXPORTED_DURING_GITHUB_SCHEDULE',
  prediction:{
   sessionFirstEventSha256:session,model:source,marketId:id,side,
   claimedFrozenAt:'2026-11-18T15:11:36.826Z',
   contractClosesAt:'2026-11-18T15:15:00.000Z',
   selfHashedForecastEventSha256:SHA('b'),
   selfHashedForecastSequence:125,sourceType:'SINGLE_EXCHANGE_PROXY'
  },
  outcome:outcome===null?null:{
   selfHashedOutcomeEventSha256:SHA('c'),
   selfHashedOutcomeSequence:126,internallyReportedWinner:outcome,
   firstSeenBackupRunId:first===AFTER?AFTER:BEFORE
  },
  firstReadOnlyBackup:{
   runId:first,headSha:'d'.repeat(40),
   createdAt:'2026-11-18T15:12:43.000Z',
   completedAt:'2026-11-18T15:12:58.000Z',
   snapshotExportSha256:SHA('f')
  },
  limitations:'Server-generated hash chain, not proof of pre-expiry GitHub witnessing or independent qualification.',
  independentQualifiedCount:0,ordersEnabled:false,actualFillsVerified:0
 };
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,JSON.stringify(entry,null,2)+'\n');
 return file;
};
const FIRST_MODEL='KXBTC15M_LATE_CHECKPOINT_SHADOW_V1';
const setup=()=>{
 const a=temp(),b=temp();make(a);fs.cpSync(a,b,{recursive:true});
 return {a,b,clean:()=>{fs.rmSync(a,{recursive:true,force:true});fs.rmSync(b,{recursive:true,force:true})}};
};
const run=x=>auditSessionArchiveDelta({beforeRoot:x.a,afterRoot:x.b,sourceRunId:AFTER});
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const update=(f,fn)=>{const o=read(f);fn(o);fs.writeFileSync(f,JSON.stringify(o,null,2)+'\n')};
const latest=x=>path.join(x.b,'public-sessions','late-v1',SHA('a'),
 'KXBTC15M-26NOV181015-15.json');
test('no new forecast or outcome is an idempotent valid scheduled update',()=>{
 const x=setup();try{
  const r=run(x);
  assert.equal(r.newForecastFiles,0);
  assert.equal(r.newlyAppendedSelfReportedOutcomeFiles,0);
  assert.equal(r.unchangedRecordFiles,1);
  assert.equal(r.ordersEnabled,false);
  assert.equal(r.independentlyQualifiedCount,0);
 }finally{x.clean()}
});
test('new live-session forecast must actually be first backed up by the current scheduled run',()=>{
 const x=setup();try{
  make(x.b,{id:'KXBTC15M-26NOV181030-30',first:AFTER});
  let r=run(x);
  assert.equal(r.newForecastFiles,1);
  assert.equal(r.resultForecastFiles,2);
  update(path.join(x.b,'public-sessions','late-v1',SHA('a'),
   'KXBTC15M-26NOV181030-30.json'),o=>o.firstReadOnlyBackup.runId=BEFORE);
  assert.throws(()=>run(x),/New forecast falsely attributed/);
 }finally{x.clean()}
});
test('first source-reported outcome append preserves old prediction and first GH backup',()=>{
 const x=setup();try{
  update(latest(x),o=>{
   o.outcome={selfHashedOutcomeEventSha256:SHA('c'),
    selfHashedOutcomeSequence:126,internallyReportedWinner:'YES',
    firstSeenBackupRunId:AFTER}
  });
  const r=run(x);
  assert.equal(r.newlyAppendedSelfReportedOutcomeFiles,1);
  assert.equal(r.unchangedRecordFiles,0);
  assert.equal(r.independentlyQualifiedCount,0);
  update(latest(x),o=>o.outcome.firstSeenBackupRunId=BEFORE);
  assert.throws(()=>run(x),/append not from this scheduled run/);
 }finally{x.clean()}
});
test('cannot silently delete an existing committed forecast',()=>{
 const x=setup();try{
  fs.unlinkSync(latest(x));
  assert.throws(()=>run(x),/Archived forecast deleted/);
 }finally{x.clean()}
});
test('cannot rewrite previously committed forecast side, original event SHA or first backup',()=>{
 for(const fn of [
  o=>o.prediction.side='YES',
  o=>o.prediction.selfHashedForecastEventSha256=SHA('e'),
  o=>o.firstReadOnlyBackup.runId=AFTER
 ]){
  const x=setup();try{
   update(latest(x),fn);
   assert.throws(()=>run(x),/Immutable public forecast/);
  }finally{x.clean()}
 }
});
test('previously committed outcome winner and hash cannot change or disappear',()=>{
 const x=setup();try{
  const first=latest(x);
  const former=path.join(x.a,'public-sessions','late-v1',SHA('a'),
    'KXBTC15M-26NOV181015-15.json');
  for(const f of [first,former])update(f,o=>o.outcome={
   selfHashedOutcomeEventSha256:SHA('c'),selfHashedOutcomeSequence:126,
   internallyReportedWinner:'NO',firstSeenBackupRunId:BEFORE});
  assert.equal(run(x).unchangedRecordFiles,1);
  for(const fn of [
   o=>o.outcome.internallyReportedWinner='YES',
   o=>o.outcome.selfHashedOutcomeEventSha256=SHA('e'),
   o=>o.outcome=null
  ]){
   const saved=fs.readFileSync(first,'utf8');
   update(first,fn);
   assert.throws(()=>run(x),/Previously archived source outcome rewritten/);
   fs.writeFileSync(first,saved);
  }
 }finally{x.clean()}
});
test('private fields, forged qualification or malformed source fail closed before delta approval',()=>{
 const x=setup();try{
  for(const fn of [o=>o.privateApiKey='oops',
   o=>o.independentQualifiedCount=1]){
   update(latest(x),fn);
   assert.throws(()=>run(x),/schema|falsely certified/);
   fs.writeFileSync(latest(x),
    fs.readFileSync(path.join(x.a,'public-sessions','late-v1',SHA('a'),
     'KXBTC15M-26NOV181015-15.json')));
  }
  assert.throws(()=>auditSessionArchiveDelta({
   beforeRoot:x.a,afterRoot:x.b,sourceRunId:'invalid'
  }),/Invalid scheduled source run ID/);
 }finally{x.clean()}
});
