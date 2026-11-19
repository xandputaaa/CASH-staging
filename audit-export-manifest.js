'use strict';
// Pure, read-only export attestation for a COPY of the legacy shadow journal.
// Integrity and continuity metadata do not independently attest event time.
const {createHash}=require('node:crypto');
const {assessRolloverReadiness}=require('./audit-rollover-preflight');
function inspectArchiveExport(bytes,{maxEvents=650,maxRecords=300}={}){
 if(!Buffer.isBuffer(bytes))throw Error('Archive must be supplied as exact file bytes');
 if(bytes.length>12*1024*1024)throw Error('Archive exceeds legacy byte limit');
 const utf8=bytes.toString('utf8');
 if(!Buffer.from(utf8,'utf8').equals(bytes))throw Error('Archive is not valid UTF-8');
 if(utf8.length>0&&!utf8.endsWith('\n'))throw Error('Archive has incomplete trailing entry');
 const lines=utf8?utf8.slice(0,-1).split('\n'):[];
 if(lines.length>maxEvents)throw Error('Archive event capacity exceeded');
 const events=lines.map((line,i)=>{
  if(!line)throw Error('Blank archive entry at '+(i+1));
  try{return JSON.parse(line)}catch{throw Error('Invalid JSON archive entry at '+(i+1))}
 });
 const readiness=assessRolloverReadiness(events,{maxEvents,maxRecords});
 return Object.freeze({
  schema:'CASH_SHADOW_EXPORT_MANIFEST_V1',
  sha256:createHash('sha256').update(bytes).digest('hex'),
  byteLength:bytes.length,eventCount:readiness.eventCount,
  recordCount:readiness.recordCount,pendingCount:readiness.pendingCount,
  firstSequence:events.length?events[0].sequence:null,
  lastSequence:events.length?events[events.length-1].sequence:null,
  firstHash:events.length?events[0].hash:null,
  chainTip:readiness.chainTip,
  safeNewCaptures:readiness.safeNewCaptures,
  capacityStatus:readiness.status,
  evidenceStatus:'FILESYSTEM_JOURNAL_UNVERIFIED',
  independentTimestampAttestation:false,
  storageMutation:false,
  safeToAutoRotate:false
 });
}
module.exports={inspectArchiveExport};
