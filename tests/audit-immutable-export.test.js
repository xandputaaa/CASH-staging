'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {hashEvent}=require('../audit-journal');
const {exportImmutableShadowArchive}=require('../audit-immutable-export');
function sandbox(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-export-'));try{return fn(dir)}finally{fs.rmSync(dir,{recursive:true,force:true})}}
function event(id){const body={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00.000Z',payload:{id},previousHash:'GENESIS'};return {...body,hash:hashEvent(body)}}
test('exports a byte-identical immutable archive without touching live source',()=>sandbox(dir=>{
 const src=path.join(dir,'source'),dst=path.join(dir,'archive');fs.mkdirSync(src);fs.mkdirSync(dst);
 const original=JSON.stringify(event('a'))+'\n';fs.writeFileSync(path.join(src,'shadow-events.jsonl'),original);
 const result=exportImmutableShadowArchive({sourceDirectory:src,destinationDirectory:dst});
 assert.equal(fs.readFileSync(result.file,'utf8'),original);
 assert.equal(fs.readFileSync(path.join(src,'shadow-events.jsonl'),'utf8'),original);
 assert.equal(result.rotated,false);assert.equal(result.eventCount,1);
 assert.equal(result.evidenceStatus,'FILESYSTEM_JOURNAL_UNVERIFIED');
 assert.throws(()=>exportImmutableShadowArchive({sourceDirectory:src,destinationDirectory:dst}),/EEXIST/);
}));
test('tampered source is rejected without writing an archive',()=>sandbox(dir=>{
 const src=path.join(dir,'source'),dst=path.join(dir,'archive');fs.mkdirSync(src);fs.mkdirSync(dst);
 const bad=event('a');bad.payload.id='tampered';
 fs.writeFileSync(path.join(src,'shadow-events.jsonl'),JSON.stringify(bad)+'\n');
 assert.throws(()=>exportImmutableShadowArchive({sourceDirectory:src,destinationDirectory:dst}),/verification failed/);
 assert.deepEqual(fs.readdirSync(dst),[]);
}));
test('incomplete source is rejected without writing an archive',()=>sandbox(dir=>{
 const src=path.join(dir,'source'),dst=path.join(dir,'archive');fs.mkdirSync(src);fs.mkdirSync(dst);
 fs.writeFileSync(path.join(src,'shadow-events.jsonl'),JSON.stringify(event('a')));
 assert.throws(()=>exportImmutableShadowArchive({sourceDirectory:src,destinationDirectory:dst}),/Incomplete/);
 assert.deepEqual(fs.readdirSync(dst),[]);
}));
