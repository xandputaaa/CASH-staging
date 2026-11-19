'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {hashEvent}=require('../audit-journal');
const {exportImmutableShadowArchive}=require('../audit-immutable-export');
const {composeVerifiedArchiveManifest}=require('../audit-archive-manifest-compose');
test('compose verified manifest from multiple immutable exports and reject broken continuity',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cash-compose-'));
 try{
  const sourceDirectory=path.join(root,'source'),destinationDirectory=path.join(root,'archive');
  fs.mkdirSync(sourceDirectory);fs.mkdirSync(destinationDirectory);
  const journal=path.join(sourceDirectory,'shadow-events.jsonl'),entries=[];
  for(let i=0;i<2;i++){
   const body={sequence:1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00.000Z',payload:{id:'Kalshi:KXBTC15M-TEST0'+i},previousHash:'GENESIS'};
   fs.writeFileSync(journal,JSON.stringify({...body,hash:hashEvent(body)})+'\n');
   const exported=exportImmutableShadowArchive({sourceDirectory,destinationDirectory});
   entries.push({filename:path.basename(exported.file),sha256:exported.sha256,chainTip:exported.chainTip,eventCount:exported.eventCount,previousChainTip:i?entries[i-1].chainTip:'GENESIS'});
  }
  const before=fs.readFileSync(journal);
  const result=composeVerifiedArchiveManifest({directory:destinationDirectory,entries});
  assert.equal(result.verifiedSegments,2);assert.equal(result.totalEvents,2);
  assert.deepEqual(fs.readFileSync(journal),before);
  assert.throws(()=>composeVerifiedArchiveManifest({directory:destinationDirectory,entries:[entries[0],{...entries[1],previousChainTip:'GENESIS'}]}),/continuity/);
  assert.throws(()=>composeVerifiedArchiveManifest({directory:destinationDirectory,entries:[entries[0],entries[0]]}),/continuity/);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
