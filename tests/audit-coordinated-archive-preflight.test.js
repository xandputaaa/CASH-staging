'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {hashEvent}=require('../audit-journal');
const {inspectCoordinatedShadowArchive}=require('../audit-coordinated-archive-preflight');
test('coordinated archive check verifies exact bytes and pending IDs without rotation',()=>{
 const sourceDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-coordinated-'));
 try{
  const journalPath=path.join(sourceDirectory,'shadow-events.jsonl');
  const archivePath=path.join(sourceDirectory,'shadow-segment-test.jsonl');
  const body={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00Z',payload:{id:'pending-one'},previousHash:'GENESIS'};
  const event={...body,hash:hashEvent(body)},raw=JSON.stringify(event)+'\n';
  fs.writeFileSync(journalPath,raw);fs.writeFileSync(archivePath,raw);
  const args={sourceDirectory,archivePath,expectedSha256:createHash('sha256').update(raw).digest('hex'),
   expectedChainTip:event.hash,expectedEventCount:1};
  const checked=inspectCoordinatedShadowArchive(args);
  assert.equal(checked.state,'COORDINATED_READ_ONLY_VERIFIED');
  assert.deepEqual(checked.pendingIds,['pending-one']);
  assert.equal(checked.activeJournalCanBeTruncated,false);
  assert.equal(fs.readFileSync(journalPath,'utf8'),raw);
  fs.writeFileSync(path.join(sourceDirectory,'.shadow-journal-writer.lock'),'busy');
  assert.throws(()=>inspectCoordinatedShadowArchive(args),/EEXIST/);
 }finally{fs.rmSync(sourceDirectory,{recursive:true,force:true})}
});
