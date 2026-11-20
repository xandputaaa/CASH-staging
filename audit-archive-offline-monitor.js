'use strict';
// Construct a read-only recovered shadow monitor while the cooperative writer
// lease is held. No live server startup, persistence, or automatic trading.
const fs=require('node:fs');
const {verifyChain}=require('./audit-journal');
const {withLeasedArchiveRecovery}=require('./audit-archive-leased-recovery');
const {createShadowMonitor}=require('./shadow-monitor');
function createOfflineRecoveredMonitor(options){
 if(!options||typeof options!=='object')throw Error('Offline recovery options required');
 const {quotes,results,clock,spot,minimumLeadMs,maxRecords=300,maxEvents=650}=options;
 return withLeasedArchiveRecovery({...options,maxRecords,maxEvents},({plan})=>{
  const bytes=fs.readFileSync(options.activeJournalPath);
  if(bytes.length&&bytes[bytes.length-1]!==10)throw Error('Incomplete active journal');
  const events=bytes.length?bytes.toString('utf8').trimEnd().split('\n').map(JSON.parse):[];
  verifyChain(events,{limit:options.limit===undefined?650:options.limit});
  const monitor=createShadowMonitor({quotes:quotes||{},results:results||{},clock,spot,
   minimumLeadMs,maxRecords,maxEvents,archivedPendingState:plan,
   journal:{events}});
  return Object.freeze({snapshot:monitor.snapshot(),
   evidenceStatus:'FILESYSTEM_JOURNAL_UNVERIFIED',
   liveStartupEnabled:false,automaticRolloverEnabled:false,
   mutatesStorage:false});
 });
}
module.exports={createOfflineRecoveredMonitor};
