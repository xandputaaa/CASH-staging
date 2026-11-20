'use strict';
// Explicit, single-volume live recovery of an already committed archive.
// No archive cutover, auto-rotation, real orders, or independent timestamp attestation.
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {withLeasedArchiveRecovery}=require('./audit-archive-leased-recovery');
const {withExclusiveJournalLease}=require('./audit-journal-writer-lease');
const {verifyChain,hashEvent}=require('./audit-journal');
const {createShadowMonitor}=require('./shadow-monitor');
const MAX_BYTES=12*1024*1024;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function fingerprint(file,limit=MAX_BYTES){
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.size>limit||st.nlink!==1)
  throw Error('Unsafe archive recovery file');
 const bytes=fs.readFileSync(file);
 if(bytes.length!==st.size)throw Error('Archive recovery file changed while reading');
 return {dev:st.dev,ino:st.ino,size:st.size,sha256:hash(bytes),bytes};
}
function sameFile(file,original,limit=MAX_BYTES){
 const current=fingerprint(file,limit);
 if(current.dev!==original.dev||current.ino!==original.ino||
    current.size!==original.size||current.sha256!==original.sha256)
  throw Error('Archive recovery file changed after verification');
 return current;
}
function readActive(bytes,maxEvents){
 if(bytes.length&&bytes[bytes.length-1]!==10)throw Error('Incomplete active audit journal');
 const events=bytes.length?bytes.toString('utf8').trimEnd().split('\n').map(JSON.parse):[];
 verifyChain(events,{limit:maxEvents});
 return events;
}
function createLiveRecoveredMonitor({
 directory,quotes,results,clock,spot,minimumLeadMs=60000,maxRecords=300,maxEvents=650
}={}){
 if(!path.isAbsolute(directory||''))throw Error('Absolute audit directory required');
 const dir=fs.lstatSync(directory);
 if(!dir.isDirectory()||dir.isSymbolicLink())throw Error('Unsafe audit directory');
 if(!quotes||!results)throw Error('Read-only quote and result feeds required');
 const manifestPath=path.join(directory,'shadow-archive-manifest.json');
 const activeJournalPath=path.join(directory,'shadow-events.jsonl');
 const manifestStamp=fingerprint(manifestPath,1024*1024);
 if(!manifestStamp.bytes.length||manifestStamp.bytes.at(-1)!==10)
  throw Error('Incomplete committed archive manifest');
 const manifest=JSON.parse(manifestStamp.bytes.toString('utf8'));
 const options={directory,manifest,activeJournalPath,minimumLeadMs,maxRecords,maxEvents};
 return withLeasedArchiveRecovery(options,({plan,capacity})=>{
  sameFile(manifestPath,manifestStamp,1024*1024);
  if(capacity.state!=='ARCHIVED_PENDING_CAPACITY_RESERVED')
   throw Error('Insufficient archived pending recovery capacity');
  const segments=manifest.segments.map(entry=>{
   const file=path.join(directory,entry.filename);
   return {file,stamp:fingerprint(file)};
  });
  let activeStamp=fingerprint(activeJournalPath);
  const events=readActive(activeStamp.bytes,maxEvents);
  if(events.length!==plan.activeEvents)throw Error('Active replay event count mismatch');
  const journal={
   mode:'FILESYSTEM_ARCHIVE_RECOVERED_UNVERIFIED',configured:true,path:activeJournalPath,
   events:events.map(x=>structuredClone(x)),
   append(event){
    return withExclusiveJournalLease({directory},()=>{
     sameFile(manifestPath,manifestStamp,1024*1024);
     for(const item of segments)sameFile(item.file,item.stamp);
     sameFile(activeJournalPath,activeStamp);
     const tip=verifyChain(journal.events,{limit:maxEvents});
     if(journal.events.length>=maxEvents||event.sequence!==journal.events.length+1||
        event.previousHash!==tip||hashEvent(event)!==event.hash)
      throw Error('Recovered live journal append rejected');
     const bytes=Buffer.from(JSON.stringify(event)+'\n');
     if(activeStamp.size+bytes.length>MAX_BYTES)
      throw Error('Recovered live journal exceeds size limit');
     const fd=fs.openSync(activeJournalPath,fs.constants.O_WRONLY|
       fs.constants.O_APPEND|fs.constants.O_NOFOLLOW);
     try{
      const open=fs.fstatSync(fd);
      if(open.dev!==activeStamp.dev||open.ino!==activeStamp.ino||
         open.size!==activeStamp.size)throw Error('Active journal replaced before append');
      let offset=0;
      while(offset<bytes.length)offset+=fs.writeSync(fd,bytes,offset,bytes.length-offset);
      fs.fsyncSync(fd);
     }finally{fs.closeSync(fd)}
     journal.events.push(structuredClone(event));
     activeStamp=fingerprint(activeJournalPath);
     return event;
    });
   }
  };
  const monitor=createShadowMonitor({
   quotes,results,clock,spot,minimumLeadMs,maxRecords,maxEvents,
   archivedPendingState:plan,journal
  });
  const snapshot=monitor.snapshot();
  if(snapshot.pending!==plan.totalPendingCount||
     snapshot.recoveredEvents!==plan.activeEvents||
     snapshot.archivedHistoricalCaptures!==plan.capturedCount)
   throw Error('Recovered live monitor state does not match verified plan');
  sameFile(manifestPath,manifestStamp,1024*1024);
  return monitor;
 });
}
module.exports={createLiveRecoveredMonitor};
