'use strict';
// Offline recovery consistency gate. No live startup, journal writes or rotation.
const fs=require('node:fs'),path=require('node:path');
const {inspectArchiveSemanticIndex}=require('./audit-archive-semantic-index');
const {recoverPendingShadowCaptures}=require('./audit-archive-pending-replay');
const {isValidCaptureEvidence}=require('./shadow-monitor');
function verifyArchiveRecoveryConsistency({manifest,directory,activeJournalPath,limit=650,minimumLeadMs=60000}){
 const index=inspectArchiveSemanticIndex({manifest,directory,activeJournalPath,limit,minimumLeadMs});
 const pending=recoverPendingShadowCaptures({manifest,directory,activeJournalPath,limit});
 if(index.captures!==pending.capturedCount||
    index.resolutions!==pending.resolvedCount||
    index.pending!==pending.pendingCount||
    index.archivedEvents!==pending.archivedEvents||
    index.activeEvents!==pending.activeEvents)
  throw Error('Archive recovery views disagree on event counts');
 const indexIds=index.pendingIds;
 const pendingIds=pending.pending.map(x=>x.id);
 if(indexIds.length!==pendingIds.length||
    indexIds.some((id,i)=>id!==pendingIds[i]))
  throw Error('Archive recovery views disagree on pending identities');
 for(const item of pending.pending){
  if(!isValidCaptureEvidence(item.capture,minimumLeadMs)||item.capture.id!==item.id)
   throw Error('Pending capture fails semantic recovery validation');
 }
 // Fail closed if active journal changes during either verification pass.
 const stat=fs.lstatSync(activeJournalPath);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>12*1024*1024)
  throw Error('Active journal changed during recovery');
 const raw=fs.readFileSync(activeJournalPath);
 const {createHash}=require('node:crypto');
 const tip=createHash('sha256').update(raw).digest('hex');
 const check=inspectArchiveSemanticIndex({manifest,directory,activeJournalPath,limit,minimumLeadMs});
 if(check.captures!==index.captures||check.resolutions!==index.resolutions||
    check.pendingIds.join('\n')!==index.pendingIds.join('\n')||
    check.archivedEvents!==index.archivedEvents||check.activeEvents!==index.activeEvents)
  throw Error('Archive recovery state changed during verification');
 const after=createHash('sha256').update(fs.readFileSync(activeJournalPath)).digest('hex');
 if(tip!==after)throw Error('Active journal changed during recovery');
 return Object.freeze({state:'ARCHIVE_RECOVERY_CONSISTENT',
  capturedIds:index.capturedIds,pending:pending.pending,
  capturedCount:index.captures,resolvedCount:index.resolutions,
  pendingCount:index.pending,archivedEvents:index.archivedEvents,
  activeEvents:index.activeEvents,evidenceStatus:'FILESYSTEM_JOURNAL_UNVERIFIED',
  mutatesStorage:false,liveStartupEnabled:false,automaticRolloverEnabled:false});
}
module.exports={verifyArchiveRecoveryConsistency};
