'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {assertSafeStartupConfiguration}=require('../startup-configuration-gate');
const {createLateCheckpointStore}=require('../late-checkpoint-store');
test('late durability defaults off; opt-in requires an existing audit mount and exclusive writer',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-late-durable-config-'));
 try{
  const base={CASH_AUDIT_DIR:dir,CASH_EXCLUSIVE_JOURNAL_WRITER:'1'};
  assert.equal(assertSafeStartupConfiguration(base),true);
  assert.equal(assertSafeStartupConfiguration({...base,CASH_LATE_DURABLE_RESEARCH:'0'}),true);
  assert.equal(assertSafeStartupConfiguration({...base,CASH_LATE_DURABLE_RESEARCH:'1'}),true);
  assert.throws(()=>assertSafeStartupConfiguration({
   CASH_LATE_DURABLE_RESEARCH:'1',CASH_EXCLUSIVE_JOURNAL_WRITER:'1'
  }),/Late durable research requires/);
  assert.throws(()=>assertSafeStartupConfiguration({
   CASH_LATE_DURABLE_RESEARCH:'1',CASH_AUDIT_DIR:dir
  }),/Late durable research requires/);
  assert.throws(()=>assertSafeStartupConfiguration({...base,CASH_LATE_DURABLE_RESEARCH:'true'}),
   /Invalid CASH_LATE_DURABLE_RESEARCH/);
  assert.throws(()=>assertSafeStartupConfiguration({...base,CASH_LATE_DURABLE_RESEARCH:''}),
   /Invalid CASH_LATE_DURABLE_RESEARCH/);
  const stored=createLateCheckpointStore({directory:dir});
  assert.equal(stored.configured,true);
  assert.equal(stored.events.length,0);
  assert.equal(stored.priorCompletedSegments,0);
  // Merely opening the store must not create or rewrite its journal.
  assert.equal(fs.existsSync(path.join(dir,'late-checkpoint-events.jsonl')),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('corrupt historical late evidence fails closed and is never silently reset',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-late-durable-corrupt-'));
 try{
  const journal=path.join(dir,'late-checkpoint-events.jsonl');
  const prior='{"sequence":1,"type":"FORECAST","hash":"not-valid"}\n';
  fs.writeFileSync(journal,prior);
  assert.throws(()=>createLateCheckpointStore({directory:dir}));
  assert.equal(fs.readFileSync(journal,'utf8'),prior);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
