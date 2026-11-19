'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createAuditJournal,hashEvent}=require('../audit-journal');
test('durable audit journal verifies integrity but never claims independent witnessing',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-audit-test-'));
 try{
  const journal=createAuditJournal({directory});
  assert.equal(journal.mode,'FILESYSTEM_JOURNAL_UNVERIFIED');
  const event={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00.000Z',
   payload:{id:'example'},previousHash:'GENESIS'};
  event.hash=hashEvent(event);
  journal.append(event);
  const recovered=createAuditJournal({directory});
  assert.equal(recovered.events.length,1);
  assert.equal(recovered.mode,'FILESYSTEM_JOURNAL_UNVERIFIED');
  const filename=path.join(directory,'shadow-events.jsonl');
  const tampered={...event,payload:{id:'changed'}};
  fs.writeFileSync(filename,JSON.stringify(tampered)+'\n');
  assert.throws(()=>createAuditJournal({directory}),/chain verification failed/);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
test('journal rejects incomplete trailing writes rather than silently recovering',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-audit-test-'));
 try{
  fs.writeFileSync(path.join(directory,'shadow-events.jsonl'),'{"sequence":1');
  assert.throws(()=>createAuditJournal({directory}),/incomplete trailing entry/);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
