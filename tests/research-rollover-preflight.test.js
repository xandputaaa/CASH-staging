'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {assessRolloverPreflight,runPreflight}=require('../research-rollover-preflight');
const S=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sha=x=>x.repeat(64);
const MODEL='KXBTC15M_LATE_CHECKPOINT_SHADOW_V1';
const openTime='2026-11-18T15:11:36.000Z',closeTime='2026-11-18T15:15:00.000Z';
const id=i=>'KXBTC15M-26NOV181015-'+String(i).padStart(2,'0');
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'cash-rollover-preflight-'));
function build(n=1,{resolved=false,sourceType='SINGLE_EXCHANGE_PROXY'}={}){
 const events=[],commitments=[];
 let previousHash='GENESIS';
 for(let i=0;i<n;i++){
  const payload={model:MODEL,marketId:id(i),side:i%3===0?null:'NO',
   at:openTime,endTime:closeTime,indexSourceType:sourceType};
  const body={sequence:events.length+1,recordedAt:openTime,type:'FORECAST',
   payload,previousHash};
  const e={...body,hash:S(body)};
  events.push(e);commitments.push(e);previousHash=e.hash;
 }
 if(resolved){
  for(let i=0;i<n;i++){
   const body={sequence:events.length+1,
    recordedAt:'2026-11-18T15:16:00.000Z',type:'OUTCOME',
    payload:{marketId:id(i),winner:'NO'},previousHash};
   const e={...body,hash:S(body)};
   events.push(e);previousHash=e.hash;
  }
 }
 return {
  late:{version:'CASH_LATE_CHECKPOINT_SHADOW_V1',
   format:'CASH_LATE_CHECKPOINT_UNVERIFIED_HASH_CHAIN_V1',
   events,headHash:previousHash,records:n,pending:resolved?0:n,
   independentQualification:0,independentlyTimeAttested:false,
   realMoneyAuthorized:false,canExecuteOrders:false},
  commitments
 };
}
function save(root,{late,commitments},{removeOutcome=false,alterSide=false}={}){
 const first=commitments[0]?.hash;
 if(!first)return;
 for(const [i,e] of commitments.entries()){
  const file=path.join(root,'public-sessions','late-v1',first,id(i)+'.json');
  const outcome=late.events.find(x=>x.type==='OUTCOME'&&x.payload.marketId===id(i));
  const entry={
   version:'CASH_PUBLIC_UNWITNESSED_SESSION_RECORD_V1',
   provenanceClass:'UNVERIFIED_RAILWAY_JOURNAL_EXPORTED_DURING_GITHUB_SCHEDULE',
   prediction:{sessionFirstEventSha256:first,model:MODEL,
    marketId:id(i),side:alterSide?'YES':e.payload.side===null?'WAIT':e.payload.side,
    claimedFrozenAt:openTime,contractClosesAt:closeTime,
    selfHashedForecastEventSha256:e.hash,selfHashedForecastSequence:e.sequence,
    sourceType:'SINGLE_EXCHANGE_PROXY'},
   outcome:outcome&&!removeOutcome?{
    selfHashedOutcomeEventSha256:outcome.hash,
    selfHashedOutcomeSequence:outcome.sequence,
    internallyReportedWinner:outcome.payload.winner,
    firstSeenBackupRunId:'44340000002'
   }:null,
   firstReadOnlyBackup:{runId:'44332973399',
    headSha:'a'.repeat(40),
    createdAt:'2026-11-18T15:12:43.000Z',
    completedAt:'2026-11-18T15:12:58.000Z',
    snapshotExportSha256:sha('f')},
   limitations:'Server-generated hashes are not proof of pre-expiry GitHub witnessing or independent forecasting skill.',
   independentQualifiedCount:0,ordersEnabled:false,actualFillsVerified:0
  };
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(entry,null,2)+'\n');
 }
}
test('empty archive and unavailable source never permit a restart or trading',()=>{
 const root=temp();try{
  const r=assessRolloverPreflight({late:null,archiveRoot:root});
  assert.equal(r.status,'LATE_SOURCE_UNAVAILABLE');
  assert.equal(r.safeToRestartRailway,false);
  assert.equal(r.serverStateRestorableFromPublicArchive,false);
  assert.equal(r.automatedOrdersEnabled,false);
  assert.equal(r.independentQualifiedCount,0);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('complete public backup still cannot reconstruct volatile source session state',()=>{
 const root=temp();try{
  const fixture=build(2);
  save(root,fixture);
  const r=assessRolloverPreflight({late:fixture.late,archiveRoot:root});
  assert.equal(r.status,'SOURCE_ONLY_BACKUP_COMPLETE_NO_RESUME_PATH');
  assert.equal(r.archivedCurrentSessionForecasts,2);
  assert.equal(r.sourcePending,2);
  assert.equal(r.remainingAssumedDefaultSlots,158);
  assert.equal(r.safeToRestartRailway,false);
  assert.equal(r.serverStateRestorableFromPublicArchive,false);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('all self-reported source outcomes are present after full scheduled archive update',()=>{
 const root=temp();try{
  const fixture=build(2,{resolved:true});save(root,fixture);
  const r=assessRolloverPreflight({late:fixture.late,archiveRoot:root});
  assert.equal(r.sourcePending,0);
  assert.equal(r.archivedCurrentSessionSelfReportedOutcomes,2);
  assert.equal(r.missingCurrentSessionSourceReportedOutcomes.length,0);
  assert.equal(r.safeToRestartRailway,false);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('missing new forecasts and missing newly reported outcomes are each visible',()=>{
 const root=temp();try{
  const fixture=build(2,{resolved:true});save(root,fixture,{removeOutcome:true});
  const p=path.join(root,'public-sessions','late-v1',fixture.commitments[0].hash,id(1)+'.json');
  fs.unlinkSync(p);
  const r=assessRolloverPreflight({late:fixture.late,archiveRoot:root});
  assert.equal(r.status,'ARCHIVE_COVERAGE_INCOMPLETE_NO_RESTART');
  assert.deepEqual(r.missingCurrentSessionForecasts,[id(1)]);
  assert.deepEqual(r.missingCurrentSessionSourceReportedOutcomes,[id(0)]);
  assert.equal(r.safeToRestartRailway,false);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('tampered forecast identity or unsafe private fields are rejected',()=>{
 for(const change of ['side','secret']){
  const root=temp();try{
   const fixture=build(1);save(root,fixture,{alterSide:change==='side'});
   if(change==='secret'){
    const p=path.join(root,'public-sessions','late-v1',fixture.commitments[0].hash,id(0)+'.json');
    const r=JSON.parse(fs.readFileSync(p,'utf8'));
    r.privateExchangeKey='never';
    fs.writeFileSync(p,JSON.stringify(r));
   }
   assert.throws(()=>assessRolloverPreflight({late:fixture.late,archiveRoot:root}),
    /differs from current source|schema/);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
 }
});
test('threshold warning and full cap are logged but never claim safe rollover',()=>{
 for(const n of [128,160]){
  const root=temp();try{
   const fixture=build(n);save(root,fixture);
   const r=assessRolloverPreflight({late:fixture.late,archiveRoot:root});
   assert.equal(r.status,n===160?'DEFAULT_CAPACITY_REACHED_NO_RESUME_PATH':
    'DEFAULT_CAPACITY_LOW_NO_RESUME_PATH');
   assert.equal(r.remainingAssumedDefaultSlots,160-n);
   assert.equal(r.safeToRestartRailway,false);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
 }
});
test('nonpublic cohort must never masquerade as a verified public archive backup',()=>{
 const root=temp();try{
  const fixture=build(1,{sourceType:'OFFICIAL_BRTI_LIVE'});
  const r=assessRolloverPreflight({late:fixture.late,archiveRoot:root});
  assert.equal(r.status,'NONPUBLIC_SOURCE_CANNOT_PROVE_ARCHIVE_COVERAGE');
  assert.equal(r.safeToRestartRailway,false);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('existing unrelated server session cannot count as complete current source coverage',()=>{
 const root=temp();try{
  const older=build(1);
  save(root,older);
  const newer=build(2);
  const r=assessRolloverPreflight({late:newer.late,archiveRoot:root});
  assert.equal(r.status,'ARCHIVE_COVERAGE_INCOMPLETE_NO_RESTART');
  assert.equal(r.sourceRecords,2);
  assert.equal(r.archivedCurrentSessionForecasts,1);
  assert.equal(r.missingCurrentSessionForecasts.length,1);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('CLI handles missing late snapshot safely',()=>{
 const root=temp();try{
  const r=runPreflight(path.join(root,'not-present.json'),root);
  assert.equal(r.status,'LATE_SOURCE_UNAVAILABLE');
  assert.equal(r.safeToRestartRailway,false);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
