'use strict';
/*
 * Optional CASH shadow journal. A configured path must already be mounted.
 * Never silently fall back to ephemeral memory when the journal is enabled.
 * This is local filesystem durability, NOT independently time-attested
 * evidence or qualified AI prediction validation.
 */
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const FILE='shadow-events.jsonl';
const MAX_FILE_BYTES=12*1024*1024,MAX_EVENTS=650;
function hashEvent(event){
  const {hash,...body}=event;
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}
function verifyChain(events,{limit=MAX_EVENTS}={}){
  if(!Array.isArray(events)||events.length>limit)throw Error('Audit event capacity exceeded');
  let previous='GENESIS';
  for(let i=0;i<events.length;i++){
    const e=events[i];
    if(!e||e.sequence!==i+1||!['CAPTURE','RESOLUTION'].includes(e.type)
      ||typeof e.recordedAt!=='string'||!Number.isFinite(Date.parse(e.recordedAt))
      ||!e.payload||typeof e.payload!=='object'||Array.isArray(e.payload)
      ||e.previousHash!==previous||typeof e.hash!=='string'
      ||!/^[0-9a-f]{64}$/.test(e.hash)||hashEvent(e)!==e.hash)
      throw Error('Audit event chain verification failed at '+(i+1));
    previous=e.hash;
  }
  return previous;
}
function createAuditJournal({directory=process.env.CASH_AUDIT_DIR,limit=MAX_EVENTS}={}){
  if(!directory){
    return {mode:'VOLATILE_SERVER_SESSION',configured:false,events:[],append(){},path:null};
  }
  if(typeof directory!=='string'||!path.isAbsolute(directory))
    throw Error('CASH_AUDIT_DIR must be an absolute pre-mounted directory');
  const directoryStat=fs.statSync(directory);
  if(!directoryStat.isDirectory())throw Error('CASH_AUDIT_DIR is not a directory');
  const filename=path.join(directory,FILE);
  if(fs.existsSync(filename)&&!fs.statSync(filename).isFile())throw Error('Audit journal is not a regular file');
  const content=fs.existsSync(filename)?fs.readFileSync(filename,'utf8'):'';
  if(Buffer.byteLength(content,'utf8')>MAX_FILE_BYTES)throw Error('Audit journal exceeds safety limit');
  if(content&&!content.endsWith('\n'))throw Error('Audit journal has an incomplete trailing entry');
  const events=content?content.trimEnd().split('\n').map(line=>{
    try{return JSON.parse(line)}catch{throw Error('Audit journal has invalid JSON')}
  }):[];
  verifyChain(events,{limit});
  function append(event){
    if(events.length>=limit)throw Error('Audit journal is full; export and archive before continuing');
    const previous=events.length?events[events.length-1].hash:'GENESIS';
    if(event.sequence!==events.length+1||event.previousHash!==previous
       ||hashEvent(event)!==event.hash)throw Error('Audit append has an invalid chain link');
    const buf=Buffer.from(JSON.stringify(event)+'\n');
    const size=fs.existsSync(filename)?fs.statSync(filename).size:0;
    if(size+buf.length>MAX_FILE_BYTES)throw Error('Audit journal file size limit reached');
    const fd=fs.openSync(filename,'a',0o600);
    try{
      let offset=0;
      while(offset<buf.length)offset+=fs.writeSync(fd,buf,offset,buf.length-offset);
      fs.fsyncSync(fd);
    }finally{fs.closeSync(fd)}
    events.push(event);
  }
  return {
    mode:'FILESYSTEM_JOURNAL_UNVERIFIED',configured:true,path:filename,
    events:events.map(e=>({...e})),append
  };
}
module.exports={createAuditJournal,verifyChain,hashEvent};
