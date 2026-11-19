'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {hashEvent}=require('../audit-journal');
const {assessShadowSourceDrift}=require('../audit-rollover-source-drift');
test('source drift guard accepts exact prepared bytes and rejects later valid appends',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cash-drift-'));
 try{
  const journalPath=path.join(root,'shadow-events.jsonl'),archivePath=path.join(root,'shadow-segment-test.jsonl');
  const first={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00Z',payload:{id:'one'},previousHash:'GENESIS'};
  const a={...first,hash:hashEvent(first)};
  const original=JSON.stringify(a)+'\n';
  fs.writeFileSync(journalPath,original);fs.writeFileSync(archivePath,original);
  const args={journalPath,archivePath,expectedSha256:createHash('sha256').update(original).digest('hex'),
   expectedChainTip:a.hash,expectedEventCount:1};
  assert.equal(assessShadowSourceDrift(args).status,'SOURCE_UNCHANGED_NO_CUTOVER');
  const next={sequence:2,type:'CAPTURE',recordedAt:'2026-11-19T20:01:00Z',payload:{id:'two'},previousHash:a.hash};
  fs.appendFileSync(journalPath,JSON.stringify({...next,hash:hashEvent(next)})+'\n');
  assert.throws(()=>assessShadowSourceDrift(args),/changed since archive preparation/);
  assert.equal(fs.readFileSync(archivePath,'utf8'),original);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
