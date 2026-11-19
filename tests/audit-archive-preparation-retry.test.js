'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {hashEvent}=require('../audit-journal');
const {inspectPreparedShadowArchive}=require('../audit-archive-preparation-retry');
test('interrupted preparation can be verified without overwriting archive',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cash-prepared-retry-'));
 try{
  const journalPath=path.join(root,'shadow-events.jsonl');
  const archivePath=path.join(root,'shadow-segment-test.jsonl');
  const e={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00Z',payload:{id:'one'},previousHash:'GENESIS'};
  const raw=JSON.stringify({...e,hash:hashEvent(e)})+'\n';
  fs.writeFileSync(journalPath,raw);fs.writeFileSync(archivePath,raw,{mode:0o400});
  const args={journalPath,archivePath};
  assert.equal(inspectPreparedShadowArchive(args).state,'VERIFIED_PREPARED_ARCHIVE_REUSABLE');
  assert.equal(fs.readFileSync(archivePath,'utf8'),raw);
  fs.writeFileSync(journalPath,'');
  assert.throws(()=>inspectPreparedShadowArchive(args),/Incomplete or empty/);
  fs.writeFileSync(journalPath,raw);
  fs.appendFileSync(journalPath,raw);
  assert.throws(()=>inspectPreparedShadowArchive(args),/chain verification/);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
