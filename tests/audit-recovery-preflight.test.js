'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {hashEvent}=require('../audit-journal');
const {readSegment}=require('../audit-archive-manifest');
const {assessArchiveRecovery}=require('../audit-recovery-preflight');
function sandbox(fn){const d=fs.mkdtempSync(path.join(os.tmpdir(),'cash-recovery-'));try{return fn(d)}finally{fs.rmSync(d,{recursive:true,force:true})}}
function entry(type,id){const body={sequence:1,type,recordedAt:'2026-11-19T20:00:00.000Z',payload:{id},previousHash:'GENESIS'};return {...body,hash:hashEvent(body)}}
function fixture(dir,archivedType='CAPTURE',activeType='RESOLUTION',activeId='a'){
 const name='shadow-segment-001.jsonl',archive=path.join(dir,name),active=path.join(dir,'shadow-events.jsonl');
 fs.writeFileSync(archive,JSON.stringify(entry(archivedType,'a'))+'\n');
 fs.writeFileSync(active,JSON.stringify(entry(activeType,activeId))+'\n');
 const {sha256,chainTip}=readSegment(archive);
 return {manifest:{version:1,segments:[{filename:name,sha256,chainTip,eventCount:1,previousChainTip:'GENESIS'}]},directory:dir,activeJournalPath:active};
}
test('read-only recovery preflight verifies capture in archive and resolution in active journal',()=>sandbox(dir=>{
 const args=fixture(dir),before=fs.readFileSync(args.activeJournalPath);
 const r=assessArchiveRecovery(args);
 assert.equal(r.captures,1);assert.equal(r.resolutions,1);assert.equal(r.pending,0);
 assert.equal(r.mutatesStorage,false);assert.equal(r.automaticRolloverEnabled,false);
 assert.deepEqual(fs.readFileSync(args.activeJournalPath),before);
}));
test('rejects duplicate capture across archive and active journal',()=>sandbox(dir=>{
 const args=fixture(dir,'CAPTURE','CAPTURE');
 assert.throws(()=>assessArchiveRecovery(args),/Duplicate capture/);
}));
test('rejects orphan resolution across archive and active journal',()=>sandbox(dir=>{
 const args=fixture(dir,'RESOLUTION','CAPTURE');
 assert.throws(()=>assessArchiveRecovery(args),/Orphan/);
}));
test('rejects truncated active journal',()=>sandbox(dir=>{
 const args=fixture(dir);fs.writeFileSync(args.activeJournalPath,'{"incomplete":true}');
 assert.throws(()=>assessArchiveRecovery(args),/Incomplete active journal/);
}));
