'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {runPublicShadowObserver}=require('../cash-shadow-public-observer-runner');

test('successful fetch cannot turn an invalid post-response clock into a witness',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-shadow-success-clock-'));
 try{
  for(const badClock of [NaN,Infinity,-1,1.5,8640000000000001,Number.MAX_SAFE_INTEGER]){
   const result=await runPublicShadowObserver({
    fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify({events:[]})}),
    clock:()=>badClock,outDirectory:dir,
    env:{GITHUB_RUN_ID:'12345678'}
   });
   const artifact=JSON.parse(fs.readFileSync(path.join(dir,'shadow-public-observation.json'),'utf8'));
   assert.equal(result.status,'PUBLIC_SOURCE_UNAVAILABLE_OR_INVALID');
   assert.equal(artifact.errorCode,'RUNNER_CLOCK_UNAVAILABLE');
   assert.equal(artifact.observedAtRunner,null);
   assert.deepEqual(artifact.observedForecasts,[]);
   assert.equal(artifact.observedBeforeExpiryCount,0);
   assert.equal(artifact.independentlyQualifiedCount,0);
   assert.equal(artifact.realMoneyOrdersAllowed,false);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
