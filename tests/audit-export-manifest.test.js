'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {hashEvent}=require('../audit-journal');
const {inspectArchiveExport}=require('../audit-export-manifest');
function fixture(){
 const e={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00.000Z',
  payload:{id:'Kalshi:KXBTC15M-SAMPLE01'},previousHash:'GENESIS'};
 e.hash=hashEvent(e);return Buffer.from(JSON.stringify(e)+'\n');
}
test('manifest commits to exact bytes and hash chain without mutating archive',()=>{
 const bytes=fixture(),original=Buffer.from(bytes),m=inspectArchiveExport(bytes);
 assert.equal(m.sha256,createHash('sha256').update(bytes).digest('hex'));
 assert.equal(m.eventCount,1);assert.equal(m.pendingCount,1);
 assert.equal(m.firstHash,m.chainTip);assert.equal(m.lastSequence,1);
 assert.equal(m.storageMutation,false);assert.equal(m.safeToAutoRotate,false);
 assert.equal(m.independentTimestampAttestation,false);
 assert.equal(m.evidenceStatus,'FILESYSTEM_JOURNAL_UNVERIFIED');
 assert.deepEqual(bytes,original);
});
test('rejects incomplete trailing entry and blank lines',()=>{
 const bytes=fixture();
 assert.throws(()=>inspectArchiveExport(bytes.subarray(0,-1)),/incomplete trailing/);
 assert.throws(()=>inspectArchiveExport(Buffer.concat([bytes,Buffer.from('\n')])),/Blank archive entry/);
});
test('rejects altered payload even when JSON remains parseable',()=>{
 const bytes=fixture().toString().replace('SAMPLE01','SAMPLE02');
 assert.throws(()=>inspectArchiveExport(Buffer.from(bytes)),/chain verification failed/);
});
test('rejects invalid UTF-8 and oversize before parsing',()=>{
 assert.throws(()=>inspectArchiveExport(Buffer.from([0xff,0x0a])),/valid UTF-8/);
 assert.throws(()=>inspectArchiveExport(Buffer.alloc(12*1024*1024+1)),/byte limit/);
});
test('empty archive has genesis tip but no fabricated evidence',()=>{
 const m=inspectArchiveExport(Buffer.alloc(0));
 assert.equal(m.eventCount,0);assert.equal(m.firstSequence,null);
 assert.equal(m.chainTip,'GENESIS');assert.equal(m.independentTimestampAttestation,false);
});
