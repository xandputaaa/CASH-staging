'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {runObserver}=require('../preexpiry-observer');
async function inspect(fetchImpl){
 const outDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-source-class-'));
 let diagnostics;
 try{
  const observed=await runObserver({fetchImpl,outDirectory,
   clock:()=>Date.parse('2026-11-19T22:00:00Z'),
   env:{GITHUB_RUN_ID:'12345678',GITHUB_REPOSITORY:'xandputaaa/CASH-staging',
    GITHUB_SHA:'a'.repeat(40)},
   onEligibility:value=>{diagnostics=value;}});
  assert.equal(observed.frozenEvidence.length,0);
  assert.equal(observed.claimedIndependentlyQualifiedCount,0);
  assert.equal(fs.existsSync(path.join(outDirectory,'public-preexpiry-observation.json')),false);
  return diagnostics;
 }finally{fs.rmSync(outDirectory,{recursive:true,force:true});}
}
test('401/403 responses are distinguished from empty or invalid journals without leaking response text',async()=>{
 const secret='SECRET_TOKEN_NEVER_LOG';
 const diagnostics=await inspect(async url=>({
  ok:false,status:url.includes('prospective')?401:403,
  text:async()=>secret
 }));
 assert.equal(diagnostics.early.status,'SOURCE_UNAVAILABLE_OR_UNFETCHED');
 assert.equal(diagnostics.early.fetchFailureClass,'HTTP_UNAUTHORIZED');
 assert.equal(diagnostics.late.fetchFailureClass,'HTTP_FORBIDDEN');
 assert.equal(diagnostics.early.forecastCount,null);
 assert.equal(diagnostics.early.independentQualifiedCount,0);
 assert.doesNotMatch(JSON.stringify(diagnostics),/SECRET_TOKEN|https:\/\/|password|Bearer/);
});
test('missing public routes and network errors have distinct fixed privacy-safe classifications',async()=>{
 const diagnostics=await inspect(async url=>{
  if(url.includes('prospective'))return {ok:false,status:404};
  throw Error('https://secret.example/private?token=DO_NOT_LEAK');
 });
 assert.equal(diagnostics.early.fetchFailureClass,'HTTP_NOT_FOUND');
 assert.equal(diagnostics.late.fetchFailureClass,'TRANSPORT_OR_INVALID_RESPONSE');
 assert.doesNotMatch(JSON.stringify(diagnostics),/DO_NOT_LEAK|secret.example/);
});
