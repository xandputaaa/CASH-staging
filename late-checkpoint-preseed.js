'use strict';
/*
 * OPTIONAL OFFLINE one-time late-session preseed tool for a FUTURE
 * separately approved, already-mounted volume. This does not deploy,
 * reconfigure or restart the active Railway service.
 *
 * Git public archive is used only as an integrity cross-check of
 * SELF-REPORTED source events. No external time or exchange attest.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {verifyLateCheckpointChain}=require('./late-checkpoint-store');
const {assessRolloverPreflight}=require('./research-rollover-preflight');
const NAME='late-checkpoint-events.jsonl';
const MAX_BYTES=24*1024*1024;
const APPROVAL='EXPLICIT_OPERATOR_APPROVAL_FOR_OFFLINE_PRESEED';
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const denied=/^(?:.*(?:authorization|password|api.?key|access.?token|secret|credential|private.?key|account.?id|balance|positions?).*)$/i;
function inspectSensitiveKeys(value,depth=0){
 if(depth>12)throw Error('Excessive nesting in late source export');
 if(Array.isArray(value)){
  if(value.length>2000)throw Error('Oversized late payload array');
  for(const x of value)inspectSensitiveKeys(x,depth+1);
 }else if(value!==null&&typeof value==='object'){
  for(const [key,x] of Object.entries(value)){
   if(denied.test(key))throw Error('Sensitive field in late source export');
   inspectSensitiveKeys(x,depth+1);
  }
 }else if(typeof value==='string'&&
   (value.length>5000||/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value)))
  throw Error('Unsafe late source export value');
}
function analyzeLatePreseed({late,archiveRoot}){
 const info={
  version:'CASH_OFFLINE_LATE_PRESEED_PREFLIGHT_V1',
  status:'LATE_EXPORT_INVALID',
  sourceForecasts:0,sourceOutcomes:0,sourcePending:0,
  sourceHeadHash:null,archiveForecastsMatched:0,
  archiveOutcomesMatched:0,
  exportHashChainVerified:false,archivePublicCoverageVerified:false,
  preseedCandidate:false,
  safeToRestartRunningRailway:false,
  existingVolatileProcessMigrated:false,
  qualifiedIndependentCount:0,actualFillsVerified:0,ordersEnabled:false,
  caution:'This can seed a future offline mounted directory from a full self-reported source export only when every current public-proxy forecast and outcome has an exact matching Git archive commitment. It cannot capture unobserved final source updates, live RAM, pending feed state, missed contracts, externally attest freeze time or authorize a Railway restart.'
 };
 if(!late||late.version!=='CASH_LATE_CHECKPOINT_SHADOW_V1'||
   late.format!=='CASH_LATE_CHECKPOINT_UNVERIFIED_HASH_CHAIN_V1'||
   late.independentQualification!==0||
   late.independentlyTimeAttested!==false||
   late.calibrated!==false||
   late.realMoneyAuthorized!==false||late.canExecuteOrders!==false||
   !['VOLATILE_SERVER_SESSION','FILESYSTEM_JOURNAL_UNVERIFIED'].includes(late.storage)||
   !Array.isArray(late.events))
  throw Error('Late source export lacks safe research-only identity');
 const raw=Buffer.from(JSON.stringify(late));
 if(raw.length>MAX_BYTES)throw Error('Late source export oversized');
 inspectSensitiveKeys(late.events);
 const history=verifyLateCheckpointChain(late.events);
 if(late.headHash!==history.headHash||late.records!==history.forecasts||
    late.pending!==history.forecasts-history.outcomes||
    history.forecasts<1)
  throw Error('Late export source count or head hash mismatch');
 const covered=assessRolloverPreflight({late,archiveRoot});
 const actualFull=covered.archivedCurrentSessionForecasts===history.forecasts&&
    covered.archivedCurrentSessionSelfReportedOutcomes===history.outcomes&&
    covered.missingCurrentSessionForecasts.length===0&&
    covered.missingCurrentSessionSourceReportedOutcomes.length===0&&
    covered.sessionFirstEventHash===late.events[0].hash&&
    covered.status!=='NONPUBLIC_SOURCE_CANNOT_PROVE_ARCHIVE_COVERAGE';
 return {...info,
  sourceForecasts:history.forecasts,sourceOutcomes:history.outcomes,
  sourcePending:late.pending,sourceHeadHash:history.headHash,
  archiveForecastsMatched:covered.archivedCurrentSessionForecasts,
  archiveOutcomesMatched:covered.archivedCurrentSessionSelfReportedOutcomes,
  exportHashChainVerified:true,archivePublicCoverageVerified:actualFull,
  status:actualFull?'SOURCE_AND_PUBLIC_GIT_ARCHIVE_MATCH_OFFLINE_PRESEED_ONLY':
    'INCOMPLETE_GIT_ARCHIVE_COVERAGE_NO_PRESEED',
  preseedCandidate:actualFull};
}
function lstatMaybe(file){
 try{return fs.lstatSync(file)}
 catch(e){if(e.code==='ENOENT')return null;throw e}
}
function preseedOfflineLateDirectory({
 late,archiveRoot,directory,approval=null
}){
 if(approval!==APPROVAL)
  throw Error('One-time offline preseed requires separate explicit operator approval');
 const plan=analyzeLatePreseed({late,archiveRoot});
 if(!plan.preseedCandidate)throw Error('Incomplete archive source: refuse disk preseed');
 if(typeof directory!=='string'||!path.isAbsolute(directory))
  throw Error('Preseed requires an existing absolute mounted directory');
 const dir=fs.lstatSync(directory);
 if(!dir.isDirectory()||dir.isSymbolicLink())
  throw Error('Preseed target is not a valid existing directory');
 const dest=path.join(directory,NAME),
       incoming=path.join(directory,'.'+NAME+'.incoming');
 // No writes or renames over existing data, even an empty file or
 // dangling symlink. A leftover incoming file requires manual review.
 if(lstatMaybe(dest)||lstatMaybe(incoming))
  throw Error('Journal or previous preseed staging exists: never overwrite');
 const data=Buffer.from(late.events.map(e=>JSON.stringify(e)).join('\n')+'\n');
 if(data.length>MAX_BYTES)throw Error('Preseed journal exceeds storage limit');
 const fd=fs.openSync(incoming,'wx',0o600);
 try{
  let offset=0;
  while(offset<data.length){
   const wrote=fs.writeSync(fd,data,offset,data.length-offset);
   if(wrote<=0)throw Error('Preseed disk write incomplete');
   offset+=wrote;
  }
  fs.fsyncSync(fd);
 }finally{fs.closeSync(fd)}
 // Hard-link publication is no-clobber even if another actor creates the
 // target after our initial check. Do not silently remove partial staging
 // artifacts after failure; operator must review them.
 fs.linkSync(incoming,dest);
 fs.unlinkSync(incoming);
 const dirFd=fs.openSync(directory,'r');
 try{fs.fsyncSync(dirFd)}finally{fs.closeSync(dirFd)}
 return {
  ...plan,
  version:'CASH_OFFLINE_LATE_PRESEED_COMMITTED_V1',
  status:'OFFLINE_DISK_PRESEED_COMPLETE_NOT_RAILWAY_ACTIVATION',
  journalSha256:digest(data),
  journalEventCount:late.events.length,
  journalFileMode:fs.statSync(dest).mode&0o777,
  safeToRestartRunningRailway:false,
  existingVolatileProcessMigrated:false
 };
}
function readJson(file){
 const buf=fs.readFileSync(file);
 if(buf.length>MAX_BYTES)throw Error('Late source file too large');
 return JSON.parse(buf.toString('utf8'));
}
if(require.main===module){
 const [mode,source,archiveRoot,directory]=process.argv.slice(2);
 if(!['--dry-run','--explicit-offline-preseed'].includes(mode)||
    !source||!archiveRoot)
  throw Error('Usage: node late-checkpoint-preseed.js --dry-run LATE_EXPORT_JSON PUBLIC_ARCHIVE_ROOT | --explicit-offline-preseed LATE_EXPORT_JSON PUBLIC_ARCHIVE_ROOT EXISTING_MOUNT_DIR');
 const late=readJson(source);
 const result=mode==='--dry-run'?
  analyzeLatePreseed({late,archiveRoot}):
  preseedOfflineLateDirectory({late,archiveRoot,directory,
   approval:process.env.CASH_ONE_TIME_OFFLINE_PRESEED_APPROVAL});
 console.log('CASH_PRESEED_STATUS='+result.status);
 console.log('CASH_PRESEED_SOURCE_FORECASTS='+result.sourceForecasts);
 console.log('CASH_PRESEED_SOURCE_OUTCOMES='+result.sourceOutcomes);
 console.log('CASH_PRESEED_GIT_ARCHIVE_COVERAGE='+result.archivePublicCoverageVerified);
 console.log('CASH_PRESEED_RAILWAY_RESTART_AUTHORIZED=false');
 console.log('CASH_PRESEED_ORDERS_ENABLED=false');
 console.log('CASH_PRESEED_INDEPENDENT_QUALIFIED=0');
}
module.exports={analyzeLatePreseed,preseedOfflineLateDirectory,APPROVAL};
