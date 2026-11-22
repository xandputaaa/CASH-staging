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

test('injected scheduled runner environment mints OIDC only in memory and sends bearer to source',async()=>{
 const secret='SENSITIVE_OIDC_TEST_VALUE';
 const jwt='eyJhbGciOiJub25lIn0.eyJzdWIiOiJ0ZXN0In0.signature';
 const env={...base,ACTIONS_ID_TOKEN_REQUEST_URL:'https://actions.githubusercontent.com/oidc?nonce=unit',ACTIONS_ID_TOKEN_REQUEST_TOKEN:secret};
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-auth-flow-'));
 const calls=[];
 try{
  const result=await runPublicShadowObserver({env,outDirectory:dir,clock:()=>100000,
   fetchImpl:async(url,options)=>{
    calls.push({url,headers:options.headers});
    if(url.startsWith('https://actions.githubusercontent.com/'))return {
     ok:true,text:async()=>JSON.stringify({value:jwt})};
    return {ok:false,status:401};
   }});
  assert.equal(calls.length,2);
  assert.equal(calls[0].headers.Authorization,'Bearer '+secret);
  assert.equal(calls[1].headers.Authorization,'Bearer '+jwt);
  assert.equal(result.authorizationContext,'SCHEDULE_MAIN_OIDC_REQUEST_AVAILABLE');
  assert.equal(result.sourceBearerAttached,true);
  assert.equal(result.observedBeforeExpiryCount,0);
  assert.equal(result.independentlyQualifiedCount,0);
  const artifact=fs.readFileSync(path.join(dir,'shadow-public-observation.json'),'utf8');
  assert.doesNotMatch(artifact,/SENSITIVE_OIDC_TEST_VALUE|signature|nonce=unit/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('injected PR environment never requests OIDC or forwards an Authorization header',async()=>{
 const env={...base,GITHUB_EVENT_NAME:'pull_request',ACTIONS_ID_TOKEN_REQUEST_URL:'https://actions.githubusercontent.com/oidc',ACTIONS_ID_TOKEN_REQUEST_TOKEN:'SENSITIVE_PR_TEST'};
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-auth-flow-'));
 const calls=[];
 try{
  const result=await runPublicShadowObserver({env,outDirectory:dir,clock:()=>100000,
   fetchImpl:async(url,options)=>{calls.push({url,headers:options.headers});return {ok:false,status:401}}});
  assert.equal(calls.length,1);
  assert.equal(calls[0].headers.Authorization,undefined);
  assert.equal(result.authorizationContext,'NON_SCHEDULE_OR_NON_MAIN_RUN');
  assert.equal(result.sourceBearerAttached,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('scheduled OIDC metadata without a minted token reports no bearer attached',async()=>{
 const env={...base,ACTIONS_ID_TOKEN_REQUEST_URL:'https://actions.githubusercontent.com/oidc',ACTIONS_ID_TOKEN_REQUEST_TOKEN:'FAKE_REQUEST_ONLY'};
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-auth-failed-mint-'));
 const calls=[];
 try{
  const result=await runPublicShadowObserver({env,outDirectory:dir,clock:()=>100000,
   fetchImpl:async(url,options)=>{
    calls.push({url,headers:options.headers});
    return url.startsWith('https://actions.githubusercontent.com/')
     ?{ok:false,status:403}:{ok:false,status:401};
   }});
  assert.equal(calls.length,2);
  assert.equal(calls[1].headers.Authorization,undefined);
  assert.equal(result.authorizationContext,'SCHEDULE_MAIN_OIDC_REQUEST_AVAILABLE');
  assert.equal(result.sourceBearerAttached,false);
  assert.equal(result.independentlyQualifiedCount,0);
  assert.doesNotMatch(JSON.stringify(result),/FAKE_REQUEST_ONLY/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
