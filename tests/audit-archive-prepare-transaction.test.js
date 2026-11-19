'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {hashEvent}=require('../audit-journal');
const {prepareShadowArchiveTransaction}=require('../audit-archive-prepare-transaction');
function fixture(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'cash-prepare-'));try{
 const sourceDirectory=path.join(root,'source'),destinationDirectory=path.join(root,'archive');
 fs.mkdirSync(sourceDirectory);fs.mkdirSync(destinationDirectory);
 const body={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00.000Z',payload:{id:'Kalshi:KXBTC15M-TEST01'},previousHash:'GENESIS'};
 const journalPath=path.join(sourceDirectory,'shadow-events.jsonl');
 fs.writeFileSync(journalPath,JSON.stringify({...body,hash:hashEvent(body)})+'\n');
 return fn({sourceDirectory,destinationDirectory,journalPath});
 }finally{fs.rmSync(root,{recursive:true,force:true})}}
test('prepare transaction creates verified immutable archive and never cuts over',()=>fixture(args=>{
 const before=fs.readFileSync(args.journalPath);
 const result=prepareShadowArchiveTransaction(args);
 assert.equal(result.phase,'ARCHIVE_PREPARED_NO_CUTOVER');
 assert.equal(result.activeJournalRotated,false);
 assert.equal(result.eventCount,1);
 assert.deepEqual(fs.readFileSync(args.journalPath),before);
 assert.deepEqual(fs.readFileSync(result.archivePath),before);
 assert.throws(()=>prepareShadowArchiveTransaction(args),/already exists/);
 assert.deepEqual(fs.readFileSync(args.journalPath),before);
}));
test('prepare transaction fails closed on incomplete source',()=>fixture(args=>{
 fs.appendFileSync(args.journalPath,'broken');
 assert.throws(()=>prepareShadowArchiveTransaction(args),/Incomplete/);
 assert.deepEqual(fs.readdirSync(args.destinationDirectory),[]);
}));
test('prepare transaction fails closed on source/archive alias',()=>fixture(args=>{
 assert.throws(()=>prepareShadowArchiveTransaction({...args,destinationDirectory:args.sourceDirectory}),/must differ/);
 assert.equal(fs.existsSync(path.join(args.sourceDirectory,'shadow-segment-0001.jsonl')),false);
}));
