'use strict';
// Offline capacity preflight for archived pending recovery. Never starts live writer.
const {planArchivedPendingHydration}=require('./audit-archive-pending-hydration-plan');
function assessArchivedPendingCapacity(options){
 const {maxEvents=650,maxRecords=300}=options;
 if(!Number.isSafeInteger(maxEvents)||maxEvents<1||
    !Number.isSafeInteger(maxRecords)||maxRecords<1)
  throw Error('Invalid monitor capacity limits');
 const plan=planArchivedPendingHydration(options);
 // Boundary hydration is a replay prerequisite, not the final unresolved set.
 // Include active-origin captures in record capacity and resolution reserves.
 const pending=plan.totalPendingCount;
 const hydratedRecords=plan.pendingCount+plan.activeCaptureCount;
 // A resolution is one durable event even when its capture is in an archive.
 // Active history already consumes event slots, including existing resolutions.
 const availableEvents=Math.max(0,maxEvents-plan.activeEvents);
 const activeFits=plan.activeEvents<=maxEvents;
 const canReserve=activeFits&&pending<=availableEvents;
 const recordSlots=Math.max(0,maxRecords-hydratedRecords);
 const safeNewCaptures=canReserve?Math.max(0,Math.min(recordSlots,
  Math.floor((availableEvents-pending)/2))):0;
 return Object.freeze({state:canReserve&&hydratedRecords<=maxRecords?
   'ARCHIVED_PENDING_CAPACITY_RESERVED':'ARCHIVED_PENDING_CAPACITY_BLOCKED',
  pending,archiveBoundaryPending:plan.pendingCount,
  activePending:plan.activePendingCount,hydratedRecords,
  activeEvents:plan.activeEvents,availableEvents,
  requiredResolutionEvents:pending,remainingRecordSlots:recordSlots,
  safeNewCaptures:hydratedRecords<=maxRecords?safeNewCaptures:0,
  reason:plan.activeEvents>maxEvents?'ACTIVE_EXCEEDS_EVENT_CAPACITY':
   hydratedRecords>maxRecords?'RECOVERED_EXCEEDS_RECORD_CAPACITY':
   !canReserve?'PENDING_EXCEEDS_EVENT_CAPACITY':null,
  evidenceStatus:'FILESYSTEM_JOURNAL_UNVERIFIED',
  mutatesStorage:false,liveStartupEnabled:false,automaticRolloverEnabled:false});
}
module.exports={assessArchivedPendingCapacity};
