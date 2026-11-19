'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {hashEvent}=require('../audit-journal');
const {verifyArchivedShadowMonitorReplay}=require('../audit-archive-semantic-replay');
test('hash-valid but semantically invalid archived capture fails monitor replay',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-semantic-replay-'));
 try{
  const body={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00Z',
   payload:{id:'fabricated'},previousHash:'GENESIS'};
  const e={...body,hash:hashEvent(body)},bytes=JSON.stringify(e)+'\n';
  const filename='shadow-segment-test.jsonl';
  fs.writeFileSync(path.join(directory,filename),bytes);
  const activeJournalPath=path.join(directory,'shadow-events.jsonl');
  fs.writeFileSync(activeJournalPath,'');
  const manifest={version:1,segments:[{filename,sha256:createHash('sha256').update(bytes).digest('hex'),
   chainTip:e.hash,eventCount:1,previousChainTip:'GENESIS'}]};
  assert.throws(()=>verifyArchivedShadowMonitorReplay({manifest,directory,activeJournalPath}),
   /Saved capture is semantically invalid/);
  assert.equal(fs.readFileSync(activeJournalPath,'utf8'),'');
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
