'use strict';
// Offline archive recovery under the cooperating journal writer lease.
// The lease must remain held through any future live monitor initialization;
// this helper deliberately does not enable live startup or append.
const {withExclusiveJournalLease}=require('./audit-journal-writer-lease');
const {planArchivedPendingHydration}=require('./audit-archive-pending-hydration-plan');
const {assessArchivedPendingCapacity}=require('./audit-archive-pending-capacity');
function withLeasedArchiveRecovery(options,operation){
 if(!options||typeof options!=='object')throw Error('Archive recovery options required');
 if(typeof operation!=='function')throw Error('Synchronous recovery consumer required');
 return withExclusiveJournalLease({directory:options.directory},()=>{
  const plan=planArchivedPendingHydration(options);
  const capacity=assessArchivedPendingCapacity(options);
  if(capacity.state!=='ARCHIVED_PENDING_CAPACITY_RESERVED')
   throw Error('Archive recovery capacity blocked: '+capacity.reason);
  const result=operation(Object.freeze({plan,capacity,
   evidenceStatus:'FILESYSTEM_JOURNAL_UNVERIFIED',
   liveStartupEnabled:false,automaticRolloverEnabled:false}));
  if(result&&typeof result.then==='function')
   throw Error('Async archive recovery consumer unsupported');
  return result;
 });
}
module.exports={withLeasedArchiveRecovery};
