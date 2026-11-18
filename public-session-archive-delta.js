'use strict';
/*
 * CASH self-reported public session archive: independent pre-commit delta
 * guard. Compares the ORIGINAL Git branch checkout against the newly
 * generated, still uncommitted worktree. All prior forecasts and initial
 * GH backup metadata are immutable; only first outcome addition is allowed.
 *
 * This does NOT prove independent forecast accuracy or certify a fill.
 */
const fs=require('node:fs'),path=require('node:path');
const {scanArchive}=require('./public-session-archive');
const RUN=/^\d{8,16}$/;
const SAME=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function fileMap(root){
 const base=path.resolve(root),folder=path.join(base,'public-sessions'),files=new Map();
 // The strict shared scanner rejects private fields, unknown schemas,
 // unsafe filenames, symlinks, unexpected nesting and oversized files.
 scanArchive(base);
 if(!fs.existsSync(folder))return files;
 function walk(dir,parts){
  for(const name of fs.readdirSync(dir).sort()){
   const full=path.join(dir,name);
   if(fs.statSync(full).isDirectory())walk(full,[...parts,name]);
   else files.set([...parts,name].join('/'),
     JSON.parse(fs.readFileSync(full,'utf8')));
  }
 }
 walk(folder,[]);
 return files;
}
function auditSessionArchiveDelta({beforeRoot,afterRoot,sourceRunId}){
 if(!RUN.test(String(sourceRunId||'')))throw Error('Invalid scheduled source run ID');
 const current=String(sourceRunId);
 const before=fileMap(beforeRoot),after=fileMap(afterRoot);
 const summary={
  version:'CASH_PUBLIC_SESSION_ARCHIVE_MONOTONIC_DELTA_V1',
  scheduledSourceRunId:current,
  priorForecastFiles:before.size,resultForecastFiles:after.size,
  newForecastFiles:0,unchangedRecordFiles:0,
  newlyAppendedSelfReportedOutcomeFiles:0,
  deletedOrAlteredForecastFiles:0,
  independentlyQualifiedCount:0,ordersEnabled:false,actualFillsVerified:0,
  caveat:'This compares two local Git checkout snapshots before a push. An immutable forecast relative to Git history is not a pre-expiry third-party witness, exchange confirmation, a probability calibration, or a filled trade.'
 };
 for(const [name,old] of before){
  const next=after.get(name);
  if(!next)throw Error('Archived forecast deleted: '+name);
  if(!SAME(old.prediction,next.prediction)||
     !SAME(old.firstReadOnlyBackup,next.firstReadOnlyBackup)||
     old.version!==next.version||
     old.provenanceClass!==next.provenanceClass||
     old.limitations!==next.limitations)
   throw Error('Immutable public forecast or first-backup metadata rewritten: '+name);
  if(old.outcome!==null){
   if(!SAME(old.outcome,next.outcome))
    throw Error('Previously archived source outcome rewritten: '+name);
   summary.unchangedRecordFiles++;
   continue;
  }
  if(next.outcome===null){
   summary.unchangedRecordFiles++;
   continue;
  }
  if(next.outcome.firstSeenBackupRunId!==current||
     BigInt(current)<BigInt(old.firstReadOnlyBackup.runId))
   throw Error('Self-reported outcome append not from this scheduled run: '+name);
  summary.newlyAppendedSelfReportedOutcomeFiles++;
 }
 for(const [name,entry] of after){
  if(before.has(name))continue;
  if(entry.firstReadOnlyBackup.runId!==current)
   throw Error('New forecast falsely attributed to an earlier GH scheduled run: '+name);
  if(entry.outcome!==null&&entry.outcome.firstSeenBackupRunId!==current)
   throw Error('New forecast carries an outcome from a different run: '+name);
  summary.newForecastFiles++;
 }
 if(summary.newForecastFiles+summary.unchangedRecordFiles+
    summary.newlyAppendedSelfReportedOutcomeFiles!==after.size)
  throw Error('Public archive delta inventory inconsistent');
 return summary;
}
if(require.main===module){
 const [beforeRoot,afterRoot,sourceRunId]=process.argv.slice(2);
 if(!beforeRoot||!afterRoot||!sourceRunId)
  throw Error('Usage: node public-session-archive-delta.js BASE_ARCHIVE UPDATED_ARCHIVE SCHEDULED_RUN_ID');
 const r=auditSessionArchiveDelta({beforeRoot,afterRoot,sourceRunId});
 console.log('CASH_SESSION_DELTA_NEW_FORECASTS='+r.newForecastFiles);
 console.log('CASH_SESSION_DELTA_APPENDED_OUTCOMES='+r.newlyAppendedSelfReportedOutcomeFiles);
 console.log('CASH_SESSION_DELTA_UNCHANGED='+r.unchangedRecordFiles);
 console.log('CASH_SESSION_DELTA_DELETED_OR_ALTERED=0');
 console.log('CASH_SESSION_DELTA_INDEPENDENT_QUALIFIED=0');
 console.log('CASH_SESSION_DELTA_ORDERS_ENABLED=false');
 console.log(JSON.stringify(r,null,2));
}
module.exports={auditSessionArchiveDelta};
