'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {hashEvent}=require('../audit-journal');
const {readSegment,verifyArchiveManifest}=require('../audit-archive-manifest');
function sandbox(fn){const d=fs.mkdtempSync(path.join(os.tmpdir(),'cash-manifest-'));try{return fn(d)}finally{fs.rmSync(d,{recursive:true,force:true})}}
function segment(dir,id){const filename='shadow-segment-'+id+'.jsonl',body={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00.000Z',payload:{id},previousHash:'GENESIS'};fs.writeFileSync(path.join(dir,filename),JSON.stringify({...body,hash:hashEvent(body)})+'\n');return {filename,...readSegment(path.join(dir,filename)),eventCount:1}}
test('manifest verifies ordered immutable segment digests and continuity metadata',()=>sandbox(dir=>{
 const a=segment(dir,'one'),b=segment(dir,'two');
 const manifest={version:1,segments:[{filename:a.filename,sha256:a.sha256,chainTip:a.chainTip,eventCount:1,previousChainTip:'GENESIS'},{filename:b.filename,sha256:b.sha256,chainTip:b.chainTip,eventCount:1,previousChainTip:a.chainTip}]};
 const verified=verifyArchiveManifest(manifest,{directory:dir});
 assert.equal(verified.totalEvents,2);assert.equal(verified.mutatesStorage,false);
 assert.equal(verified.evidenceStatus,'FILESYSTEM_JOURNAL_UNVERIFIED');
 manifest.segments[1].previousChainTip='GENESIS';
 assert.throws(()=>verifyArchiveManifest(manifest,{directory:dir}),/continuity mismatch/);
}));
test('manifest rejects tampered archive bytes',()=>sandbox(dir=>{
 const a=segment(dir,'one'),manifest={version:1,segments:[{filename:a.filename,sha256:a.sha256,chainTip:a.chainTip,eventCount:1,previousChainTip:'GENESIS'}]};
 fs.appendFileSync(path.join(dir,a.filename),'junk\n');
 assert.throws(()=>verifyArchiveManifest(manifest,{directory:dir}));
}));
test('manifest rejects duplicate filenames and path traversal',()=>sandbox(dir=>{
 const a=segment(dir,'one'),entry={filename:a.filename,sha256:a.sha256,chainTip:a.chainTip,eventCount:1,previousChainTip:'GENESIS'};
 assert.throws(()=>verifyArchiveManifest({version:1,segments:[entry,entry]},{directory:dir}),/Invalid segment entry/);
 assert.throws(()=>verifyArchiveManifest({version:1,segments:[{...entry,filename:'../escape.jsonl'}]},{directory:dir}),/Invalid segment entry/);
}));
