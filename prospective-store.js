'use strict';
/*
 * Optional existing CASH_AUDIT_DIR storage: separate early V3 forecast
 * event chain. Fail-closed disk replay and cooperative exclusive writes.
 * Completed sessions are immutable source-hash-named hardlinks created ONLY
 * by an approved offline rotation; a running app never rotates or deletes.
 */
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const NAME='prospective-kalshi-events.jsonl',LIMIT=640,MAX_BYTES=20*1024*1024;
const LOCK='.prospective-kalshi-events.write.lock';
const SHA=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const bytesHash=x=>createHash('sha256').update(x).digest('hex');
const ID=/^KXBTC15M-[A-Za-z0-9-]{6,70}$/;
function maybeStat(file){
 try{return fs.lstatSync(file)}
 catch(e){if(e.code==='ENOENT')return null;throw e}
}
function createProspectiveStore({directory=process.env.CASH_AUDIT_DIR}={}){
 if(!directory)return {mode:'VOLATILE_SERVER_SESSION',events:[],
  priorMarketIds:[],priorCompletedSegments:0,append(){}};
 if(typeof directory!=='string'||!path.isAbsolute(directory))
  throw Error('Prospective audit directory must be pre-mounted absolute directory');
 const root=fs.lstatSync(directory);
 if(!root.isDirectory()||root.isSymbolicLink())
  throw Error('Prospective audit directory must be a real pre-mounted directory');
 const filename=path.join(directory,NAME),lock=path.join(directory,LOCK);
 if(maybeStat(lock))
  throw Error('Existing prospective writer lock requires operator review');
 const file=maybeStat(filename);
 if(file&&(!file.isFile()||file.isSymbolicLink()||file.size>MAX_BYTES))
  throw Error('Prospective journal file invalid or oversized');
 const bytes=file?fs.readFileSync(filename):Buffer.alloc(0);
 if(bytes.length!==file?.size&&file)
  throw Error('Prospective journal disk content changed during read');
 if(bytes.length>MAX_BYTES||(bytes.length&&bytes.at(-1)!==10))
  throw Error('Prospective journal truncated or oversized');
 let events=[];
 if(bytes.length)try{events=bytes.toString('utf8').trimEnd().split('\n').map(x=>JSON.parse(x))}
 catch{throw Error('Prospective journal JSONL corrupted')}
 if(events.length>LIMIT)throw Error('Prospective journal event limit exceeded');
 let prev='GENESIS';
 const activeForecasts=new Set();
 for(const [i,e] of events.entries()){
  if(!e||typeof e!=='object'||Array.isArray(e))
   throw Error('Prospective journal integrity invalid');
  const {hash,...body}=e;
  if(e.previousHash!==prev||e.sequence!==i+1||
    !['FORECAST','OUTCOME'].includes(e.type)||SHA(body)!==hash)
   throw Error('Prospective journal integrity invalid');
  if(e.type==='FORECAST'){
   const id=e.payload?.marketId;
   if(!ID.test(id||'')||activeForecasts.has(id))
    throw Error('Prospective journal duplicate market or invalid identity');
   activeForecasts.add(id);
  }else if(!activeForecasts.has(e.payload?.marketId))
   throw Error('Prospective outcome without a frozen market');
  prev=hash;
 }
 // Lazily load offline inventory: no rotation module executes a write here.
 // An incomplete hardlink+unlink transition will appear as an overlap and
 // must block startup rather than being silently repaired.
 const {inspectCompletedEarlySegments}=require('./prospective-offline-rotation');
 const prior=inspectCompletedEarlySegments(directory);
 const previous=new Set(prior.priorMarketIds);
 for(const id of activeForecasts)
  if(previous.has(id))throw Error('Active prospective market repeats completed segment');
 if(file&&prior.segmentHashes.includes(bytesHash(bytes)))
  throw Error('Incomplete prospective segment handoff: duplicate active source');
 let expectedBytes=bytes.length,expectedHash=bytesHash(bytes);
 function append(event){
  if(events.length>=LIMIT)throw Error('Prospective journal full');
  const {hash,...body}=event||{};
  if(event?.sequence!==events.length+1||
     event.previousHash!==(events.at(-1)?.hash||'GENESIS')||
     SHA(body)!==hash||!['FORECAST','OUTCOME'].includes(event.type))
   throw Error('Invalid prospective journal append');
  if(event.type==='FORECAST'&&(
   !ID.test(event.payload?.marketId||'')||
   previous.has(event.payload.marketId)||
   activeForecasts.has(event.payload.marketId)))
   throw Error('Prospective contract already frozen in an active or prior journal');
  if(event.type==='OUTCOME'&&!activeForecasts.has(event.payload?.marketId))
   throw Error('Prospective outcome lacks frozen market');
  const newBytes=Buffer.from(JSON.stringify(event)+'\n');
  if(expectedBytes+newBytes.length>MAX_BYTES)
   throw Error('Prospective journal size full');
  const lockFd=fs.openSync(lock,fs.constants.O_WRONLY|
    fs.constants.O_CREAT|fs.constants.O_EXCL|
    (fs.constants.O_NOFOLLOW||0),0o600);
  let written=false,newHash=null;
  try{
   const stat=maybeStat(filename);
   if(stat&&(!stat.isFile()||stat.isSymbolicLink()))
    throw Error('Prospective journal path replaced');
   const fd=fs.openSync(filename,fs.constants.O_RDWR|
    fs.constants.O_APPEND|fs.constants.O_CREAT|
    (fs.constants.O_NOFOLLOW||0),0o600);
   try{
    const actual=fs.fstatSync(fd);
    if(!actual.isFile()||actual.size!==expectedBytes||
      (stat&&(stat.ino!==actual.ino||stat.dev!==actual.dev)))
     throw Error('Prospective journal changed since replay');
    const content=Buffer.alloc(actual.size);
    let n=0;
    while(n<content.length){
     const got=fs.readSync(fd,content,n,content.length-n,n);
     if(got<=0)throw Error('Prospective journal disk re-read incomplete');
     n+=got;
    }
    if(bytesHash(content)!==expectedHash)
     throw Error('Prospective journal content changed since replay');
    newHash=bytesHash(Buffer.concat([content,newBytes]));
    let offset=0;
    while(offset<newBytes.length){
     const wrote=fs.writeSync(fd,newBytes,offset,newBytes.length-offset);
     if(wrote<=0)throw Error('Prospective journal incomplete append');
     offset+=wrote;
    }
    fs.fsyncSync(fd);
    written=true;
   }finally{fs.closeSync(fd)}
   const parentFd=fs.openSync(directory,'r');
   try{fs.fsyncSync(parentFd)}finally{fs.closeSync(parentFd)}
  }finally{
   fs.closeSync(lockFd);
   fs.unlinkSync(lock);
  }
  if(!written||!newHash)throw Error('Prospective journal append not durable');
  events.push(event);expectedBytes+=newBytes.length;expectedHash=newHash;
  if(event.type==='FORECAST')activeForecasts.add(event.payload.marketId);
 }
 return {mode:'FILESYSTEM_JOURNAL_UNVERIFIED',events,append,
  priorMarketIds:prior.priorMarketIds.slice(),
  priorCompletedSegments:prior.completedSegments,path:filename};
}
module.exports={createProspectiveStore};
