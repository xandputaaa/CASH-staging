'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {hashEvent}=require('../audit-journal');
const {inspectArchiveSemanticIndex}=require('../audit-archive-semantic-index');
test('rejects semantically invalid capture across archive even with valid hash',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-semantic-index-'));
 try{
  const body={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00Z',payload:{id:'fake'},previousHash:'GENESIS'};
  const e={...body,hash:hashEvent(body)},raw=JSON.stringify(e)+'\n';
  const filename='shadow-segment-semantic-test.jsonl';
  fs.writeFileSync(path.join(directory,filename),raw);
  const activeJournalPath=path.join(directory,'shadow-events.jsonl');
  fs.writeFileSync(activeJournalPath,'');
  const manifest={version:1,segments:[{filename,sha256:createHash('sha256').update(raw).digest('hex'),
   chainTip:e.hash,eventCount:1,previousChainTip:'GENESIS'}]};
  assert.throws(()=>inspectArchiveSemanticIndex({manifest,directory,activeJournalPath}),/Semantically invalid archived capture/);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
