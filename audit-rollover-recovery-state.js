'use strict';
// Read-only crash-state classifier. Never truncates or rotates a journal.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {readSegment}=require('./audit-archive-manifest');
const {verifyChain}=require('./audit-journal');
function classifyShadowRolloverState({journalPath,archivePath,limit=650}){
 if(!path.isAbsolute(journalPath||'')||!path.isAbsolute(archivePath||''))
  throw Error('Absolute journal and archive paths required');
 const archive=readSegment(archivePath,{limit});
 const st=fs.lstatSync(journalPath);
 if(!st.isFile()||st.isSymbolicLink()||st.size>12*1024*1024)
  throw Error('Unsafe active journal');
 if(fs.realpathSync(journalPath)===fs.realpathSync(archivePath))
  throw Error('Archive aliases active journal');
 const bytes=fs.readFileSync(journalPath);
 if(bytes.length&&bytes[bytes.length-1]!==10)throw Error('Incomplete active journal');
 const events=bytes.length?bytes.toString('utf8').trimEnd().split('\n').map(JSON.parse):[];
 const tip=verifyChain(events,{limit});
 const sha256=createHash('sha256').update(bytes).digest('hex');
 if(sha256===archive.sha256&&tip===archive.chainTip&&events.length===archive.events.length)
  return Object.freeze({state:'PREPARED_ACTIVE_UNCHANGED',archiveEvents:archive.events.length,
   activeEvents:events.length,automaticRolloverEnabled:false,mutatesStorage:false});
 if(events.length===0)
  return Object.freeze({state:'EMPTY_ACTIVE_REQUIRES_MANIFEST_AND_REPLAY',archiveEvents:archive.events.length,
   activeEvents:0,automaticRolloverEnabled:false,mutatesStorage:false});
 throw Error('Divergent active journal and archive; manual recovery required');
}
module.exports={classifyShadowRolloverState};
