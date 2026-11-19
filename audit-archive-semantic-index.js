'use strict';
// Archive-wide semantic identity index, with per-segment chain verification.
// Unlike the bounded live monitor, does not concatenate or rewrite event hashes.
const fs=require('node:fs'),path=require('node:path');
const {verifyArchiveManifest,readSegment}=require('./audit-archive-manifest');
const {verifyChain}=require('./audit-journal');
const {isValidCaptureEvidence,hasVerifiedEvidence}=require('./shadow-monitor');
function inspectArchiveSemanticIndex({manifest,directory,activeJournalPath,limit=650,minimumLeadMs=60000}){
 const verified=verifyArchiveManifest(manifest,{directory,limit});
 if(!path.isAbsolute(activeJournalPath||''))throw Error('Absolute active journal required');
 const stat=fs.lstatSync(activeJournalPath);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>12*1024*1024)throw Error('Unsafe active journal');
 const bytes=fs.readFileSync(activeJournalPath);
 if(bytes.length&&bytes[bytes.length-1]!==10)throw Error('Incomplete active journal');
 const active=bytes.length?bytes.toString('utf8').trimEnd().split('\n').map(JSON.parse):[];
 verifyChain(active,{limit});
 const records=new Map();
 let resolved=0;
 function accept(event){
  const x=event.payload,id=x?.id;
  if(typeof id!=='string'||!id)throw Error('Missing audit identity');
  if(event.type==='CAPTURE'){
   if(records.has(id))throw Error('Duplicate capture across archive history');
   if(!isValidCaptureEvidence(x,minimumLeadMs))throw Error('Semantically invalid archived capture');
   records.set(id,{capture:x,resolved:false});
  }else if(event.type==='RESOLUTION'){
   const record=records.get(id);
   if(!record||record.resolved)throw Error('Orphan or duplicate resolution across archive history');
   const capture=record.capture;
   const allowed=capture.venue==='Kalshi'?['YES','NO','VOID']:['UP','DOWN','VOID'];
   if(x.venue!==capture.venue||x.marketId!==capture.marketId||
    !allowed.includes(x.winner)||typeof x.source!=='string'||
    !Number.isFinite(Date.parse(x.checkedAt))||!hasVerifiedEvidence(x,capture))
    throw Error('Semantically invalid archived resolution');
   record.resolved=true;resolved++;
  }else throw Error('Unsupported audit event');
 }
 for(const segment of verified.segments){
  for(const event of readSegment(path.join(directory,segment.filename),{limit}).events)accept(event);
 }
 for(const event of active)accept(event);
 const pendingIds=[...records].filter(([,x])=>!x.resolved).map(([id])=>id).sort();
 return Object.freeze({state:'ARCHIVE_SEMANTIC_INDEX_VERIFIED',
  captures:records.size,resolutions:resolved,pendingIds:Object.freeze(pendingIds),
  pending:pendingIds.length,archivedEvents:verified.totalEvents,activeEvents:active.length,
  evidenceStatus:'FILESYSTEM_JOURNAL_UNVERIFIED',mutatesStorage:false,
  liveStartupEnabled:false,automaticRolloverEnabled:false});
}
module.exports={inspectArchiveSemanticIndex};
