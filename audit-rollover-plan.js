'use strict';
// Fail-closed, read-only planning for a future transactional archive rollover.
// Never moves, truncates, creates, or deletes production files.
const fs=require('node:fs'),path=require('node:path');
const {verifyChain}=require('./audit-journal');
const {assessRolloverReadiness}=require('./audit-rollover-preflight');
function planShadowRollover({journalPath,archiveDirectory,maxEvents=650,maxRecords=300}){
 if(!path.isAbsolute(journalPath||'')||!path.isAbsolute(archiveDirectory||''))
  throw Error('Absolute journal and archive paths required');
 const journalStat=fs.lstatSync(journalPath),archiveStat=fs.lstatSync(archiveDirectory);
 if(!journalStat.isFile()||journalStat.isSymbolicLink()||journalStat.size>12*1024*1024)
  throw Error('Unsafe active journal');
 if(!archiveStat.isDirectory()||archiveStat.isSymbolicLink())throw Error('Unsafe archive directory');
 const raw=fs.readFileSync(journalPath);
 if(!raw.length||raw[raw.length-1]!==10)throw Error('Incomplete or empty active journal');
 const events=raw.toString('utf8').trimEnd().split('\n').map(line=>JSON.parse(line));
 const chainTip=verifyChain(events,{limit:maxEvents});
 const readiness=assessRolloverReadiness(events,{maxEvents,maxRecords});
 const {createHash}=require('node:crypto');
 const sha256=createHash('sha256').update(raw).digest('hex');
 // Match the existing immutable exporter exactly; otherwise a planned\n // destination could differ from the archive that is actually written.\n const filename='shadow-segment-'+String(events.length).padStart(4,'0')+'-'+sha256.slice(0,16)+'.jsonl';
 const destination=path.join(archiveDirectory,filename);
 if(fs.existsSync(destination))throw Error('Archive destination already exists');
 return Object.freeze({readyForManualReview:true,sourcePath:journalPath,
  archiveFilename:filename,sourceSha256:sha256,sourceChainTip:chainTip,
  sourceEventCount:events.length,capacity:readiness,mutatesStorage:false,
  automaticRolloverEnabled:false,evidenceStatus:'FILESYSTEM_JOURNAL_UNVERIFIED'});
}
module.exports={planShadowRollover};
