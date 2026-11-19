'use strict';
// Read-only cutover gate. An immutable export alone is not permission to
// truncate the active journal; monitor restart/replay is not yet wired.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {verifyChain}=require('./audit-journal');
const {readSegment}=require('./audit-archive-manifest');
function assessShadowCutoverGate({journalPath,archivePath,expectedSha256,expectedChainTip,expectedEventCount,limit=650}){
 if(!path.isAbsolute(journalPath||'')||!path.isAbsolute(archivePath||''))
  throw Error('Absolute paths required');
 const source=fs.lstatSync(journalPath),archive=fs.lstatSync(archivePath);
 if(!source.isFile()||source.isSymbolicLink()||source.size>12*1024*1024||
    !archive.isFile()||archive.isSymbolicLink())
  throw Error('Unsafe source or archive');
 if(fs.realpathSync(journalPath)===fs.realpathSync(archivePath))
  throw Error('Archive must not alias active journal');
 const bytes=fs.readFileSync(journalPath);
 if(!bytes.length||bytes[bytes.length-1]!==10)throw Error('Incomplete active journal');
 const events=bytes.toString('utf8').trimEnd().split('\n').map(JSON.parse);
 const tip=verifyChain(events,{limit});
 const digest=createHash('sha256').update(bytes).digest('hex');
 const verified=readSegment(archivePath,{limit});
 if(digest!==expectedSha256||tip!==expectedChainTip||
    events.length!==expectedEventCount||verified.sha256!==digest||
    verified.chainTip!==tip||verified.events.length!==events.length)
  throw Error('Archive/source mismatch; cutover prohibited');
 let pending=new Set(),captured=new Set();
 for(const e of events){
  const id=e.payload?.id;
  if(typeof id!=='string'||!id)throw Error('Missing record identity');
  if(e.type==='CAPTURE'){
   if(captured.has(id))throw Error('Duplicate capture');
   captured.add(id);pending.add(id);
  }else if(e.type==='RESOLUTION'){
   if(!pending.delete(id))throw Error('Orphan or duplicate resolution');
  }else throw Error('Unsupported event type');
 }
 return Object.freeze({status:'ARCHIVE_MATCHED_CUTOVER_NOT_AUTHORIZED',
  pendingCount:pending.size,pendingIds:Object.freeze([...pending].sort()),
  eventCount:events.length,sha256:digest,chainTip:tip,
  activeJournalCanBeTruncated:false,monitorReplayRequired:true,
  automaticRolloverEnabled:false,mutatesStorage:false});
}
module.exports={assessShadowCutoverGate};
