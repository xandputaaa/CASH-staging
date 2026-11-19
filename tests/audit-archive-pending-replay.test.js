'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {hashEvent}=require('../audit-journal');
const {recoverPendingShadowCaptures}=require('../audit-archive-pending-replay');
const event=(sequence,type,id,previousHash)=>{const body={sequence,type,recordedAt:'2026-11-19T20:00:00Z',payload:{id},previousHash};return {...body,hash:hashEvent(body)}};
test('pending captures survive archived segment and active resolution without double scoring',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-pending-replay-'));
 try{
  const a=event(1,'CAPTURE','open','GENESIS'),b=event(2,'CAPTURE','settled',a.hash);
  const filename='shadow-segment-test.jsonl',raw=[a,b].map(JSON.stringify).join('\n')+'\n';
  fs.writeFileSync(path.join(directory,filename),raw);
  const manifest={version:1,segments:[{filename,sha256:createHash('sha256').update(raw).digest('hex'),
   chainTip:b.hash,eventCount:2,previousChainTip:'GENESIS'}]};
  const activeJournalPath=path.join(directory,'shadow-events.jsonl');
  const resolution=event(1,'RESOLUTION','settled','GENESIS');
  fs.writeFileSync(activeJournalPath,JSON.stringify(resolution)+'\n');
  const args={manifest,directory,activeJournalPath};
  const recovered=recoverPendingShadowCaptures(args);
  assert.deepEqual(recovered.pending.map(x=>x.id),['open']);
  assert.equal(recovered.resolvedCount,1);
  assert.equal(recovered.mutatesStorage,false);
  fs.appendFileSync(activeJournalPath,JSON.stringify(event(2,'CAPTURE','open',resolution.hash))+'\n');
  assert.throws(()=>recoverPendingShadowCaptures(args),/Duplicate capture/);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
