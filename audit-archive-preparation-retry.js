'use strict';
// Inspect an interrupted archive preparation without rewriting the immutable export.
// A valid export does not grant permission to rotate or truncate the active journal.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {readSegment}=require('./audit-archive-manifest');
const {verifyChain}=require('./audit-journal');
function inspectPreparedShadowArchive({journalPath,archivePath,limit=650}){
 if(!path.isAbsolute(journalPath||'')||!path.isAbsolute(archivePath||''))
  throw Error('Absolute paths required');
 const source=fs.lstatSync(journalPath);
 if(!source.isFile()||source.isSymbolicLink()||source.size>12*1024*1024)
  throw Error('Unsafe active journal');
 if(fs.realpathSync(journalPath)===fs.realpathSync(archivePath))
  throw Error('Archive aliases source');
 const archive=readSegment(archivePath,{limit});
 const raw=fs.readFileSync(journalPath);
 if(!raw.length||raw[raw.length-1]!==10)throw Error('Incomplete or empty active journal');
 const events=raw.toString('utf8').trimEnd().split('\n').map(JSON.parse);
 const tip=verifyChain(events,{limit});
 const digest=createHash('sha256').update(raw).digest('hex');
 if(digest!==archive.sha256||tip!==archive.chainTip||events.length!==archive.events.length)
  throw Error('Prepared archive does not match current source; no cutover');
 return Object.freeze({state:'VERIFIED_PREPARED_ARCHIVE_REUSABLE',sha256:digest,
  chainTip:tip,eventCount:events.length,archivePath,
  activeJournalRotated:false,automaticRolloverEnabled:false,mutatesStorage:false});
}
module.exports={inspectPreparedShadowArchive};
