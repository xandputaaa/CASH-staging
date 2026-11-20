'use strict';
// Offline archive recovery under the cooperating journal writer lease.
// The lease must remain held through any future live monitor initialization;
// this helper deliberately does not enable live startup or append.
const {withExclusiveJournalLease}=require('./audit-journal-writer-lease');
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
function digestActive(file){
 if(!path.isAbsolute(file||''))throw Error('Absolute active journal required');
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>12*1024*1024)
  throw Error('Unsafe active journal during leased recovery');
 const bytes=fs.readFileSync(file);
 if(bytes.length!==stat.size)throw Error('Active journal changed during leased recovery');
 return createHash('sha256').update(bytes).digest('hex');
}
function archiveDigests(options){
 const {verifyArchiveManifest}=require('./audit-archive-manifest');
 const verified=verifyArchiveManifest(options.manifest,{directory:options.directory,limit:options.limit===undefined?650:options.limit});
 return verified.segments.map(segment=>{
  const file=path.join(options.directory,segment.filename);
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink())throw Error('Unsafe archive segment during leased recovery');
  const bytes=fs.readFileSync(file);
  if(bytes.length!==stat.size)throw Error('Archive segment changed during leased recovery');
  return createHash('sha256').update(bytes).digest('hex');
 }).join(':');
}
const {planArchivedPendingHydration}=require('./audit-archive-pending-hydration-plan');
const {assessArchivedPendingCapacity}=require('./audit-archive-pending-capacity');
function withLeasedArchiveRecovery(options,operation){
 if(!options||typeof options!=='object')throw Error('Archive recovery options required');
 if(typeof operation!=='function')throw Error('Synchronous recovery consumer required');
 // A lock only protects the directory where cooperating writers append.
 // Never claim protection while reading a different active journal.
 if(!path.isAbsolute(options.directory||'')||
    !path.isAbsolute(options.activeJournalPath||'')||
    path.resolve(options.activeJournalPath)!==path.join(path.resolve(options.directory),'shadow-events.jsonl'))
  throw Error('Leased recovery active journal must belong to locked directory');
 return withExclusiveJournalLease({directory:options.directory},()=>{
  const initialDigest=digestActive(options.activeJournalPath);
  const initialArchiveDigests=archiveDigests(options);
  const plan=planArchivedPendingHydration(options);
  const capacity=assessArchivedPendingCapacity(options);
  if(capacity.state!=='ARCHIVED_PENDING_CAPACITY_RESERVED')
   throw Error('Archive recovery capacity blocked: '+capacity.reason);
  if(digestActive(options.activeJournalPath)!==initialDigest)
   throw Error('Active journal changed during leased recovery');
  if(archiveDigests(options)!==initialArchiveDigests)
   throw Error('Archive segments changed during leased recovery');
  const result=operation(Object.freeze({plan,capacity,
   evidenceStatus:'FILESYSTEM_JOURNAL_UNVERIFIED',
   liveStartupEnabled:false,automaticRolloverEnabled:false}));
  if(result&&typeof result.then==='function')
   throw Error('Async archive recovery consumer unsupported');
  if(digestActive(options.activeJournalPath)!==initialDigest)
   throw Error('Active journal changed during leased recovery');
  if(archiveDigests(options)!==initialArchiveDigests)
   throw Error('Archive segments changed during leased recovery');
  return result;
 });
}
module.exports={withLeasedArchiveRecovery};
