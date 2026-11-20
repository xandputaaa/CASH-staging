'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {withLeasedArchiveRecovery}=require('../audit-archive-leased-recovery');
test('recovery cannot lease one directory while inspecting another active journal',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cash-lease-binding-'));
 try{
  const locked=path.join(root,'locked'),other=path.join(root,'other');
  fs.mkdirSync(locked);fs.mkdirSync(other);
  fs.writeFileSync(path.join(other,'shadow-events.jsonl'),'');
  let called=false;
  assert.throws(()=>withLeasedArchiveRecovery({
   directory:locked,activeJournalPath:path.join(other,'shadow-events.jsonl')},
   ()=>{called=true}),/must belong to locked directory/);
  assert.equal(called,false);
  assert.equal(fs.existsSync(path.join(locked,'.shadow-journal-writer.lock')),false);
 }
 finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('recovery refuses unexpected active journal filename even in locked directory',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-lease-binding-'));
 try{
  assert.throws(()=>withLeasedArchiveRecovery({
   directory,activeJournalPath:path.join(directory,'other.jsonl')},()=>{}),
   /must belong to locked directory/);
  assert.equal(fs.existsSync(path.join(directory,'.shadow-journal-writer.lock')),false);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
