'use strict';
// Offline migration gate: verifies archived records and current active journal
// together. Never rotates, truncates, or writes to either location.
const fs=require('node:fs'),path=require('node:path');
const {verifyChain}=require('./audit-journal');
const {verifyArchiveManifest,readSegment}=require('./audit-archive-manifest');
function assessArchiveRecovery({manifest,directory,activeJournalPath,limit=650}){
 const archived=verifyArchiveManifest(manifest,{directory,limit});
 const state=new Map();let total=0,settled=0;
 function accept(e){
  const id=e.payload?.id;
  if(typeof id!=='string'||!id)throw Error('Missing audit identity');
  if(e.type==='CAPTURE'){
   if(state.has(id))throw Error('Duplicate capture across archive and active journal');
   state.set(id,false);total++;
  }else if(e.type==='RESOLUTION'){
   if(!state.has(id)||state.get(id))throw Error('Orphan or duplicate resolution across archive and active journal');
   state.set(id,true);settled++;
  }else throw Error('Unsupported audit event');
 }
 for(const s of archived.segments){
  for(const e of readSegment(path.join(directory,s.filename),{limit}).events)accept(e);
 }
 if(!path.isAbsolute(activeJournalPath||''))throw Error('Absolute active journal path required');
 const st=fs.lstatSync(activeJournalPath);
 if(!st.isFile()||st.isSymbolicLink()||st.size>12*1024*1024)throw Error('Unsafe active journal');
 const bytes=fs.readFileSync(activeJournalPath);
 if(bytes.length&&bytes[bytes.length-1]!==10)throw Error('Incomplete active journal');
 const events=bytes.length?bytes.toString('utf8').trimEnd().split('\n').map(x=>JSON.parse(x)):[];
 const activeTip=verifyChain(events,{limit});
 for(const e of events)accept(e);
 return Object.freeze({readyForManualReview:true,archivedSegments:archived.segments.length,
  archivedEvents:archived.totalEvents,activeEvents:events.length,activeTip,
  captures:total,resolutions:settled,pending:total-settled,
  mutatesStorage:false,automaticRolloverEnabled:false,
  evidenceStatus:'FILESYSTEM_JOURNAL_UNVERIFIED'});
}
module.exports={assessArchiveRecovery};
