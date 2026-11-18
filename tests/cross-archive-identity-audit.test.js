'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {compareArchives}=require('../cross-archive-identity-audit');
test('two empty validated archives produce zero coverage without qualification',()=>{
 const a=fs.mkdtempSync(path.join(os.tmpdir(),'cash-source-'));
 const b=fs.mkdtempSync(path.join(os.tmpdir(),'cash-witness-'));
 try{
  const result=compareArchives(a,b);
  assert.equal(result.sourceRecordFiles,0);
  assert.equal(result.witnessRecordFiles,0);
  assert.equal(result.models.early.sourceMarketsWithoutWitness,0);
  assert.equal(result.models.late.witnessMarketsWithoutSource,0);
  assert.equal(result.independentlyQualifiedCount,0);
  assert.equal(result.archivalCompletenessProven,false);
  assert.equal(result.ordersEnabled,false);
 }finally{fs.rmSync(a,{recursive:true,force:true});fs.rmSync(b,{recursive:true,force:true})}
});
test('rejects malformed source and witness archive entries rather than counting them',()=>{
 const a=fs.mkdtempSync(path.join(os.tmpdir(),'cash-source-'));
 const b=fs.mkdtempSync(path.join(os.tmpdir(),'cash-witness-'));
 try{
  const dir=path.join(a,'public-sessions','early-v3','a'.repeat(64));
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'KXBTC15M-TESTMARKET.json'),'{}');
  assert.throws(()=>compareArchives(a,b),/Invalid public session archive file/);
  fs.rmSync(path.join(a,'public-sessions'),{recursive:true,force:true});
  const ledger=path.join(b,'public-evidence','2026-11-18','KXBTC15M-TESTMARKET');
  fs.mkdirSync(ledger,{recursive:true});
  fs.writeFileSync(path.join(ledger,'early-v3.json'),'{}');
  assert.throws(()=>compareArchives(a,b));
 }finally{fs.rmSync(a,{recursive:true,force:true});fs.rmSync(b,{recursive:true,force:true})}
});
