'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {withExclusiveJournalLease}=require('../audit-journal-writer-lease');
test('replaced lock is preserved rather than deleting another owner lease',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-lease-identity-'));
 try{
  const lock=path.join(directory,'.shadow-journal-writer.lock');
  assert.throws(()=>withExclusiveJournalLease({directory},()=>{
   fs.unlinkSync(lock);
   fs.writeFileSync(lock,'replacement');
  }),/pathname changed/);
  assert.equal(fs.readFileSync(lock,'utf8'),'replacement');
  assert.throws(()=>withExclusiveJournalLease({directory},()=>{}),/EEXIST/);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
test('missing lock is treated as ownership loss, not silent success',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-lease-identity-'));
 try{
  assert.throws(()=>withExclusiveJournalLease({directory},()=>{
   fs.unlinkSync(path.join(directory,'.shadow-journal-writer.lock'));
  }),/pathname changed/);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
