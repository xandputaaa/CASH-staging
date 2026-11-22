'use strict';
/*
 * CASH EARLY V3 — OFFLINE manual, non-destructive completed journal handoff.
 * No running-server call site. Never rotate a partial journal, a pending
 * settlement, a redacted BRTI export, or history without a matching local
 * self-reported GitHub research archive COPY. An archive copy alone is not
 * independent pre-expiry evidence or permission to deploy/restart.
 */
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {createProspectiveMonitor}=require('./prospective-monitor');
const {scanArchive,validateEntry}=require('./public-session-archive');
const ACTIVE='prospective-kalshi-events.jsonl';
const SEGMENT_DIR='prospective-kalshi-completed';
const LOCK='.prospective-kalshi-events.write.lock';
const MAX_RECORDS=320,MAX_EVENTS=640,MAX_BYTES=20*1024*1024,MAX_SEGMENTS=32;
const APPROVAL='EXPLICIT_APPROVAL_FOR_QUIESCED_OFFLINE_EARLY_ROTATION';
const SHA=/^[0-9a-f]{64}$/;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const market=/^KXBTC15M-[A-Za-z0-9-]{6,70}$/;
function maybeLstat(file){
 try{return fs.lstatSync(file)}
 catch(e){if(e.code==='ENOENT')return null;throw e}
}
function safeDirectory(directory){
 if(typeof directory!=='string'||!path.isAbsolute(directory))
  throw Error('Existing absolute audit directory required');
 const stat=fs.lstatSync(directory);
 if(!stat.isDirectory()||stat.isSymbolicLink())
  throw Error('Audit directory must be a real directory');
 return path.resolve(directory);
}
function readJournal(file){
 const stat=maybeLstat(file);
 if(!stat)return null;
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>MAX_BYTES)
  throw Error('Unsafe or empty early journal file');
 const bytes=fs.readFileSync(file);
 if(bytes.length!==stat.size||bytes.at(-1)!==10)
  throw Error('Truncated or modified early journal file');
 let events;
 try{events=bytes.toString('utf8').trimEnd().split('\n').map(s=>JSON.parse(s))}
 catch{throw Error('Malformed early JSONL journal')}
 if(events.length>MAX_EVENTS)throw Error('Early journal event limit exceeded');
 return {bytes,events,sha256:digest(bytes)};
}
function verifyCompleteEarly(events){
 if(!Array.isArray(events)||events.length!==MAX_EVENTS)
  throw Error('Early journal must contain exactly 640 saved events');
 // The live monitor's replay checks event hashes, forecast model, sample
 // commitments, unique contract IDs and validated public settlement evidence.
 const source={mode:'FILESYSTEM_JOURNAL_UNVERIFIED',events,append(){}};
 const replay=createProspectiveMonitor({
  quotes:{},spot:{},results:{},store:source,maxRecords:MAX_RECORDS});
 const state=replay.snapshot();
 if(state.records!==MAX_RECORDS||state.pending!==0||
    state.voids+state.officiallyScored+state.waits!==MAX_RECORDS||
    events.filter(x=>x.type==='OUTCOME').length!==MAX_RECORDS||
    replay.exportSession().format!=='CASH_PROSPECTIVE_HASHED_SESSION_V1')
  throw Error('Early journal incomplete or not public proxy research');
 return {state,headHash:state.headHash,markets:events
  .filter(x=>x.type==='FORECAST').map(x=>x.payload.marketId)};
}
function inspectCompletedEarlySegments(directory){
 const root=safeDirectory(directory),folder=path.join(root,SEGMENT_DIR);
 const stat=maybeLstat(folder);
 const inventory={version:'CASH_EARLY_COMPLETED_SEGMENT_INVENTORY_V1',
  completedSegments:0,previouslyFrozenMarkets:0,priorMarketIds:[],
  segmentHashes:[],independentlyQualifiedCount:0,ordersEnabled:false};
 if(!stat)return inventory;
 if(!stat.isDirectory()||stat.isSymbolicLink())
  throw Error('Unsafe early completed segment directory');
 const names=fs.readdirSync(folder).sort();
 if(names.length>MAX_SEGMENTS)throw Error('Completed early segment limit exceeded');
 const seen=new Set();
 for(const name of names){
  if(!/^[a-f0-9]{64}\.jsonl$/.test(name))
   throw Error('Unexpected early completed segment filename');
  const journal=readJournal(path.join(folder,name));
  if(!journal||journal.sha256!==name.slice(0,-6))
   throw Error('Completed early segment SHA256 mismatch');
  const checked=verifyCompleteEarly(journal.events);
  for(const id of checked.markets){
   if(seen.has(id))throw Error('Repeated contract in completed early segments');
   seen.add(id);
  }
  inventory.segmentHashes.push(journal.sha256);
 }
 inventory.completedSegments=names.length;
 inventory.previouslyFrozenMarkets=seen.size;
 inventory.priorMarketIds=[...seen].sort();
 return inventory;
}
function verifyPublicArchiveCopy(early,archiveRoot){
 const root=safeDirectory(archiveRoot);
 scanArchive(root);
 const first=early.events[0]?.hash;
 if(!SHA.test(first||''))return false;
 const outcomeById=new Map(early.events.filter(x=>x.type==='OUTCOME')
  .map(x=>[x.payload.marketId,x]));
 if(outcomeById.size!==MAX_RECORDS)return false;
 for(const event of early.events){
  if(event.type!=='FORECAST')continue;
  const p=event.payload,filename=path.join(root,'public-sessions','early-v3',
   first,p.marketId+'.json');
  if(!market.test(p.marketId||''))return false;
  const stat=maybeLstat(filename);
  if(!stat||!stat.isFile()||stat.isSymbolicLink()||stat.size>14000||
     stat.size<200)return false;
  const entry=JSON.parse(fs.readFileSync(filename,'utf8'));
  validateEntry(entry,{modelFolder:'early-v3',sessionHash:first,
   marketId:p.marketId});
  const forecast=entry.prediction,outcome=entry.outcome,
   expected=outcomeById.get(p.marketId);
  if(forecast.selfHashedForecastEventSha256!==event.hash||
    forecast.selfHashedForecastSequence!==event.sequence||
    forecast.claimedFrozenAt!==p.at||
    forecast.contractClosesAt!==p.endTime||
    forecast.side!==(p.side===null?'WAIT':p.side)||
    !expected||outcome?.selfHashedOutcomeEventSha256!==expected.hash||
    outcome.selfHashedOutcomeSequence!==expected.sequence||
    outcome.internallyReportedWinner!==expected.payload.winner)return false;
 }
 return true;
}
function checkOfflineEarlyRotation({directory,early,archiveRoot}){
 const root=safeDirectory(directory),inventory=inspectCompletedEarlySegments(root);
 const report={version:'CASH_EARLY_OFFLINE_ROTATION_PREFLIGHT_V1',
  ready:false,reason:'NO_COMPLETE_DISK_JOURNAL',completedSegments:inventory.completedSegments,
  priorMarkets:inventory.previouslyFrozenMarkets,
  frozenInActive:0,settledInActive:0,remainingSlots:null,
  independentlyQualifiedCount:0,ordersEnabled:false,
  safeToRestartRailway:false,automaticRotationEnabled:false,
  caveat:'Local self-reported hash archives are not independent time evidence; a quiesced verified offline cutover requires separate operator approval and no automatic Railway restart.'};
 if(inventory.completedSegments>=MAX_SEGMENTS){
  report.reason='EARLY_COMPLETED_SEGMENT_CAP';return report
 }
 if(maybeLstat(path.join(root,LOCK))){
  report.reason='EXISTING_EARLY_WRITER_LOCK_OPERATOR_REVIEW';return report
 }
 const journal=readJournal(path.join(root,ACTIVE));
 if(!journal)return report;
 const frozen=journal.events.filter(x=>x.type==='FORECAST').length,
       outcomes=journal.events.filter(x=>x.type==='OUTCOME').length;
 report.frozenInActive=frozen;report.settledInActive=outcomes;
 report.remainingSlots=Math.max(0,MAX_RECORDS-frozen);
 if(frozen!==MAX_RECORDS||outcomes!==MAX_RECORDS){
  report.reason='ACTIVE_EARLY_JOURNAL_NOT_FULLY_SETTLED';return report
 }
 const check=verifyCompleteEarly(journal.events);
 for(const id of check.markets)
  if(inventory.priorMarketIds.includes(id))
   throw Error('Active early journal repeats completed market');
 if(inventory.segmentHashes.includes(journal.sha256))
  throw Error('Incomplete prior early hardlink handoff');
 if(!early||early.version!=='CASH_PROSPECTIVE_KALSHI_V1'||
   early.format!=='CASH_PROSPECTIVE_HASHED_SESSION_V1'||
   early.storage!=='FILESYSTEM_JOURNAL_UNVERIFIED'||
   early.qualifiedCount!==0||early.tradingAuthorized!==false||
   early.automatedOrdersEnabled!==false||
   !Array.isArray(early.events)){
  report.reason='COMPLETE_UNREDACTED_SOURCE_EXPORT_REQUIRED';return report
 }
 if(early.events.length!==journal.events.length||
   early.records!==MAX_RECORDS||early.pending!==0||
   early.headHash!==check.headHash||
   JSON.stringify(early.events)!==JSON.stringify(journal.events))
  throw Error('Early export and disk journal differ; never rotate stale source');
 if(!archiveRoot||!verifyPublicArchiveCopy(early,archiveRoot)){
  report.reason='FULL_LOCAL_PUBLIC_ARCHIVE_COPY_REQUIRED';return report
 }
 report.ready=true;report.reason='FULLY_SETTLED_EARLY_DISK_AND_ARCHIVE_MATCH';
 report.activeJournalSha256=journal.sha256;
 report.originalEventCount=journal.events.length;
 return report;
}
function rotateCompletedEarlyJournal({directory,early,archiveRoot,approval}){
 if(approval!==APPROVAL)
  throw Error('Separate explicit approval for quiesced offline early rollover required');
 const root=safeDirectory(directory),
  plan=checkOfflineEarlyRotation({directory:root,early,archiveRoot});
 if(!plan.ready)throw Error('Early rotation blocked: '+plan.reason);
 const lock=path.join(root,LOCK),live=path.join(root,ACTIVE);
 const lockFd=fs.openSync(lock,fs.constants.O_WRONLY|fs.constants.O_CREAT|
   fs.constants.O_EXCL|(fs.constants.O_NOFOLLOW||0),0o600);
 let finished=false,destination=null;
 try{
  const data=readJournal(live);
  if(!data||data.sha256!==plan.activeJournalSha256)
   throw Error('Early active journal changed after preflight');
  verifyCompleteEarly(data.events);
  const fresh=inspectCompletedEarlySegments(root);
  if(fresh.completedSegments!==plan.completedSegments)
   throw Error('Early completed inventory changed after preflight');
  const folder=path.join(root,SEGMENT_DIR);
  if(!maybeLstat(folder))fs.mkdirSync(folder,{mode:0o700});
  const st=fs.lstatSync(folder);
  if(!st.isDirectory()||st.isSymbolicLink())
   throw Error('Early completed directory replaced');
  destination=path.join(folder,data.sha256+'.jsonl');
  if(maybeLstat(destination))
   throw Error('Completed early journal exists; operator review required');
  // Publish ORIGINAL inode first; no truncate or copy-overwrite of history.
  fs.linkSync(live,destination);
  const folderFd=fs.openSync(folder,'r');
  try{fs.fsyncSync(folderFd)}finally{fs.closeSync(folderFd)}
  fs.unlinkSync(live);
  const rootFd=fs.openSync(root,'r');
  try{fs.fsyncSync(rootFd)}finally{fs.closeSync(rootFd)}
  finished=true;
 }finally{
  fs.closeSync(lockFd);
  fs.unlinkSync(lock);
 }
 if(!finished)throw Error('Partial early rotation requires manual review');
 return {...plan,version:'CASH_EARLY_OFFLINE_COMPLETED_SEGMENT_V1',
  reason:'EARLY_COMPLETED_SEGMENT_SAVED_NO_AUTOMATIC_RESTART',
  completedSegments:plan.completedSegments+1,
  completedSegmentSha256:plan.activeJournalSha256,
  completedSegmentPath:destination,
  safeToRestartRailway:false,automatedOrdersEnabled:false,
  independentlyQualifiedCount:0};
}
if(require.main===module){
 const [mode,sourcePath,archiveRoot,directory]=process.argv.slice(2);
 if(!['--dry-run','--explicit-offline-rotation'].includes(mode)||
    !sourcePath||!archiveRoot||!directory)
  throw Error('Usage: node prospective-offline-rotation.js --dry-run EARLY_EXPORT_JSON PUBLIC_ARCHIVE_ROOT EXISTING_AUDIT_DIR | --explicit-offline-rotation EARLY_EXPORT_JSON PUBLIC_ARCHIVE_ROOT EXISTING_AUDIT_DIR');
 const stat=fs.lstatSync(sourcePath);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_BYTES)
  throw Error('Unsafe early export file');
 const early=JSON.parse(fs.readFileSync(sourcePath,'utf8'));
 const result=mode==='--dry-run'?
  checkOfflineEarlyRotation({directory,early,archiveRoot}):
  rotateCompletedEarlyJournal({directory,early,archiveRoot,
   approval:process.env.CASH_ONE_TIME_OFFLINE_EARLY_ROTATION_APPROVAL});
 console.log('CASH_EARLY_ROTATION_STATUS='+result.reason);
 console.log('CASH_EARLY_ROTATION_READY='+result.ready);
 console.log('CASH_EARLY_ROTATION_FROZEN='+result.frozenInActive);
 console.log('CASH_EARLY_ROTATION_SETTLED='+result.settledInActive);
 console.log('CASH_EARLY_ROTATION_INDEPENDENT_QUALIFIED=0');
 console.log('CASH_EARLY_ROTATION_RESTART_AUTHORIZED=false');
 console.log('CASH_EARLY_ROTATION_ORDERS_ENABLED=false');
}
module.exports={inspectCompletedEarlySegments,verifyCompleteEarly,
 checkOfflineEarlyRotation,rotateCompletedEarlyJournal,APPROVAL,
 SEGMENT_DIR,MAX_SEGMENTS};
