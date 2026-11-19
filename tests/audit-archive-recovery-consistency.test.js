'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {hashEvent}=require('../audit-journal');
const {verifyArchiveRecoveryConsistency}=require('../audit-archive-recovery-consistency');
test('rejects invalid archived capture before pending recovery is considered usable',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-recovery-consistency-'));
 try{
  const body={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00Z',
   payload:{id:'fabricated'},previousHash:'GENESIS'};
  const event={...body,hash:hashEvent(body)};
  const raw=JSON.stringify(event)+'\n',filename='shadow-segment-consistency.jsonl';
  fs.writeFileSync(path.join(directory,filename),raw);
  const activeJournalPath=path.join(directory,'shadow-events.jsonl');
  fs.writeFileSync(activeJournalPath,'');
  const manifest={version:1,segments:[{filename,sha256:createHash('sha256').update(raw).digest('hex'),
   chainTip:event.hash,eventCount:1,previousChainTip:'GENESIS'}]};
  assert.throws(()=>verifyArchiveRecoveryConsistency({manifest,directory,activeJournalPath}),/Semantically invalid archived capture/);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
