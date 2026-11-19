'use strict';
// Read-only capacity assessment. Does not rotate, truncate or modify journals.
const {verifyChain}=require('./audit-journal');
function assessRolloverReadiness(events,{maxEvents=650,maxRecords=300}={}){
 if(!Array.isArray(events))throw Error('Journal events required');
 if(!Number.isSafeInteger(maxEvents)||maxEvents<1||!Number.isSafeInteger(maxRecords)||maxRecords<1)
  throw Error('Invalid capacity');
 const tip=verifyChain(events,{limit:maxEvents});
 const pending=new Map(),resolved=new Set();
 for(const e of events){
  const id=e.payload?.id;
  if(typeof id!=='string'||!id)throw Error('Event missing record identity');
  if(e.type==='CAPTURE'){
   if(pending.has(id)||resolved.has(id))throw Error('Duplicate capture identity');
   pending.set(id,e);
  }else{
   if(!pending.has(id))throw Error('Resolution without pending capture');
   pending.delete(id);resolved.add(id);
  }
 }
 const records=pending.size+resolved.size;
 if(records>maxRecords)throw Error('Record capacity exceeded');
 const remainingEvents=maxEvents-events.length;
 const safeNewCaptures=Math.max(0,Math.min(maxRecords-records,
  Math.floor(Math.max(0,remainingEvents-pending.size)/2)));
 return Object.freeze({
  status:safeNewCaptures===0?'CAPTURE_BLOCKED':safeNewCaptures<=Math.max(2,Math.floor(maxRecords*0.15))?'NEAR_LIMIT':'AVAILABLE',
  eventCount:events.length,recordCount:records,pendingCount:pending.size,
  remainingEvents,safeNewCaptures,chainTip:tip,
  canRotateAutomatically:false,mutatesStorage:false,
  nextAction:'EXPORT_AND_VERIFY_IMMUTABLE_ARCHIVE_BEFORE_SEGMENT_ROLLOVER',
  evidenceStatus:'FILESYSTEM_JOURNAL_UNVERIFIED'
 });
}
module.exports={assessRolloverReadiness};
