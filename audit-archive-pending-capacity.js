'use strict';
// Offline capacity preflight for archived pending recovery. Never starts live writer.
const {planArchivedPendingHydration}=require('./audit-archive-pending-hydration-plan');
function assessArchivedPendingCapacity(options){
 const {maxEvents=650,maxRecords=300}=options;
 if(!Number.isSafeInteger(maxEvents)||maxEvents<1||
    !Number.isSafeInteger(maxRecords)||maxRecords<1)
  throw Error('Invalid monitor capacity limits');
 const plan=planArchivedPendingHydration(options);
 const pending=plan.pendingCount;
 // A resolution is one durable event even when its capture is in an archive.
 // Active history already consumes event slots, including existing resolutions.
 const availableEvents=Math.max(0,maxEvents-plan.activeEvents);
 const canReserve=pending<=availableEvents;
 const recordSlots=Math.max(0,maxRecords-pending);
 const safeNewCaptures=canReserve?Math.max(0,Math.min(recordSlots,
  Math.floor((availableEvents-pending)/2))):0;
 return Object.freeze({state:canReserve&&pending<=maxRecords?
   'ARCHIVED_PENDING_CAPACITY_RESERVED':'ARCHIVED_PENDING_CAPACITY_BLOCKED',
  pending,activeEvents:plan.activeEvents,availableEvents,
  requiredResolutionEvents:pending,remainingRecordSlots:recordSlots,
  safeNewCaptures:pending<=maxRecords?safeNewCaptures:0,
  reason:pending>maxRecords?'PENDING_EXCEEDS_RECORD_CAPACITY':
   !canReserve?'PENDING_EXCEEDS_EVENT_CAPACITY':null,
  evidenceStatus:'FILESYSTEM_JOURNAL_UNVERIFIED',
  mutatesStorage:false,liveStartupEnabled:false,automaticRolloverEnabled:false});
}
module.exports={assessArchivedPendingCapacity};
