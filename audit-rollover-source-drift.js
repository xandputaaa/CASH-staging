'use strict';
// Read-only optimistic concurrency gate. Recheck immediately before any
// future cutover; a matching old export is insufficient after new appends.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {verifyChain}=require('./audit-journal');
const {readSegment}=require('./audit-archive-manifest');
function assessShadowSourceDrift({journalPath,archivePath,expectedSha256,expectedChainTip,expectedEventCount,limit=650}){
 if(!path.isAbsolute(journalPath||'')||!path.isAbsolute(archivePath||''))
  throw Error('Absolute paths required');
 const source=fs.lstatSync(journalPath);
 if(!source.isFile()||source.isSymbolicLink()||source.size>12*1024*1024)
  throw Error('Unsafe active journal');
 if(fs.realpathSync(journalPath)===fs.realpathSync(archivePath))
  throw Error('Archive aliases active journal');
 const archive=readSegment(archivePath,{limit});
 const bytes=fs.readFileSync(journalPath);
 if(!bytes.length||bytes[bytes.length-1]!==10)throw Error('Incomplete active journal');
 const events=bytes.toString('utf8').trimEnd().split('\n').map(JSON.parse);
 const chainTip=verifyChain(events,{limit});
 const sha256=createHash('sha256').update(bytes).digest('hex');
 if(!/^[a-f0-9]{64}$/.test(expectedSha256||'')||!/^[a-f0-9]{64}$/.test(expectedChainTip||'')
    ||!Number.isInteger(expectedEventCount)||expectedEventCount<1)
  throw Error('Invalid prepared archive expectations');
 if(sha256!==expectedSha256||chainTip!==expectedChainTip||
    events.length!==expectedEventCount||archive.sha256!==sha256||
    archive.chainTip!==chainTip||archive.events.length!==events.length)
  throw Error('Active journal changed since archive preparation; cutover forbidden');
 return Object.freeze({status:'SOURCE_UNCHANGED_NO_CUTOVER',sha256,chainTip,eventCount:events.length,
   mutatesStorage:false,automaticRolloverEnabled:false});
}
module.exports={assessShadowSourceDrift};
