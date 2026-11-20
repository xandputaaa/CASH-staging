'use strict';
// Offline archive segment manifest verifier. Does not mutate or rotate live data.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {verifyChain}=require('./audit-journal');
const SHA=/^[a-f0-9]{64}$/;
function readSegment(file,{limit=650}={}){
 // Bind verification to one opened inode. A path-only lstat/read pair can
 // follow a swapped symlink or read a different file between those calls.
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 let bytes;
 try{
  const before=fs.fstatSync(fd);
  if(!before.isFile()||before.nlink!==1||before.size>12*1024*1024)
   throw Error('Unsafe archive segment');
  bytes=fs.readFileSync(fd);
  const after=fs.fstatSync(fd);
  if(before.dev!==after.dev||before.ino!==after.ino||
     before.size!==after.size||bytes.length!==before.size)
   throw Error('Archive segment changed during verification');
 }finally{fs.closeSync(fd)}
 if(!bytes.length||bytes[bytes.length-1]!==10)throw Error('Incomplete archive segment');
 const events=bytes.toString('utf8').trimEnd().split('\n').map(x=>JSON.parse(x));
 const chainTip=verifyChain(events,{limit});
 return {events,sha256:createHash('sha256').update(bytes).digest('hex'),chainTip};
}
function verifyArchiveManifest(manifest,{directory,limit=650}={}){
 if(!manifest||manifest.version!==1||!Array.isArray(manifest.segments)||!manifest.segments.length)
  throw Error('Invalid archive manifest');
 if(!path.isAbsolute(directory||''))throw Error('Absolute archive directory required');
 const seen=new Set();let previousTip='GENESIS',totalEvents=0;
 const segments=manifest.segments.map((entry,i)=>{
  if(!entry||typeof entry.filename!=='string'||!/^shadow-segment-[a-zA-Z0-9-]+\.jsonl$/.test(entry.filename)
    ||seen.has(entry.filename)||!SHA.test(entry.sha256||'')||!SHA.test(entry.chainTip||''))
   throw Error('Invalid segment entry at '+i);
  seen.add(entry.filename);
  const file=path.join(directory,entry.filename);
  const {events,sha256,chainTip}=readSegment(file,{limit});
  if(sha256!==entry.sha256||chainTip!==entry.chainTip||events.length!==entry.eventCount)
   throw Error('Archive segment digest or count mismatch at '+i);
  if(i===0&&entry.previousChainTip!=='GENESIS')throw Error('Invalid initial archive link');
  if(i>0&&entry.previousChainTip!==previousTip)throw Error('Archive segment continuity mismatch');
  // Current legacy format restarts each segment at GENESIS; cross-segment
  // continuity is established by manifest tip references, not event-level links.
  previousTip=chainTip;totalEvents+=events.length;
  return Object.freeze({filename:entry.filename,eventCount:events.length,chainTip,sha256});
 });
 return Object.freeze({verified:true,segments,totalEvents,chainTip:previousTip,
  evidenceStatus:'FILESYSTEM_JOURNAL_UNVERIFIED',mutatesStorage:false});
}
module.exports={readSegment,verifyArchiveManifest};
