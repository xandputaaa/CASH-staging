'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {hashEvent}=require('../audit-journal');
const {readSegment}=require('../audit-archive-manifest');
const {replayArchivedShadowRecords}=require('../audit-archive-replay');
function sandbox(fn){const d=fs.mkdtempSync(path.join(os.tmpdir(),'cash-replay-'));try{return fn(d)}finally{fs.rmSync(d,{recursive:true,force:true})}}
function segment(dir,name,type,id){const filename='shadow-segment-'+name+'.jsonl';const body={sequence:1,type,recordedAt:'2026-11-19T20:00:00.000Z',payload:{id},previousHash:'GENESIS'};fs.writeFileSync(path.join(dir,filename),JSON.stringify({...body,hash:hashEvent(body)})+'\n');const {sha256,chainTip}=readSegment(path.join(dir,filename));return {filename,sha256,chainTip,eventCount:1}}
function manifest(...segments){return {version:1,segments:segments.map((s,i)=>({...s,previousChainTip:i?segments[i-1].chainTip:'GENESIS'}))}}
test('replays capture followed by resolution across immutable segments',()=>sandbox(dir=>{
 const a=segment(dir,'one','CAPTURE','btc-1'),b=segment(dir,'two','RESOLUTION','btc-1');
 const result=replayArchivedShadowRecords(manifest(a,b),{directory:dir});
 assert.equal(result.captures,1);assert.equal(result.resolutions,1);assert.equal(result.pending,0);
 assert.equal(result.totalEvents,2);assert.equal(result.mutatesStorage,false);
}));
test('rejects cross-segment duplicate captures',()=>sandbox(dir=>{
 const a=segment(dir,'one','CAPTURE','btc-1'),b=segment(dir,'two','CAPTURE','btc-1');
 assert.throws(()=>replayArchivedShadowRecords(manifest(a,b),{directory:dir}),/Duplicate capture/);
}));
test('rejects orphan resolutions',()=>sandbox(dir=>{
 const a=segment(dir,'one','RESOLUTION','btc-1');
 assert.throws(()=>replayArchivedShadowRecords(manifest(a),{directory:dir}),/Orphan/);
}));
test('rejects broken manifest continuity before replay',()=>sandbox(dir=>{
 const a=segment(dir,'one','CAPTURE','btc-1'),b=segment(dir,'two','RESOLUTION','btc-1');
 const m=manifest(a,b);m.segments[1].previousChainTip='GENESIS';
 assert.throws(()=>replayArchivedShadowRecords(m,{directory:dir}),/continuity mismatch/);
}));
