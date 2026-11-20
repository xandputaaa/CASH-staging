'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {withLeasedArchiveRecovery}=require('../audit-archive-leased-recovery');
const {withExclusiveJournalLease}=require('../audit-journal-writer-lease');
function temp(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-leased-recovery-'));
 return {directory,lock:path.join(directory,'.shadow-journal-writer.lock')};
}
test('recovery refuses a competing writer lease before reading archive files',()=>{
 const x=temp();
 try{
  let called=false;
  withExclusiveJournalLease({directory:x.directory},()=>{
   assert.throws(()=>withLeasedArchiveRecovery({directory:x.directory,
    activeJournalPath:path.join(x.directory,'shadow-events.jsonl')},()=>{
    called=true;
   }),/EEXIST/);
   assert.equal(called,false);
   assert.equal(fs.existsSync(x.lock),true);
  });
  assert.equal(fs.existsSync(x.lock),false);
 }finally{fs.rmSync(x.directory,{recursive:true,force:true})}
});
test('recovery releases its lease if archive verification fails',()=>{
 const x=temp();
 try{
  assert.throws(()=>withLeasedArchiveRecovery({directory:x.directory,
   manifest:{version:1,segments:[]},activeJournalPath:path.join(x.directory,'missing.jsonl')},
   ()=>assert.fail('Invalid archive must not invoke consumer')));
  assert.equal(fs.existsSync(x.lock),false);
  withExclusiveJournalLease({directory:x.directory},()=>assert.equal(fs.existsSync(x.lock),true));
 }finally{fs.rmSync(x.directory,{recursive:true,force:true})}
});
test('recovery rejects async consumers and releases the lease on failure',()=>{
 const x=temp();
 try{
  // An invalid manifest fails before the consumer, confirming fail-closed ordering.
  assert.throws(()=>withLeasedArchiveRecovery({directory:x.directory,
   manifest:null,activeJournalPath:path.join(x.directory,'missing.jsonl')},
   async()=>{}));
  assert.equal(fs.existsSync(x.lock),false);
  assert.throws(()=>withLeasedArchiveRecovery({directory:x.directory},null),
   /Synchronous recovery consumer required/);
  assert.equal(fs.existsSync(x.lock),false);
 }finally{fs.rmSync(x.directory,{recursive:true,force:true})}
});
