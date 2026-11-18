'use strict';
/*
 * CASH optional OFFLINE completed-session rotation. Never called by the
 * running server. Requires an approved, quiesced, persistent audit directory,
 * all 160 source forecasts settled, and a complete matching LOCAL public
 * Git-archive COPY. Nothing here verifies that archive's remote provenance
 * or authorizes restarting Railway / trading.
 *
 * Each immutable completed segment is the original journal byte stream,
 * named by its SHA-256 digest. No history is deleted to free space.
 * An incomplete filesystem transition is deliberately rejected on startup.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {verifyLateCheckpointChain}=require('./late-checkpoint-store');
const {analyzeLatePreseed}=require('./late-checkpoint-preseed');
const SEGMENT_DIR='late-checkpoint-completed';
const LIVE='late-checkpoint-events.jsonl';
const LOCK='.late-checkpoint-events.write.lock';
const MAX_SEGMENTS=64,MAX_BYTES=24*1024*1024,MAX_FORECASTS=160;
const APPROVAL='EXPLICIT_APPROVAL_FOR_QUIESCED_OFFLINE_LATE_ROTATION';
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
function lstatMaybe(file){
 try{return fs.lstatSync(file)}
 catch(e){if(e.code==='ENOENT')return null;throw e}
}
function safeDir(dir){
 if(typeof dir!=='string'||!path.isAbsolute(dir))throw Error('Existing absolute audit directory required');
 const st=fs.lstatSync(dir);
 if(!st.isDirectory()||st.isSymbolicLink())throw Error('Audit directory must be a real directory');
 return path.resolve(dir);
}
function inspectCompletedLateSegments(directory){
 const root=safeDir(directory);
 const folder=path.join(root,SEGMENT_DIR);
 const st=lstatMaybe(folder);
 const result={version:'CASH_COMPLETED_LATE_JOURNAL_SEGMENT_INVENTORY_V1',
  completedSegments:0,previouslyFrozenMarkets:0,priorMarketIds:[],
  segmentHashes:[],sourceOnlyResearch:true,independentQualifiedCount:0,
  ordersEnabled:false,restartAuthorized:false};
 if(!st)return result;
 if(!st.isDirectory()||st.isSymbolicLink())
  throw Error('Unsafe completed late journal segment directory');
 const names=fs.readdirSync(folder).sort();
 if(names.length>MAX_SEGMENTS)throw Error('Completed late segment count limit reached');
 const prior=new Set();
 for(const name of names){
  if(!/^[a-f0-9]{64}\.jsonl$/.test(name))
   throw Error('Unsafe late completed segment filename');
  const file=path.join(folder,name);
  const meta=fs.lstatSync(file);
  if(!meta.isFile()||meta.isSymbolicLink()||meta.size<=0||meta.size>MAX_BYTES)
   throw Error('Unsafe completed late journal file');
  const bytes=fs.readFileSync(file);
  if(digest(bytes)!==name.slice(0,-6)||bytes.at(-1)!==10)
   throw Error('Completed late segment SHA256 or newline mismatch');
  let events;
  try{events=bytes.toString('utf8').trimEnd().split('\n').map(x=>JSON.parse(x))}
  catch{throw Error('Completed late segment JSONL corrupted')}
  const check=verifyLateCheckpointChain(events);
  if(check.forecasts!==MAX_FORECASTS||check.outcomes!==MAX_FORECASTS)
   throw Error('Completed segment not fully settled at 160 forecast limit');
  for(const key of check.records.keys()){
   if(prior.has(key))throw Error('Repeated forecast market across completed journal segments');
   prior.add(key);
  }
  result.segmentHashes.push(name.slice(0,-6));
 }
 result.completedSegments=names.length;
 result.previouslyFrozenMarkets=prior.size;
 result.priorMarketIds=[...prior].sort();
 return result;
}
function checkOfflineLateRotation({directory,late,archiveRoot}){
 const root=safeDir(directory);
 const disk=path.join(root,LIVE),st=lstatMaybe(disk);
 const report={
  version:'CASH_QUIESCED_LATE_OFFLINE_ROTATION_PREFLIGHT_V1',
  ready:false,reason:'NO_COMPLETE_DISK_JOURNAL',completeSegments:0,
  frozenInActive:0,settledInActive:0,priorMarkets:0,
  safeToRestartRunningRailway:false,ordersEnabled:false,
  independentlyQualifiedCount:0,requiresExclusiveOperatorCutover:true,
  caveat:'Only an offline, quiesced, source-hash-consistent journal; checking a local archive copy is NOT independent pre-expiry witnessing, complete feed recovery or live zero-gap migration.'
 };
 const prior=inspectCompletedLateSegments(root);
 report.completeSegments=prior.completedSegments;
 report.priorMarkets=prior.previouslyFrozenMarkets;
 if(prior.completedSegments>=MAX_SEGMENTS){
  report.reason='COMPLETED_SEGMENT_LIMIT_REACHED';return report
 }
 if(!st){return report}
 if(!st.isFile()||st.isSymbolicLink()||st.size===0||st.size>MAX_BYTES)
  throw Error('Unsafe or empty active late disk journal');
 if(lstatMaybe(path.join(root,LOCK))){
  report.reason='EXISTING_WRITER_LOCK_OPERATOR_REVIEW';return report
 }
 const bytes=fs.readFileSync(disk);
 if(bytes.at(-1)!==10)throw Error('Incomplete active late disk journal');
 let events;
 try{events=bytes.toString('utf8').trimEnd().split('\n').map(x=>JSON.parse(x))}
 catch{throw Error('Corrupt active late JSONL')}
 const valid=verifyLateCheckpointChain(events);
 report.frozenInActive=valid.forecasts;report.settledInActive=valid.outcomes;
 if(valid.forecasts!==MAX_FORECASTS||valid.outcomes!==MAX_FORECASTS){
  report.reason='ACTIVE_LATE_JOURNAL_NOT_FULLY_SETTLED';return report
 }
 for(const market of valid.records.keys())
  if(prior.priorMarketIds.includes(market))
   throw Error('Active late journal repeats a previously completed market');
 if(!late||late.storage!=='FILESYSTEM_JOURNAL_UNVERIFIED'){
  report.reason='DISK_SOURCE_EXPORT_REQUIRED';return report
 }
 const audit=analyzeLatePreseed({late,archiveRoot});
 if(!audit.preseedCandidate){
  report.reason='CURRENT_SOURCE_MISSING_COMPLETE_LOCAL_ARCHIVE_COPY';return report
 }
 if(valid.headHash!==late.headHash||
    JSON.stringify(events)!==JSON.stringify(late.events))
  throw Error('Offline active disk journal conflicts with complete source export');
 report.ready=true;
 report.reason='OFFLINE_FULLY_SETTLED_SOURCE_AND_LOCAL_ARCHIVE_MATCH';
 report.activeJournalSha256=digest(bytes);
 report.sourceEventCount=events.length;
 return report;
}
function rotateCompletedLateJournal({directory,late,archiveRoot,approval}){
 if(approval!==APPROVAL)
  throw Error('Offline rotation requires separate explicit operator approval');
 const root=safeDir(directory),plan=checkOfflineLateRotation({directory:root,late,archiveRoot});
 if(!plan.ready)throw Error('Offline rotation blocked: '+plan.reason);
 const lockfile=path.join(root,LOCK),live=path.join(root,LIVE);
 // Cooperating writers fail closed while this link/unlink transition runs.
 const lockFd=fs.openSync(lockfile,
  fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|
  (fs.constants.O_NOFOLLOW||0),0o600);
 let finished=false,linked=false,destination=null;
 try{
  // All earlier metadata can be stale: recheck under the exclusive lock.
  const st=fs.lstatSync(live);
  if(!st.isFile()||st.isSymbolicLink()||st.size<=0||st.size>MAX_BYTES)
   throw Error('Active journal replaced while preparing rotation');
  const bytes=fs.readFileSync(live);
  if(digest(bytes)!==plan.activeJournalSha256)
   throw Error('Active journal diverged between preflight and rotation');
  const checked=verifyLateCheckpointChain(
   bytes.toString('utf8').trimEnd().split('\n').map(x=>JSON.parse(x)));
  if(checked.forecasts!==MAX_FORECASTS||checked.outcomes!==MAX_FORECASTS)
   throw Error('Active journal changed or not settled');
  const inventory=inspectCompletedLateSegments(root);
  if(inventory.completedSegments!==plan.completeSegments)
   throw Error('Completed segment inventory changed before rotation');
  const folder=path.join(root,SEGMENT_DIR);
  if(!lstatMaybe(folder))fs.mkdirSync(folder,{mode:0o700});
  const meta=fs.lstatSync(folder);
  if(!meta.isDirectory()||meta.isSymbolicLink())
   throw Error('Completed directory was replaced');
  destination=path.join(folder,plan.activeJournalSha256+'.jsonl');
  if(lstatMaybe(destination))
   throw Error('Completed late journal already exists: operator review');
  // Link preserves every original event byte. Never replace a segment.
  fs.linkSync(live,destination);linked=true;
  const archiveFd=fs.openSync(folder,'r');
  try{fs.fsyncSync(archiveFd)}finally{fs.closeSync(archiveFd)}
  // The original disk copy is durable in the completed folder first.
  fs.unlinkSync(live);
  const rootFd=fs.openSync(root,'r');
  try{fs.fsyncSync(rootFd)}finally{fs.closeSync(rootFd)}
  finished=true;
 }finally{
  fs.closeSync(lockFd);
  // A partial hard-link publication leaves the full original journal
  // in BOTH places; retain it and refuse any automatic repair on startup.
  fs.unlinkSync(lockfile);
 }
 if(!finished)throw Error('Offline rotation did not complete; manual review required');
 return {...plan,version:'CASH_LATE_OFFLINE_COMPLETED_SEGMENT_V1',
  reason:'OFFLINE_COMPLETED_SEGMENT_SAVED_NEW_EMPTY_JOURNAL_NOT_STARTED',
  completedSegmentHash:plan.activeJournalSha256,
  completedSegmentPath:destination,
  completedSegments:plan.completeSegments+1,
  safeToRestartRunningRailway:false,existingVolatileProcessMigrated:false,
  ordersEnabled:false,independentlyQualifiedCount:0};
}
module.exports={inspectCompletedLateSegments,checkOfflineLateRotation,
 rotateCompletedLateJournal,APPROVAL,MAX_SEGMENTS,SEGMENT_DIR};
