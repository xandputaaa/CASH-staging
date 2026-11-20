'use strict';
// Explicit one-time local archive cutover. No automatic rollover or orders.
// Preserves original bytes in a verified, fsynced immutable segment before
// committing a manifest and emptying the active file under the writer lease.
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {withExclusiveJournalLease}=require('./audit-journal-writer-lease');
const {verifyChain}=require('./audit-journal');
const {assessRolloverReadiness}=require('./audit-rollover-preflight');
const {verifyArchiveManifest}=require('./audit-archive-manifest');
const {commitVerifiedArchiveManifest}=require('./audit-archive-manifest-commit');
const {createShadowMonitor}=require('./shadow-monitor');
const MAX_BYTES=12*1024*1024;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function regular(file){
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||
    stat.size>MAX_BYTES)throw Error('Unsafe cutover file');
 const bytes=fs.readFileSync(file);
 if(bytes.length!==stat.size)throw Error('Cutover source changed during read');
 return {stat,bytes,sha256:hash(bytes)};
}
function readActive(file){
 const source=regular(file);
 if(source.bytes.length&&source.bytes.at(-1)!==10)
  throw Error('Incomplete active journal at cutover');
 const events=source.bytes.length?
  source.bytes.toString('utf8').trimEnd().split('\n').map(JSON.parse):[];
 verifyChain(events,{limit:650});
 return {...source,events};
}
function fsyncActiveEmpty(file,original){
 const current=readActive(file);
 if(current.stat.dev!==original.stat.dev||
    current.stat.ino!==original.stat.ino||
    current.sha256!==original.sha256)
  throw Error('Active journal drift before cutover; no truncation');
 const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW);
 try{
  const opened=fs.fstatSync(fd);
  if(opened.dev!==original.stat.dev||opened.ino!==original.stat.ino||
     opened.size!==original.stat.size)
   throw Error('Active journal was replaced before cutover');
  fs.ftruncateSync(fd,0);
  fs.fsyncSync(fd);
 }finally{fs.closeSync(fd)}
 if(readActive(file).bytes.length)throw Error('Cutover active journal did not empty');
}
function createSegment(file,bytes){
 if(fs.existsSync(file)){
  const present=regular(file);
  if(!present.bytes.equals(bytes))throw Error('Existing archive segment conflicts with source');
  return;
 }
 const fd=fs.openSync(file,'wx',0o400);
 try{
  let offset=0;
  while(offset<bytes.length)offset+=fs.writeSync(fd,bytes,offset,bytes.length-offset);
  fs.fsyncSync(fd);
 }finally{fs.closeSync(fd)}
 const saved=regular(file);
 if(!saved.bytes.equals(bytes))throw Error('Immutable archive export verification failed');
 const dfd=fs.openSync(path.dirname(file),'r');
 try{fs.fsyncSync(dfd)}finally{fs.closeSync(dfd)}
}
function cutoverFullShadowJournal({directory,expectedEvents=600}={}){
 if(!path.isAbsolute(directory||''))throw Error('Absolute journal directory required');
 if(!Number.isSafeInteger(expectedEvents)||expectedEvents<2||expectedEvents>650)
  throw Error('Expected cutover event count required');
 const d=fs.lstatSync(directory);
 if(!d.isDirectory()||d.isSymbolicLink())throw Error('Unsafe journal directory');
 return withExclusiveJournalLease({directory},()=>{
  const active=path.join(directory,'shadow-events.jsonl');
  const manifestPath=path.join(directory,'shadow-archive-manifest.json');
  const source=readActive(active);
  if(fs.existsSync(manifestPath)){
   const committed=regular(manifestPath);
   if(!committed.bytes.length||committed.bytes.at(-1)!==10)
    throw Error('Incomplete committed archive manifest');
   const manifest=JSON.parse(committed.bytes.toString('utf8'));
   const verified=verifyArchiveManifest(manifest,{directory});
   // A crash after manifest commit and before emptying the original source
   // is safe to finish only when the exact same source is archived.
   const match=manifest.segments.some(x=>x.sha256===source.sha256&&
     x.eventCount===source.events.length&&source.events.length===expectedEvents);
   if(match&&source.bytes.length){
    const preflight=assessRolloverReadiness(source.events,{maxRecords:300,maxEvents:650});
    if(preflight.pendingCount!==0)throw Error('Pending source requires manual cutover review');
    fsyncActiveEmpty(active,source);
    return Object.freeze({state:'COMMITTED_CUTOVER_CRASH_RECOVERED',
     archivedEvents:source.events.length,archivedSegments:verified.segments.length,
     activeJournalEmpty:true,automaticRolloverEnabled:false});
   }
   return Object.freeze({state:'ARCHIVE_ALREADY_COMMITTED',
    archivedEvents:verified.totalEvents,activeJournalEmpty:source.bytes.length===0,
    automaticRolloverEnabled:false});
  }
  if(source.events.length!==expectedEvents||!source.bytes.length)
   throw Error('Expected full source journal unavailable; cutover refused');
  const preflight=assessRolloverReadiness(source.events,{maxRecords:300,maxEvents:650});
  if(preflight.pendingCount!==0||preflight.status!=='CAPTURE_BLOCKED')
   throw Error('Source is not safely settled and capacity-blocked');
  const monitor=createShadowMonitor({quotes:{},results:{},
   journal:{events:source.events},maxRecords:300,maxEvents:650});
  const replay=monitor.snapshot();
  if(replay.observed!==300||replay.pending!==0||replay.recordedEvents!==expectedEvents)
   throw Error('Source semantic replay mismatch');
  const filename='shadow-segment-'+String(expectedEvents).padStart(4,'0')+
   '-'+source.sha256.slice(0,16)+'.jsonl';
  const segmentPath=path.join(directory,filename);
  createSegment(segmentPath,source.bytes);
  const segment=regular(segmentPath);
  const manifest={version:1,segments:[{
   filename,sha256:segment.sha256,chainTip:preflight.chainTip,
   eventCount:source.events.length,previousChainTip:'GENESIS'}]};
  const verified=verifyArchiveManifest(manifest,{directory});
  if(verified.totalEvents!==expectedEvents)
   throw Error('Archive manifest event count mismatch');
  // Commit before truncation; a crash at either boundary is recoverable.
  const current=readActive(active);
  if(current.sha256!==source.sha256||current.stat.ino!==source.stat.ino||
     current.stat.dev!==source.stat.dev)
   throw Error('Source drift; archive committed state not yet authorized');
  commitVerifiedArchiveManifest({directory,manifest});
  fsyncActiveEmpty(active,source);
  return Object.freeze({state:'VERIFIED_CUTOVER_COMMITTED',
   archivedEvents:verified.totalEvents,activeJournalEmpty:true,
   automaticRolloverEnabled:false});
 });
}
module.exports={cutoverFullShadowJournal};
