'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createAuditJournal,hashEvent}=require('../audit-journal');
for(const exclusiveWriter of [false,true]){
 test('journal refuses append when archive manifest appears after startup (exclusiveWriter='+exclusiveWriter+')',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-midrun-archive-'));
  try{
   const journal=createAuditJournal({directory,exclusiveWriter});
   const body={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00.000Z',
    payload:{id:'test'},previousHash:'GENESIS'};
   const event={...body,hash:hashEvent(body)};
   fs.writeFileSync(path.join(directory,'shadow-archive-manifest.json'),'{}\n');
   assert.throws(()=>journal.append(event),/manifest appeared during live session/);
   assert.equal(fs.existsSync(path.join(directory,'shadow-events.jsonl')),false);
  }finally{fs.rmSync(directory,{recursive:true,force:true})}
 });
}
test('journal still appends normally without committed archive',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-no-archive-'));
 try{
  const journal=createAuditJournal({directory});
  const body={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00.000Z',
   payload:{id:'test'},previousHash:'GENESIS'};
  const event={...body,hash:hashEvent(body)};
  journal.append(event);
  assert.equal(fs.readFileSync(path.join(directory,'shadow-events.jsonl'),'utf8'),JSON.stringify(event)+'\n');
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
