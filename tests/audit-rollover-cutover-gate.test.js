'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {hashEvent}=require('../audit-journal');
const {exportImmutableShadowArchive}=require('../audit-immutable-export');
const {assessShadowCutoverGate}=require('../audit-rollover-cutover-gate');
test('cutover gate verifies exact immutable copy and preserves pending identities',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cash-cutover-gate-'));
 try{
  const sourceDirectory=path.join(root,'source'),destinationDirectory=path.join(root,'archive');
  fs.mkdirSync(sourceDirectory);fs.mkdirSync(destinationDirectory);
  const journalPath=path.join(sourceDirectory,'shadow-events.jsonl');
  const body={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00.000Z',payload:{id:'Kalshi:KXBTC15M-TEST01'},previousHash:'GENESIS'};
  fs.writeFileSync(journalPath,JSON.stringify({...body,hash:hashEvent(body)})+'\n');
  const before=fs.readFileSync(journalPath);
  const archive=exportImmutableShadowArchive({sourceDirectory,destinationDirectory});
  const args={journalPath,archivePath:archive.file,expectedSha256:archive.sha256,expectedChainTip:archive.chainTip,expectedEventCount:archive.eventCount};
  const gate=assessShadowCutoverGate(args);
  assert.equal(gate.status,'ARCHIVE_MATCHED_CUTOVER_NOT_AUTHORIZED');
  assert.deepEqual(gate.pendingIds,['Kalshi:KXBTC15M-TEST01']);
  assert.equal(gate.activeJournalCanBeTruncated,false);
  assert.deepEqual(fs.readFileSync(journalPath),before);
  assert.throws(()=>assessShadowCutoverGate({...args,expectedEventCount:2}),/mismatch/);
  fs.appendFileSync(journalPath,'truncated');
  assert.throws(()=>assessShadowCutoverGate(args),/Incomplete/);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
