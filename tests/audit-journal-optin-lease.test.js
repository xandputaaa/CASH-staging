'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createAuditJournal,hashEvent}=require('../audit-journal');
function event(sequence,previousHash,id){
 const body={sequence,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00Z',payload:{id},previousHash};
 return {...body,hash:hashEvent(body)};
}
test('opt-in lease rejects stale competing writer and preserves chain',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-optin-lease-'));
 try{
  const first=createAuditJournal({directory,exclusiveWriter:true});
  const second=createAuditJournal({directory,exclusiveWriter:true});
  const one=event(1,'GENESIS','one');first.append(one);
  assert.throws(()=>second.append(event(1,'GENESIS','two')),/changed since startup/);
  const third=createAuditJournal({directory,exclusiveWriter:true});
  const two=event(2,one.hash,'two');third.append(two);
  assert.equal(createAuditJournal({directory}).events.length,2);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
test('opt-in lease refuses competing lock and does not write',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-optin-lease-'));
 try{
  const journal=createAuditJournal({directory,exclusiveWriter:true});
  const lock=path.join(directory,'.shadow-journal-writer.lock');
  fs.writeFileSync(lock,'busy');
  assert.throws(()=>journal.append(event(1,'GENESIS','one')),/EEXIST/);
  assert.equal(journal.events.length,0);
  assert.equal(fs.existsSync(path.join(directory,'shadow-events.jsonl')),false);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
