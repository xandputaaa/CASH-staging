'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {hashEvent}=require('../audit-journal');
const {exportImmutableShadowArchive}=require('../audit-immutable-export');
const {buildVerifiedArchiveManifestEntry}=require('../audit-archive-manifest-entry');
const {verifyArchiveManifest}=require('../audit-archive-manifest');
test('verified exported file produces valid manifest entry without touching active journal',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cash-entry-'));
 try{
  const sourceDirectory=path.join(root,'source'),destinationDirectory=path.join(root,'archive');
  fs.mkdirSync(sourceDirectory);fs.mkdirSync(destinationDirectory);
  const body={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00.000Z',payload:{id:'Kalshi:KXBTC15M-TEST01'},previousHash:'GENESIS'};
  const journalPath=path.join(sourceDirectory,'shadow-events.jsonl');
  fs.writeFileSync(journalPath,JSON.stringify({...body,hash:hashEvent(body)})+'\n');
  const before=fs.readFileSync(journalPath);
  const exported=exportImmutableShadowArchive({sourceDirectory,destinationDirectory});
  const expected={archivePath:exported.file,expectedSha256:exported.sha256,expectedChainTip:exported.chainTip,expectedEventCount:exported.eventCount};
  const entry=buildVerifiedArchiveManifestEntry(expected);
  assert.equal(verifyArchiveManifest({version:1,segments:[entry]},{directory:destinationDirectory}).totalEvents,1);
  assert.deepEqual(fs.readFileSync(journalPath),before);
  assert.throws(()=>buildVerifiedArchiveManifestEntry({...expected,expectedEventCount:2}),/differs/);
  assert.throws(()=>buildVerifiedArchiveManifestEntry({...expected,previousChainTip:'bad'}),/Invalid archive expectations/);
  fs.chmodSync(exported.file,0o600);fs.appendFileSync(exported.file,'tamper');
  assert.throws(()=>buildVerifiedArchiveManifestEntry(expected),/Incomplete archive segment|differs|Unexpected token|Invalid/);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
