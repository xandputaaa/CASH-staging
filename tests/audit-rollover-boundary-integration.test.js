'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {hashEvent}=require('../audit-journal');
const {exportImmutableShadowArchive}=require('../audit-immutable-export');
const {assessArchiveRecovery}=require('../audit-recovery-preflight');
function withDir(fn){const d=fs.mkdtempSync(path.join(os.tmpdir(),'cash-boundary-'));try{return fn(d)}finally{fs.rmSync(d,{recursive:true,force:true})}}
function event(sequence,type,payload,previousHash){const body={sequence,type,recordedAt:'2026-11-19T20:00:00.000Z',payload,previousHash};return {...body,hash:hashEvent(body)}}
test('recovery accepts resolution in active segment for a capture archived earlier',()=>withDir(dir=>{
 const sourceDirectory=path.join(dir,'source'),directory=path.join(dir,'archive');fs.mkdirSync(sourceDirectory);fs.mkdirSync(directory);
 const archivedCapture=event(1,'CAPTURE',{id:'Kalshi:KXBTC15M-TEST01',venue:'Kalshi',marketId:'KXBTC15M-TEST01'},'GENESIS');
 fs.writeFileSync(path.join(sourceDirectory,'shadow-events.jsonl'),JSON.stringify(archivedCapture)+'\n');
 const exported=exportImmutableShadowArchive({sourceDirectory,destinationDirectory:directory});
 const activeJournalPath=path.join(dir,'active.jsonl');
 const resolution=event(1,'RESOLUTION',{id:archivedCapture.payload.id,venue:'Kalshi',marketId:'KXBTC15M-TEST01',winner:'YES'},'GENESIS');
 fs.writeFileSync(activeJournalPath,JSON.stringify(resolution)+'\n');
 const manifest={version:1,segments:[{filename:path.basename(exported.file),sha256:exported.sha256,chainTip:exported.chainTip,eventCount:exported.eventCount,previousChainTip:'GENESIS'}]};
 const result=assessArchiveRecovery({manifest,directory,activeJournalPath});
 assert.equal(result.captures,1);assert.equal(result.resolutions,1);assert.equal(result.pending,0);
 assert.equal(result.automaticRolloverEnabled,false);
}));
test('recovery rejects duplicated identity after archive boundary',()=>withDir(dir=>{
 const sourceDirectory=path.join(dir,'source'),directory=path.join(dir,'archive');fs.mkdirSync(sourceDirectory);fs.mkdirSync(directory);
 const capture=event(1,'CAPTURE',{id:'Kalshi:KXBTC15M-TEST01'},'GENESIS');
 fs.writeFileSync(path.join(sourceDirectory,'shadow-events.jsonl'),JSON.stringify(capture)+'\n');
 const exported=exportImmutableShadowArchive({sourceDirectory,destinationDirectory:directory});
 const activeJournalPath=path.join(dir,'active.jsonl');fs.writeFileSync(activeJournalPath,JSON.stringify(capture)+'\n');
 const manifest={version:1,segments:[{filename:path.basename(exported.file),sha256:exported.sha256,chainTip:exported.chainTip,eventCount:1,previousChainTip:'GENESIS'}]};
 assert.throws(()=>assessArchiveRecovery({manifest,directory,activeJournalPath}),/Duplicate capture/);
}));
