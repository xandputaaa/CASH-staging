'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {withExclusiveJournalLease}=require('../audit-journal-writer-lease');
test('exclusive lease blocks nested competing writer and releases on success',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-lease-'));
 try{
  const result=withExclusiveJournalLease({directory},()=>{
   assert.throws(()=>withExclusiveJournalLease({directory},()=>{}),/EEXIST/);
   return 'ok';
  });
  assert.equal(result,'ok');
  assert.equal(withExclusiveJournalLease({directory},()=>42),42);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
test('lease releases after thrown exception but never steals stale lock',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-lease-'));
 try{
  assert.throws(()=>withExclusiveJournalLease({directory},()=>{throw Error('failure')}),/failure/);
  const lock=path.join(directory,'.shadow-journal-writer.lock');
  fs.writeFileSync(lock,'stale');
  assert.throws(()=>withExclusiveJournalLease({directory},()=>{}),/EEXIST/);
  assert.equal(fs.readFileSync(lock,'utf8'),'stale');
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
