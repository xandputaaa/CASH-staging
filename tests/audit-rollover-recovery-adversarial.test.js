'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {hashEvent}=require('../audit-journal');
const {classifyShadowRolloverState}=require('../audit-rollover-recovery-state');
function line(id){
 const body={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00Z',payload:{id},previousHash:'GENESIS'};
 return JSON.stringify({...body,hash:hashEvent(body)})+'\n';
}
function fixture(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cash-recovery-adversarial-'));
 try{
  const journalPath=path.join(root,'shadow-events.jsonl'),archivePath=path.join(root,'shadow-segment-test.jsonl');
  fs.writeFileSync(journalPath,line('one'));fs.writeFileSync(archivePath,line('one'));
  return fn({root,journalPath,archivePath});
 }finally{fs.rmSync(root,{recursive:true,force:true})}
}
test('valid but divergent journal cannot be mistaken for prepared archive',()=>fixture(args=>{
 fs.writeFileSync(args.journalPath,line('different'));
 assert.throws(()=>classifyShadowRolloverState(args),/Divergent/);
}));
test('archive corruption is rejected even when active journal is empty',()=>fixture(args=>{
 fs.writeFileSync(args.journalPath,'');
 fs.appendFileSync(args.archivePath,'broken');
 assert.throws(()=>classifyShadowRolloverState(args),/Incomplete|JSON|chain/);
}));
test('missing active journal is not classified as completed rotation',()=>fixture(args=>{
 fs.unlinkSync(args.journalPath);
 assert.throws(()=>classifyShadowRolloverState(args),/ENOENT/);
}));
test('symlink journal and symlink archive are rejected',()=>fixture(args=>{
 const link=path.join(args.root,'link.jsonl');
 fs.symlinkSync(args.journalPath,link);
 assert.throws(()=>classifyShadowRolloverState({...args,journalPath:link}),/Unsafe/);
 fs.unlinkSync(link);fs.symlinkSync(args.archivePath,link);
 assert.throws(()=>classifyShadowRolloverState({...args,archivePath:link}),/Unsafe/);
}));
test('classifier never modifies source or immutable archive',()=>fixture(args=>{
 const original=fs.readFileSync(args.journalPath),archived=fs.readFileSync(args.archivePath);
 assert.equal(classifyShadowRolloverState(args).mutatesStorage,false);
 assert.deepEqual(fs.readFileSync(args.journalPath),original);
 assert.deepEqual(fs.readFileSync(args.archivePath),archived);
}));
