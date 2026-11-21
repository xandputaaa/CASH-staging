'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {runPublicShadowObserver}=require('../cash-shadow-public-observer-runner');
const base={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'schedule',GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:'xandputaaa/CASH-staging',GITHUB_RUN_ID:'123',GITHUB_SHA:'abc'};
async function observe(env,status=401){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-auth-context-'));
 try{
  const result=await runPublicShadowObserver({env,outDirectory:dir,
   fetchImpl:async()=>({ok:false,status}),clock:()=>100000});
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'shadow-public-observation.json'),'utf8')),result);
  return result;
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
}
test('schedule/main authorization rejection distinguishes unavailable OIDC request metadata',async()=>{
 const r=await observe(base);
 assert.equal(r.errorCode,'SOURCE_AUTHORIZATION_REJECTED');
 assert.equal(r.authorizationContext,'SCHEDULE_MAIN_OIDC_REQUEST_UNAVAILABLE');
 assert.equal(r.observedBeforeExpiryCount,0);
 assert.equal(r.independentlyQualifiedCount,0);
});
test('schedule/main with OIDC request metadata never claims a token was minted',async()=>{
 const r=await observe({...base,ACTIONS_ID_TOKEN_REQUEST_URL:'https://example.invalid/secret',ACTIONS_ID_TOKEN_REQUEST_TOKEN:'SENSITIVE_TEST_VALUE'});
 assert.equal(r.authorizationContext,'SCHEDULE_MAIN_OIDC_REQUEST_AVAILABLE');
 assert.doesNotMatch(JSON.stringify(r),/SENSITIVE_TEST_VALUE|example.invalid/);
});
test('PR authorization rejection is distinguished from scheduled context',async()=>{
 const r=await observe({...base,GITHUB_EVENT_NAME:'pull_request'});
 assert.equal(r.authorizationContext,'NON_SCHEDULE_OR_NON_MAIN_RUN');
});
test('non-authorization HTTP failures do not imply an OIDC diagnosis',async()=>{
 const r=await observe(base,500);
 assert.equal(r.errorCode,'SOURCE_HTTP_ERROR');
 assert.equal(r.authorizationContext,undefined);
});
