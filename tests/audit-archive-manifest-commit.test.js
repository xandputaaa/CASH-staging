'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {hashEvent}=require('../audit-journal');
const {commitVerifiedArchiveManifest}=require('../audit-archive-manifest-commit');
test('manifest commit verifies archive, writes durably, and refuses replacement',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-manifest-commit-'));
 try{
  const body={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00Z',payload:{id:'one'},previousHash:'GENESIS'};
  const event={...body,hash:hashEvent(body)};
  const bytes=JSON.stringify(event)+'\n',filename='shadow-segment-test.jsonl';
  fs.writeFileSync(path.join(directory,filename),bytes);
  const manifest={version:1,segments:[{filename,sha256:createHash('sha256').update(bytes).digest('hex'),
   chainTip:event.hash,eventCount:1,previousChainTip:'GENESIS'}]};
  const args={directory,manifest};
  const result=commitVerifiedArchiveManifest(args);
  assert.equal(result.status,'VERIFIED_MANIFEST_COMMITTED');
  const saved=fs.readFileSync(result.manifestPath,'utf8');
  assert.deepEqual(JSON.parse(saved),manifest);
  assert.throws(()=>commitVerifiedArchiveManifest(args),/already exists/);
  assert.equal(fs.readFileSync(result.manifestPath,'utf8'),saved);
  assert.deepEqual(fs.readdirSync(directory).filter(x=>x.endsWith('.tmp')),[]);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
test('invalid segment cannot cause manifest creation',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-manifest-commit-'));
 try{
  const manifest={version:1,segments:[{filename:'shadow-segment-missing.jsonl',
   sha256:'a'.repeat(64),chainTip:'b'.repeat(64),eventCount:1,previousChainTip:'GENESIS'}]};
  assert.throws(()=>commitVerifiedArchiveManifest({directory,manifest}));
  assert.equal(fs.existsSync(path.join(directory,'shadow-archive-manifest.json')),false);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
