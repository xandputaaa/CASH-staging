'use strict';
// Offline read-only replay across immutable archive segments.
// This is not live rollover and does not write to the production journal.
const path=require('node:path');
const {verifyArchiveManifest,readSegment}=require('./audit-archive-manifest');
function replayArchivedShadowRecords(manifest,{directory,limit=650}={}){
 const verified=verifyArchiveManifest(manifest,{directory,limit});
 const records=new Map();let captures=0,resolutions=0;
 for(const segment of verified.segments){
  const {events}=readSegment(path.join(directory,segment.filename),{limit});
  for(const event of events){
   const id=event.payload?.id;
   if(typeof id!=='string'||!id)throw Error('Missing archive record identity');
   if(event.type==='CAPTURE'){
    if(records.has(id))throw Error('Duplicate capture across archive segments: '+id);
    records.set(id,{capture:event.payload,resolution:null});captures++;
   }else if(event.type==='RESOLUTION'){
    const record=records.get(id);
    if(!record||record.resolution)throw Error('Orphan or duplicate resolution across archive segments: '+id);
    record.resolution=event.payload;resolutions++;
   }else throw Error('Unsupported archive event type');
  }
 }
 return Object.freeze({verified:true,segments:verified.segments.length,captures,resolutions,
  pending:captures-resolutions,totalEvents:verified.totalEvents,
  evidenceStatus:'FILESYSTEM_JOURNAL_UNVERIFIED',mutatesStorage:false});
}
module.exports={replayArchivedShadowRecords};
