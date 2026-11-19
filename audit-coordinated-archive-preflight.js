'use strict';
// Coordinated, non-destructive archive readiness check. The lease is useful
// only when every journal writer participates. No cutover is authorized.
const path=require('node:path');
const {withExclusiveJournalLease}=require('./audit-journal-writer-lease');
const {assessShadowCutoverGate}=require('./audit-rollover-cutover-gate');
const {assessShadowSourceDrift}=require('./audit-rollover-source-drift');
const {inspectPreparedShadowArchive}=require('./audit-archive-preparation-retry');
function inspectCoordinatedShadowArchive({sourceDirectory,archivePath,expectedSha256,expectedChainTip,expectedEventCount,limit=650}){
 if(!path.isAbsolute(sourceDirectory||'')||!path.isAbsolute(archivePath||''))
  throw Error('Absolute source directory and archive path required');
 const journalPath=path.join(sourceDirectory,'shadow-events.jsonl');
 return withExclusiveJournalLease({directory:sourceDirectory},()=>{
  const prepared=inspectPreparedShadowArchive({journalPath,archivePath,limit});
  const drift=assessShadowSourceDrift({journalPath,archivePath,expectedSha256,
   expectedChainTip,expectedEventCount,limit});
  const gate=assessShadowCutoverGate({journalPath,archivePath,expectedSha256,
   expectedChainTip,expectedEventCount,limit});
  if(prepared.sha256!==drift.sha256||drift.sha256!==gate.sha256)
   throw Error('Archive checks disagree');
  return Object.freeze({state:'COORDINATED_READ_ONLY_VERIFIED',eventCount:gate.eventCount,
   pendingIds:gate.pendingIds,sha256:gate.sha256,chainTip:gate.chainTip,
   activeJournalCanBeTruncated:false,automaticRolloverEnabled:false,mutatesStorage:false,
   warning:'Only cooperating writers respect this lease; live monitor integration required'});
 });
}
module.exports={inspectCoordinatedShadowArchive};
