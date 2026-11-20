'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {getPublicSnapshot}=require('../cash-shadow-public-observer-runner');

test('public shadow observer fetch refuses redirects before reading any body',async()=>{
 let seen=false;
 const fetchImpl=async (_url,options)=>{
  assert.equal(options.redirect,'error');
  assert.equal(options.headers.Accept,'application/json');
  seen=true;
  throw new TypeError('redirect blocked');
 };
 await assert.rejects(getPublicSnapshot('https://example.invalid/shadow',{fetchImpl}),/redirect blocked/);
 assert.equal(seen,true);
});

test('public shadow observer rejects non-OK responses without parsing their bodies',async()=>{
 let bodyRead=false;
 const fetchImpl=async (_url,options)=>{
  assert.equal(options.redirect,'error');
  return {ok:false,status:401,text:async()=>{bodyRead=true;return 'sensitive';}};
 };
 await assert.rejects(getPublicSnapshot('https://example.invalid/shadow',{fetchImpl}),/SHADOW_SOURCE_HTTP_401/);
 assert.equal(bodyRead,false);
});

test('public shadow observer retains exact successful source-body digest',async()=>{
 const crypto=require('node:crypto');
 const body='{"events":[]}';
 const fetchImpl=async (_url,options)=>{
  assert.equal(options.redirect,'error');
  return {ok:true,text:async()=>body};
 };
 const got=await getPublicSnapshot('https://example.invalid/shadow',{fetchImpl});
 assert.deepEqual(got.snapshot,{events:[]});
 assert.equal(got.sha256,crypto.createHash('sha256').update(body).digest('hex'));
});

test('shadow observer records privacy-safe authorization and parse failure categories',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {runPublicShadowObserver}=require('../cash-shadow-public-observer-runner');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-shadow-source-'));
 try{
  for(const [response,expected] of [
   [{ok:false,status:401,text:async()=>{throw Error('body must not be read')}},'SOURCE_AUTHORIZATION_REJECTED'],
   [{ok:false,status:503,text:async()=>{throw Error('body must not be read')}},'SOURCE_HTTP_ERROR'],
   [{ok:true,text:async()=>'{not-json'},'SOURCE_INVALID_JSON']
  ]){
   const result=await runPublicShadowObserver({
    fetchImpl:async()=>response,clock:()=>1700000000000,outDirectory:dir,
    env:{GITHUB_RUN_ID:'12345678',GITHUB_REPOSITORY:'xandputaaa/CASH-staging',GITHUB_SHA:'test'}
   });
   assert.equal(result.errorCode,expected);
   assert.equal(result.independentlyQualifiedCount,0);
   assert.deepEqual(result.observedForecasts,[]);
   const artifact=fs.readFileSync(path.join(dir,'shadow-public-observation.json'),'utf8');
   assert.equal(JSON.parse(artifact).errorCode,expected);
   assert.doesNotMatch(artifact,/not-json|body must not be read|Bearer /);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
