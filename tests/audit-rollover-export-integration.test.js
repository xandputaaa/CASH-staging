'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {hashEvent}=require('../audit-journal');
const {planShadowRollover}=require('../audit-rollover-plan');
const {exportImmutableShadowArchive}=require('../audit-immutable-export');
const {readSegment}=require('../audit-archive-manifest');
function sandbox(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-rollover-integration-'));try{return fn(dir)}finally{fs.rmSync(dir,{recursive:true,force:true})}}
test('planner and exporter agree on destination and preserve original journal bytes',()=>sandbox(dir=>{
 const sourceDirectory=path.join(dir,'live'),destinationDirectory=path.join(dir,'archive');
 fs.mkdirSync(sourceDirectory);fs.mkdirSync(destinationDirectory);
 const journalPath=path.join(sourceDirectory,'shadow-events.jsonl');
 const body={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00.000Z',payload:{id:'btc-1'},previousHash:'GENESIS'};
 fs.writeFileSync(journalPath,JSON.stringify({...body,hash:hashEvent(body)})+'\n');
 const before=fs.readFileSync(journalPath);
 const plan=planShadowRollover({journalPath,archiveDirectory:destinationDirectory});
 const exported=exportImmutableShadowArchive({sourceDirectory,destinationDirectory});
 assert.equal(path.basename(exported.file),plan.archiveFilename);
 assert.equal(exported.sha256,plan.sourceSha256);
 assert.equal(exported.chainTip,plan.sourceChainTip);
 assert.equal(readSegment(exported.file).events.length,plan.sourceEventCount);
 assert.deepEqual(fs.readFileSync(journalPath),before);
 assert.equal(exported.rotated,false);
 assert.throws(()=>planShadowRollover({journalPath,archiveDirectory:destinationDirectory}),/already exists/);
 assert.throws(()=>exportImmutableShadowArchive({sourceDirectory,destinationDirectory}),/EEXIST/);
 assert.deepEqual(fs.readFileSync(journalPath),before);
}));
