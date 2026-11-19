'use strict';
// Phase-one transaction: persist and verify an immutable archive, without
// replacing the active journal. Safe to retry after a crash before cutover.
const fs=require('node:fs'),path=require('node:path');
const {planShadowRollover}=require('./audit-rollover-plan');
const {exportImmutableShadowArchive}=require('./audit-immutable-export');
const {readSegment}=require('./audit-archive-manifest');
function prepareShadowArchiveTransaction({sourceDirectory,destinationDirectory,maxEvents=650,maxRecords=300}){
 if(!path.isAbsolute(sourceDirectory||'')||!path.isAbsolute(destinationDirectory||''))
  throw Error('Absolute source and destination directories required');
 const journalPath=path.join(sourceDirectory,'shadow-events.jsonl');
 let plan;
 try{
  plan=planShadowRollover({journalPath,archiveDirectory:destinationDirectory,maxEvents,maxRecords});
 }catch(error){
  // A completed prior export may exist after an interrupted caller. Do not
  // overwrite or infer safety: require an explicit verification of that file.
  throw error;
 }
 const exported=exportImmutableShadowArchive({sourceDirectory,destinationDirectory,maxEvents,maxRecords});
 if(path.basename(exported.file)!==plan.archiveFilename||
    exported.sha256!==plan.sourceSha256||
    exported.chainTip!==plan.sourceChainTip||
    exported.eventCount!==plan.sourceEventCount)
  throw Error('Prepared archive differs from verified plan; do not rotate');
 const verified=readSegment(exported.file,{limit:maxEvents});
 if(verified.sha256!==plan.sourceSha256||verified.chainTip!==plan.sourceChainTip||
    verified.events.length!==plan.sourceEventCount)
  throw Error('Prepared archive verification failed; do not rotate');
 return Object.freeze({phase:'ARCHIVE_PREPARED_NO_CUTOVER',archivePath:exported.file,
  sha256:exported.sha256,chainTip:exported.chainTip,eventCount:exported.eventCount,
  sourceUnchanged:true,activeJournalRotated:false,automaticRolloverEnabled:false,
  evidenceStatus:'FILESYSTEM_JOURNAL_UNVERIFIED'});
}
module.exports={prepareShadowArchiveTransaction};
