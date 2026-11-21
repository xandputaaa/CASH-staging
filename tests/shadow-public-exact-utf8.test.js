'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {getPublicSnapshot,runPublicShadowObserver}=require('../cash-shadow-public-observer-runner');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
function stream(chunks){
 return {ok:true,headers:{get:()=>null},body:{async *[Symbol.asyncIterator](){for(const chunk of chunks)yield chunk}},
  text:async()=>{throw Error('UNBOUNDED_TEXT_CALLED')}};
}
test('shadow witness hashes original UTF-8 bytes across split multibyte chunks',async()=>{
 const raw=Buffer.from('{"name":"caf\u00e9","events":[]}','utf8');
 const boundary=raw.indexOf(0xc3);
 const result=await getPublicSnapshot('https://example.invalid',{fetchImpl:async()=>stream([
  raw.subarray(0,boundary+1),raw.subarray(boundary+1)
 ])});
 assert.deepEqual(result.snapshot,{name:'caf\u00e9',events:[]});
 assert.equal(result.sha256,crypto.createHash('sha256').update(raw).digest('hex'));
});
test('malformed UTF-8 response is rejected instead of silently changing source bytes',async()=>{
 const raw=Buffer.concat([Buffer.from('{"name":"'),Buffer.from([0xff]),Buffer.from('","events":[]}')]);
 await assert.rejects(getPublicSnapshot('https://example.invalid',{fetchImpl:async()=>stream([raw])}),/SHADOW_SOURCE_INVALID_UTF8/);
});
test('invalid UTF-8 cannot create a pre-expiry witness or source digest',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-shadow-utf8-'));
 try{
  const raw=Buffer.concat([Buffer.from('{"events":[{"name":"'),Buffer.from([0xff]),Buffer.from('"}]}')]);
  const result=await runPublicShadowObserver({fetchImpl:async()=>stream([raw]),outDirectory:dir,clock:()=>Date.now(),env:{GITHUB_RUN_ID:'123'}});
  const artifact=JSON.parse(fs.readFileSync(path.join(dir,'shadow-public-observation.json'),'utf8'));
  assert.equal(result.status,'PUBLIC_SOURCE_UNAVAILABLE_OR_INVALID');
  assert.equal(artifact.sourceSha256,null);
  assert.equal(artifact.observedBeforeExpiryCount,0);
  assert.equal(artifact.independentlyQualifiedCount,0);
  assert.equal(artifact.realMoneyOrdersAllowed,false);
  assert.equal(artifact.errorCode,'SOURCE_INVALID_UTF8');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
