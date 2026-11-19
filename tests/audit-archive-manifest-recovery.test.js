'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {hashEvent}=require('../audit-journal');
const {inspectArchiveManifestCommit}=require('../audit-archive-manifest-recovery');
const {commitVerifiedArchiveManifest}=require('../audit-archive-manifest-commit');
test('recovery distinguishes absent, interrupted and verified committed manifest',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-manifest-recovery-'));
 try{
  const inspect=()=>inspectArchiveManifestCommit({directory});
  assert.equal(inspect().state,'NO_MANIFEST');
  const temp=path.join(directory,'.shadow-archive-manifest.json.999.tmp');
  fs.writeFileSync(temp,'incomplete');
  assert.equal(inspect().state,'UNCOMMITTED_TEMP_ARTIFACTS');
  const body={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00Z',payload:{id:'one'},previousHash:'GENESIS'};
  const event={...body,hash:hashEvent(body)},bytes=JSON.stringify(event)+'\n';
  const filename='shadow-segment-test.jsonl';
  fs.writeFileSync(path.join(directory,filename),bytes);
  const manifest={version:1,segments:[{filename,eventCount:1,chainTip:event.hash,
   sha256:createHash('sha256').update(bytes).digest('hex'),previousChainTip:'GENESIS'}]};
  commitVerifiedArchiveManifest({directory,manifest});
  assert.equal(inspect().state,'COMMITTED_WITH_TEMP_ARTIFACTS');
  fs.unlinkSync(temp);
  assert.equal(inspect().state,'COMMITTED_VERIFIED');
  fs.appendFileSync(path.join(directory,'shadow-archive-manifest.json'),'broken');
  assert.throws(inspect,/Incomplete|JSON/);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
