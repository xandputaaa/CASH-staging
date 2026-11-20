'use strict';
// Reconstruct pending captures across archived and active journal segments.
// Read-only; consumers must still validate capture semantics before acting.
const fs=require('node:fs'),path=require('node:path');
const {verifyChain}=require('./audit-journal');
const {verifyArchiveManifest,readSegment}=require('./audit-archive-manifest');
function recoverPendingShadowCaptures({manifest,directory,activeJournalPath,limit=650}){
 const verified=verifyArchiveManifest(manifest,{directory,limit});
 if(!path.isAbsolute(activeJournalPath||''))throw Error('Absolute active journal required');
 const activeStat=fs.lstatSync(activeJournalPath);
 if(!activeStat.isFile()||activeStat.isSymbolicLink()||activeStat.size>12*1024*1024)
  throw Error('Unsafe active journal');
 const bytes=fs.readFileSync(activeJournalPath);
 if(bytes.length&&bytes[bytes.length-1]!==10)throw Error('Incomplete active journal');
 const active=bytes.length?bytes.toString('utf8').trimEnd().split('\n').map(JSON.parse):[];
 verifyChain(active,{limit});
 const records=new Map();
 function accept(event){
  const id=event.payload?.id;
  if(typeof id!=='string'||!id)throw Error('Missing audit identity');
  if(event.type==='CAPTURE'){
   if(records.has(id))throw Error('Duplicate capture across archive and active journal');
   records.set(id,{capture:event.payload,resolution:null});
  }else if(event.type==='RESOLUTION'){
   const existing=records.get(id);
   if(!existing||existing.resolution)throw Error('Orphan or duplicate resolution across archive and active journal');
   existing.resolution=event.payload;
  }else throw Error('Unsupported audit event');
 }
 for(const segment of verified.segments){
  const reread=readSegment(path.join(directory,segment.filename),{limit});
  if(reread.sha256!==segment.sha256||reread.chainTip!==segment.chainTip||reread.events.length!==segment.eventCount)
   throw Error('Archive segment changed after manifest verification');
  for(const event of reread.events)accept(event);
 }
 const archiveBoundaryPending=[...records].filter(([,r])=>r.resolution===null)
  .map(([id,r])=>Object.freeze({id,capture:Object.freeze({...r.capture})}))
  .sort((a,b)=>a.id.localeCompare(b.id));
 for(const event of active)accept(event);
 const pending=[...records].filter(([,r])=>r.resolution===null)
  .map(([id,r])=>Object.freeze({id,capture:Object.freeze({...r.capture})}))
  .sort((a,b)=>a.id.localeCompare(b.id));
 return Object.freeze({pending:Object.freeze(pending),pendingCount:pending.length,
  archiveBoundaryPending:Object.freeze(archiveBoundaryPending),
  capturedCount:records.size,resolvedCount:records.size-pending.length,
  archivedEvents:verified.totalEvents,activeEvents:active.length,
  evidenceStatus:'FILESYSTEM_JOURNAL_UNVERIFIED',mutatesStorage:false,
  automaticRolloverEnabled:false});
}
module.exports={recoverPendingShadowCaptures};
