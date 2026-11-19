'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {hashEvent}=require('../audit-journal');
const {planShadowRollover}=require('../audit-rollover-plan');
function sandbox(fn){const d=fs.mkdtempSync(path.join(os.tmpdir(),'cash-rollover-plan-'));try{return fn(d)}finally{fs.rmSync(d,{recursive:true,force:true})}}
function fixture(dir){const journalPath=path.join(dir,'shadow-events.jsonl'),archiveDirectory=path.join(dir,'archive');fs.mkdirSync(archiveDirectory);const body={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00.000Z',payload:{id:'btc-1'},previousHash:'GENESIS'};fs.writeFileSync(journalPath,JSON.stringify({...body,hash:hashEvent(body)})+'\n');return {journalPath,archiveDirectory}}
test('produces deterministic read-only rollover plan',()=>sandbox(dir=>{
 const args=fixture(dir),before=fs.readFileSync(args.journalPath);
 const plan=planShadowRollover(args);
 assert.equal(plan.sourceEventCount,1);assert.match(plan.archiveFilename,/^shadow-segment-0001-[a-f0-9]{16}\.jsonl$/);
 assert.equal(plan.mutatesStorage,false);assert.equal(plan.automaticRolloverEnabled,false);
 assert.deepEqual(fs.readFileSync(args.journalPath),before);
 assert.deepEqual(fs.readdirSync(args.archiveDirectory),[]);
}));
test('rejects incomplete journal',()=>sandbox(dir=>{
 const args=fixture(dir);fs.appendFileSync(args.journalPath,'broken');
 assert.throws(()=>planShadowRollover(args),/Incomplete/);
}));
test('rejects tampered hash chain',()=>sandbox(dir=>{
 const args=fixture(dir);const record=JSON.parse(fs.readFileSync(args.journalPath,'utf8'));record.payload.id='changed';fs.writeFileSync(args.journalPath,JSON.stringify(record)+'\n');
 assert.throws(()=>planShadowRollover(args),/chain verification/);
}));
test('rejects archive filename collisions',()=>sandbox(dir=>{
 const args=fixture(dir),plan=planShadowRollover(args);
 fs.writeFileSync(path.join(args.archiveDirectory,plan.archiveFilename),'existing');
 assert.throws(()=>planShadowRollover(args),/already exists/);
}));
