'use strict';
// Read-only, validated recovery plan for archived unresolved captures.
// Does not seed the live monitor or mutate the journal.
const {verifyArchiveRecoveryConsistency}=require('./audit-archive-recovery-consistency');
const {isValidCaptureEvidence}=require('./shadow-monitor');
function freezeEvidenceTree(value){
 if(value&&typeof value==='object'&&!Object.isFrozen(value)){
  for(const nested of Object.values(value))freezeEvidenceTree(nested);
  Object.freeze(value);
 }
 return value;
}
function planArchivedPendingHydration(options){
 const recovered=verifyArchiveRecoveryConsistency(options);
 const minimumLeadMs=options.minimumLeadMs===undefined?60000:options.minimumLeadMs;
 const archivedIds=new Set(recovered.archivedCaptureIds);
 const activeIds=new Set(recovered.activeCaptureIds);
 if(archivedIds.size!==recovered.archivedCaptureIds.length||
    activeIds.size!==recovered.activeCaptureIds.length||
    [...archivedIds].some(id=>activeIds.has(id))||
    archivedIds.size+activeIds.size!==recovered.capturedCount)
  throw Error('Recovered archive and active identity partitions disagree');
 // Active CAPTURE events are replayed by the monitor from its active journal.
 // Only unresolved captures originating in archived segments are pre-seeded.
 // Seed the archive-boundary pending set, including captures resolved later
 // in the active journal; otherwise active RESOLUTION events are orphaned.
 const archivedPending=recovered.archiveBoundaryPending;
 const pendingRecords=archivedPending.map(({id,capture})=>{
  if(capture.id!==id||!isValidCaptureEvidence(capture,minimumLeadMs))
   throw Error('Invalid archived pending capture');
  return freezeEvidenceTree({...structuredClone(capture),status:'PENDING',winner:null,
   outcomeSource:null,outcomeCheckedAt:null,outcomeSettledAt:null,
   outcomeEvidence:null,lastCheckAt:null,settlementAttempts:0,
   pendingReason:null,captureSequence:null,
   archiveRecovered:true});
 });
 const ids=archivedIds;
 if(pendingRecords.some(r=>!ids.has(r.id)))
  throw Error('Recovered pending identities do not match historical identity set');
 return Object.freeze({state:'ARCHIVED_PENDING_HYDRATION_PLANNED',
  capturedIds:Object.freeze([...ids]),pendingRecords:Object.freeze(pendingRecords),
  capturedCount:ids.size,pendingCount:pendingRecords.length,
  activeCaptureIds:Object.freeze([...activeIds].sort()),
  activeCaptureCount:activeIds.size,
  activePendingCount:recovered.pending.filter(item=>activeIds.has(item.id)).length,
  finalArchivedPendingCount:recovered.pending.filter(item=>archivedIds.has(item.id)).length,
  totalCapturedCount:recovered.capturedCount,totalPendingCount:recovered.pendingCount,
  resolvedCount:recovered.resolvedCount,archivedEvents:recovered.archivedEvents,
  activeEvents:recovered.activeEvents,
  evidenceStatus:'FILESYSTEM_JOURNAL_UNVERIFIED',mutatesStorage:false,
  liveStartupEnabled:false,automaticRolloverEnabled:false});
}
module.exports={planArchivedPendingHydration};
