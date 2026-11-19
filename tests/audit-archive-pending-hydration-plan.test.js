'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {hashEvent}=require('../audit-journal');
const {planArchivedPendingHydration}=require('../audit-archive-pending-hydration-plan');
test('hydration plan refuses hash-valid but semantically invalid archived capture',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-hydration-plan-'));
 try{
  const body={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00Z',
   payload:{id:'fake'},previousHash:'GENESIS'};
  const event={...body,hash:hashEvent(body)},raw=JSON.stringify(event)+'\n';
  const filename='shadow-segment-hydration.jsonl';
  fs.writeFileSync(path.join(directory,filename),raw);
  const activeJournalPath=path.join(directory,'shadow-events.jsonl');
  fs.writeFileSync(activeJournalPath,'');
  const manifest={version:1,segments:[{filename,sha256:createHash('sha256').update(raw).digest('hex'),
   chainTip:event.hash,eventCount:1,previousChainTip:'GENESIS'}]};
  assert.throws(()=>planArchivedPendingHydration({manifest,directory,activeJournalPath}),/Semantically invalid archived capture/);
  assert.equal(fs.readFileSync(activeJournalPath,'utf8'),'');
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
