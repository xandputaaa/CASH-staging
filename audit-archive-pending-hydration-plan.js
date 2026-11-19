'use strict';
// Read-only, validated recovery plan for archived unresolved captures.
// Does not seed the live monitor or mutate the journal.
const {verifyArchiveRecoveryConsistency}=require('./audit-archive-recovery-consistency');
const {isValidCaptureEvidence}=require('./shadow-monitor');
function planArchivedPendingHydration(options){
 const recovered=verifyArchiveRecoveryConsistency(options);
 const minimumLeadMs=options.minimumLeadMs===undefined?60000:options.minimumLeadMs;
 const pendingRecords=recovered.pending.map(({id,capture})=>{
  if(capture.id!==id||!isValidCaptureEvidence(capture,minimumLeadMs))
   throw Error('Invalid archived pending capture');
  return Object.freeze({...capture,status:'PENDING',winner:null,
   outcomeSource:null,outcomeCheckedAt:null,outcomeSettledAt:null,
   outcomeEvidence:null,lastCheckAt:null,settlementAttempts:0,
   pendingReason:null,captureSequence:null,
   archiveRecovered:true});
 });
 // Archived pending captures are evidence, not trusted mutable runtime objects.
 // Clone their nested quote/spot evidence so a caller cannot mutate the
 // recovery result and accidentally change another consumer's state.
 for(const record of pendingRecords){
  if(record.observedAsks&&typeof record.observedAsks==='object')
   Object.freeze(record.observedAsks);
  if(record.spotCandidate&&typeof record.spotCandidate==='object')
   Object.freeze(record.spotCandidate);
 }
 const ids=new Set(recovered.capturedIds);
 if(ids.size!==recovered.capturedCount||pendingRecords.some(r=>!ids.has(r.id)))
  throw Error('Recovered pending identities do not match historical identity set');
 return Object.freeze({state:'ARCHIVED_PENDING_HYDRATION_PLANNED',
  capturedIds:Object.freeze([...ids]),pendingRecords:Object.freeze(pendingRecords),
  capturedCount:recovered.capturedCount,pendingCount:pendingRecords.length,
  resolvedCount:recovered.resolvedCount,archivedEvents:recovered.archivedEvents,
  activeEvents:recovered.activeEvents,
  evidenceStatus:'FILESYSTEM_JOURNAL_UNVERIFIED',mutatesStorage:false,
  liveStartupEnabled:false,automaticRolloverEnabled:false});
}
module.exports={planArchivedPendingHydration};
