'use strict';
// Offline, non-destructive archive export. Never rotates or mutates the live journal.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {verifyChain}=require('./audit-journal');
const {assessRolloverReadiness}=require('./audit-rollover-preflight');
const MAX_BYTES=12*1024*1024;
function exportImmutableShadowArchive({sourceDirectory,destinationDirectory,maxEvents=650,maxRecords=300}){
 if(!path.isAbsolute(sourceDirectory||'')||!path.isAbsolute(destinationDirectory||''))
  throw Error('Absolute source and destination directories required');
 const source=path.join(sourceDirectory,'shadow-events.jsonl');
 const sourceStat=fs.lstatSync(source);
 if(!sourceStat.isFile()||sourceStat.isSymbolicLink()||sourceStat.size>MAX_BYTES)
  throw Error('Unsafe source journal');
 const destinationStat=fs.lstatSync(destinationDirectory);
 if(!destinationStat.isDirectory()||destinationStat.isSymbolicLink())
  throw Error('Unsafe archive destination');
 if(fs.realpathSync(sourceDirectory)===fs.realpathSync(destinationDirectory))
  throw Error('Archive destination must differ from source');
 const bytes=fs.readFileSync(source);
 if(!bytes.length||bytes[bytes.length-1]!==10)throw Error('Incomplete source journal');
 const lines=bytes.toString('utf8').trimEnd().split('\n');
 const events=lines.map(line=>JSON.parse(line));
 const readiness=assessRolloverReadiness(events,{maxEvents,maxRecords});
 const digest=createHash('sha256').update(bytes).digest('hex');
 const name='shadow-segment-'+String(events.length).padStart(4,'0')+'-'+digest.slice(0,16)+'.jsonl';
 const target=path.join(destinationDirectory,name);
 const fd=fs.openSync(target,'wx',0o400);
 try{
  let written=0;
  while(written<bytes.length)written+=fs.writeSync(fd,bytes,written,bytes.length-written,written);
  fs.fsyncSync(fd);
 }catch(e){try{fs.unlinkSync(target)}catch{}throw e}
 finally{fs.closeSync(fd)}
 try{
  const exported=fs.readFileSync(target);
  if(!exported.equals(bytes)||createHash('sha256').update(exported).digest('hex')!==digest)
   throw Error('Archive verification failed');
  verifyChain(events,{limit:maxEvents});
  const after=fs.readFileSync(source);
  if(!after.equals(bytes))throw Error('Source changed during archive export; retry');
  const dirfd=fs.openSync(destinationDirectory,'r');
  try{fs.fsyncSync(dirfd)}finally{fs.closeSync(dirfd)}
 }catch(e){try{fs.unlinkSync(target)}catch{}throw e}
 return Object.freeze({file:target,sha256:digest,eventCount:events.length,chainTip:readiness.chainTip,
  pendingCount:readiness.pendingCount,sourceUnchanged:true,rotated:false,
  evidenceStatus:'FILESYSTEM_JOURNAL_UNVERIFIED'});
}
module.exports={exportImmutableShadowArchive};
