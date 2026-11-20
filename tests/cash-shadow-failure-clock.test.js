'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {runPublicShadowObserver}=require('../cash-shadow-public-observer-runner');

test('invalid runner clock on failed fetch still writes nonqualifying privacy-safe artifact',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-shadow-clock-'));
 try{
  const result=await runPublicShadowObserver({
   fetchImpl:async()=>({ok:false,status:401}),
   clock:()=>NaN,outDirectory:dir,
   env:{GITHUB_RUN_ID:'123456789',GITHUB_REPOSITORY:'test/repo',GITHUB_SHA:'testsha'}
  });
  const artifact=JSON.parse(fs.readFileSync(path.join(dir,'shadow-public-observation.json'),'utf8'));
  assert.equal(result.status,'PUBLIC_SOURCE_UNAVAILABLE_OR_INVALID');
  assert.equal(artifact.errorCode,'SOURCE_AUTHORIZATION_REJECTED');
  assert.equal(artifact.observedAtRunner,null);
  assert.equal(artifact.observedBeforeExpiryCount,0);
  assert.equal(artifact.independentlyQualifiedCount,0);
  assert.equal(artifact.realMoneyOrdersAllowed,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('throwing runner clock on source failure cannot suppress safe artifact',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-shadow-clock-'));
 try{
  const result=await runPublicShadowObserver({
   fetchImpl:async()=>{throw Error('PRIVATE_NETWORK_DETAIL_DO_NOT_LOG')},
   clock:()=>{throw Error('PRIVATE_CLOCK_DETAIL_DO_NOT_LOG')},
   outDirectory:dir,env:{GITHUB_RUN_ID:'123456789'}
  });
  const artifact=fs.readFileSync(path.join(dir,'shadow-public-observation.json'),'utf8');
  assert.equal(result.observedAtRunner,null);
  assert.equal(result.errorCode,'SOURCE_TRANSPORT_OR_UNKNOWN');
  assert.doesNotMatch(artifact,/PRIVATE_.*DO_NOT_LOG/);
  assert.match(artifact,/"independentlyQualifiedCount": 0/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
