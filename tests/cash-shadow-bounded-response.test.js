'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {getPublicSnapshot,runPublicShadowObserver}=require('../cash-shadow-public-observer-runner');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');

function response(chunks,headers=null){
 let consumed=0;
 return {
  ok:true,headers:{get:()=>headers},
  body:{async *[Symbol.asyncIterator](){
   for(const chunk of chunks){consumed++;yield chunk}
  }},
  text:async()=>{throw Error('UNBOUNDED_TEXT_CALLED')},
  get consumed(){return consumed}
 };
}
test('shadow fetch accepts a bounded streamed JSON body and preserves exact byte digest',async()=>{
 const crypto=require('node:crypto');
 const raw=Buffer.from('{"events":[]}');
 const res=response([raw.subarray(0,4),raw.subarray(4)]);
 const result=await getPublicSnapshot('https://example.invalid',{fetchImpl:async()=>res});
 assert.deepEqual(result.snapshot,{events:[]});
 assert.equal(result.sha256,crypto.createHash('sha256').update(raw).digest('hex'));
 assert.equal(res.consumed,2);
});
test('oversized streaming source stops before consuming later chunks',async()=>{
 const res=response([Buffer.alloc(2500001,65),Buffer.from('SHOULD_NOT_BE_READ')]);
 await assert.rejects(getPublicSnapshot('https://example.invalid',{fetchImpl:async()=>res}),/SHADOW_SOURCE_TOO_LARGE/);
 assert.equal(res.consumed,1);
});
test('oversized declared length fails before reading body',async()=>{
 const res=response([Buffer.from('{"events":[]}')],'2500001');
 await assert.rejects(getPublicSnapshot('https://example.invalid',{fetchImpl:async()=>res}),/SHADOW_SOURCE_TOO_LARGE/);
 assert.equal(res.consumed,0);
});
test('oversized stream leaves only safe diagnostics and zero qualification',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-shadow-bounded-'));
 try{
  const result=await runPublicShadowObserver({
   fetchImpl:async()=>response([Buffer.alloc(2500001,65)]),
   outDirectory:dir,clock:()=>Date.now(),env:{GITHUB_RUN_ID:'123'}
  });
  const artifact=JSON.parse(fs.readFileSync(path.join(dir,'shadow-public-observation.json'),'utf8'));
  assert.equal(result.status,'PUBLIC_SOURCE_UNAVAILABLE_OR_INVALID');
  assert.equal(artifact.errorCode,'SOURCE_BODY_TOO_LARGE');
  assert.equal(artifact.observedBeforeExpiryCount,0);
  assert.equal(artifact.independentlyQualifiedCount,0);
  assert.equal(artifact.realMoneyOrdersAllowed,false);
  assert.equal(artifact.sourceSha256,null);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
