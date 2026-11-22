'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {checkPreexpiry,checkShadow,run}=require('../cash-observer-source-gate');
const head=()=>({version:'CASH_SCHEDULED_WITNESS_WATCH_V1',
 attempts:3,validProbes:3,invalidProbes:0,
 independentQualifiedCount:0,ordersEnabled:false,
 eligibilityPolls:{
  early:{validSourcePolls:3,unavailableSourcePolls:0,invalidSourcePolls:0},
  late:{validSourcePolls:3,unavailableSourcePolls:0,invalidSourcePolls:0}
 }});
const shadow=()=>({version:'CASH_SHADOW_GITHUB_PUBLIC_OBSERVATION_V1',
 status:'NO_ELIGIBLE_PREEXPIRY_RECORDS',independentlyQualifiedCount:0,
 realMoneyOrdersAllowed:false,observedBeforeExpiryCount:0,
 observedForecasts:[],observedAtRunner:'2026-11-22T04:00:00.000Z',
 sourceSha256:'a'.repeat(64)});
test('scheduled early and late require at least one valid protected source read each',()=>{
 assert.deepEqual(checkPreexpiry(head()).ok,true);
 const early=head();early.eligibilityPolls.early.validSourcePolls=0;
 early.eligibilityPolls.early.unavailableSourcePolls=3;
 assert.deepEqual(checkPreexpiry(early).reason,'EARLY_EXPORT_NOT_VERIFIED');
 const late=head();late.eligibilityPolls.late.validSourcePolls=0;
 late.eligibilityPolls.late.unavailableSourcePolls=3;
 assert.deepEqual(checkPreexpiry(late).reason,'LATE_EXPORT_NOT_VERIFIED');
 const recovered=head();recovered.eligibilityPolls.early.validSourcePolls=1;
 recovered.eligibilityPolls.early.unavailableSourcePolls=2;
 assert.equal(checkPreexpiry(recovered).ok,true);
});
test('bad or missing source evidence, unauthorized-looking fake success and trading flags fail',()=>{
 const s=head();s.validProbes=0;s.invalidProbes=3;
 assert.equal(checkPreexpiry(s).ok,false);
 for(const replace of [
  {independentQualifiedCount:1},{ordersEnabled:true},{validProbes:10},
  {eligibilityPolls:{early:{},late:{}}}
 ]){
  assert.equal(checkPreexpiry({...head(),...replace}).ok,false);
 }
 assert.equal(checkPreexpiry(null).ok,false);
});
test('shadow valid empty market is not mistaken for unavailable source',()=>{
 assert.equal(checkShadow(shadow()).ok,true);
 const observed=shadow();observed.status='OBSERVED_PREEXPIRY';
 observed.observedBeforeExpiryCount=1;observed.observedForecasts=[{marketId:'TEST'}];
 assert.equal(checkShadow(observed).ok,true);
});
test('shadow failed auth, invalid data and invented qualification fail closed',()=>{
 for(const change of [
  {status:'PUBLIC_SOURCE_UNAVAILABLE_OR_INVALID',errorCode:'SOURCE_AUTHORIZATION_REJECTED'},
  {status:'PUBLIC_SOURCE_UNAVAILABLE_OR_INVALID',errorCode:'SOURCE_HTTP_ERROR'},
  {sourceSha256:null},{observedAtRunner:null},
  {independentlyQualifiedCount:1},{realMoneyOrdersAllowed:true},
  {observedBeforeExpiryCount:2},{status:'UNRECOGNIZED'},
  {status:'OBSERVED_PREEXPIRY'}
 ]){
  assert.equal(checkShadow({...shadow(),...change}).ok,false,JSON.stringify(change));
 }
});
test('real command exit code fails when source lost, succeeds with independent zero and no orders',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-source-gate-'));
 const tmp=path.join(dir,'witness');fs.mkdirSync(tmp);
 const script=path.join(__dirname,'..','cash-observer-source-gate.js');
 try{
  fs.writeFileSync(path.join(tmp,'observer-run-summary.json'),JSON.stringify(head()));
  fs.writeFileSync(path.join(tmp,'shadow-public-observation.json'),JSON.stringify(shadow()));
  for(const mode of ['preexpiry','shadow']){
   const ok=spawnSync(process.execPath,[script,mode],{cwd:dir,encoding:'utf8'});
   assert.equal(ok.status,0,mode+': '+ok.stderr);
   assert.match(ok.stdout,/CASH_SOURCE_GATE=PROTECTED_EXPORTS_READABLE/);
  }
  fs.writeFileSync(path.join(tmp,'shadow-public-observation.json'),
   JSON.stringify({...shadow(),status:'PUBLIC_SOURCE_UNAVAILABLE_OR_INVALID'}));
  const failed=spawnSync(process.execPath,[script,'shadow'],{cwd:dir,encoding:'utf8'});
  assert.equal(failed.status,1);
  assert.match(failed.stdout,/CASH_SOURCE_GATE=BLOCKED/);
  assert.doesNotMatch(failed.stdout,/Bearer|secret|apiKey|Authorization/);
  assert.equal(run('other').ok,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
