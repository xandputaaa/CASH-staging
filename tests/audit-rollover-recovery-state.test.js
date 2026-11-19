'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {hashEvent}=require('../audit-journal');
const {classifyShadowRolloverState}=require('../audit-rollover-recovery-state');
test('classifies intact prepared export, empty active and divergent active without writes',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cash-recovery-state-'));
 try{
  const journalPath=path.join(root,'shadow-events.jsonl');
  const archivePath=path.join(root,'shadow-segment-test.jsonl');
  const body={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00Z',payload:{id:'test'},previousHash:'GENESIS'};
  const data=JSON.stringify({...body,hash:hashEvent(body)})+'\n';
  fs.writeFileSync(journalPath,data);fs.writeFileSync(archivePath,data);
  const args={journalPath,archivePath};
  assert.equal(classifyShadowRolloverState(args).state,'PREPARED_ACTIVE_UNCHANGED');
  fs.writeFileSync(journalPath,'');
  assert.equal(classifyShadowRolloverState(args).state,'EMPTY_ACTIVE_REQUIRES_MANIFEST_AND_REPLAY');
  fs.writeFileSync(journalPath,data+'broken');
  assert.throws(()=>classifyShadowRolloverState(args),/Incomplete/);
  fs.writeFileSync(journalPath,data);
  assert.throws(()=>classifyShadowRolloverState({...args,archivePath:journalPath}),/aliases/);
  assert.equal(fs.readFileSync(archivePath,'utf8'),data);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
