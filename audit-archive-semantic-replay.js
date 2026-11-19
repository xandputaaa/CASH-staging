'use strict';
// Offline semantic replay gate. Uses the real shadow monitor's capture and
// settlement validators, not merely event IDs and SHA chain links.
// No live journal writes, rollover, or production startup changes.
const fs=require('node:fs'),path=require('node:path');
const {verifyArchiveManifest,readSegment}=require('./audit-archive-manifest');
const {verifyChain,hashEvent}=require('./audit-journal');
const {createShadowMonitor}=require('./shadow-monitor');
function verifyArchivedShadowMonitorReplay({manifest,directory,activeJournalPath,limit=650,maxRecords=300}){
 const verified=verifyArchiveManifest(manifest,{directory,limit});
 if(!path.isAbsolute(activeJournalPath||''))throw Error('Absolute active journal required');
 const st=fs.lstatSync(activeJournalPath);
 if(!st.isFile()||st.isSymbolicLink()||st.size>12*1024*1024)throw Error('Unsafe active journal');
 const raw=fs.readFileSync(activeJournalPath);
 if(raw.length&&raw[raw.length-1]!==10)throw Error('Incomplete active journal');
 const active=raw.length?raw.toString('utf8').trimEnd().split('\n').map(JSON.parse):[];
 verifyChain(active,{limit});
 const all=[];
 for(const s of verified.segments){
  all.push(...readSegment(path.join(directory,s.filename),{limit}).events);
 }
 all.push(...active);
 if(all.length>limit)throw Error('Combined replay exceeds monitor event capacity');
 // Normalize segment-local sequence and links into a temporary in-memory
 // chain solely for semantic replay; original on-disk evidence is untouched.
 let previousHash='GENESIS';
 const replay=all.map((e,i)=>{
  const body={sequence:i+1,type:e.type,recordedAt:e.recordedAt,
   payload:e.payload,previousHash};
  const rewritten={...body,hash:hashEvent(body)};
  previousHash=rewritten.hash;
  return rewritten;
 });
 verifyChain(replay,{limit});
 const journal={mode:'FILESYSTEM_JOURNAL_UNVERIFIED',configured:true,events:replay,
  append(){throw Error('Offline replay must never append')}};
 const monitor=createShadowMonitor({quotes:{query:async()=>null},
  results:{lookup:async()=>null},journal,maxEvents:limit,maxRecords});
 const snapshot=monitor.snapshot();
 return Object.freeze({state:'SEMANTIC_REPLAY_VERIFIED',archivedSegments:verified.segments.length,
  archivedEvents:verified.totalEvents,activeEvents:active.length,
  observed:snapshot.observed,pending:snapshot.pending,settled:snapshot.settled,
  evidenceStatus:'FILESYSTEM_JOURNAL_UNVERIFIED',mutatesStorage:false,
  liveStartupEnabled:false,automaticRolloverEnabled:false});
}
module.exports={verifyArchivedShadowMonitorReplay};
