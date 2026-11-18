'use strict';
/*
 * Optional, local, append-only late-checkpoint research ledger.
 * Nothing writes unless a pre-existing absolute CASH_AUDIT_DIR is supplied.
 * A hash chain checks consistency, never independent time/authenticity.
 * No imports of private BRTI samples, account state, or trading actions.
 */
const fs=require('node:fs'),path=require('node:path');
const crypto=require('node:crypto');
const FILE='late-checkpoint-events.jsonl',MAX_EVENTS=320,MAX_BYTES=24*1024*1024;
const MODEL='KXBTC15M_LATE_CHECKPOINT_SHADOW_V1';
const MARKET=/^KXBTC15M-[A-Za-z0-9-]{6,70}$/;
const HASH=/^[a-f0-9]{64}$/;
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const time=x=>typeof x==='string'?Date.parse(x):NaN;
const keys=(value,allowed)=>value&&typeof value==='object'&&!Array.isArray(value)&&
 Object.keys(value).every(k=>allowed.includes(k));
const freezeKeys=['marketId','model','referenceModel','sourceType','indexSourceType',
 'at','endTime','leadMs','side','officialStrikeAtFreeze','strikeTypeAtFreeze',
 'inputCommitment','sampleCommitment','publicAskAtFreeze','publicAskQuoteFetchedAt',
 'feeScheduleAtFreeze','validation','realMoneyAuthorized','calibratedProbability','expectedValue'];
const outcomeKeys=['marketId','winner','checkedAt','firstObservedAt','evidenceSha256',
 'evidenceSourceUrl','confirmationCount','numericRuleStatus','evidenceSnapshot'];
function verifyLateCheckpointChain(events,{maxEvents=MAX_EVENTS}={}){
 if(!Array.isArray(events)||events.length>maxEvents||maxEvents>MAX_EVENTS)
  throw Error('Late journal event capacity exceeded');
 let prev='GENESIS',forecasts=0,outcomes=0;
 const records=new Map();
 for(const [i,e] of events.entries()){
  if(!e||!keys(e,['sequence','recordedAt','type','payload','previousHash','hash'])||
   e.sequence!==i+1||e.previousHash!==prev||!HASH.test(e.hash||'')||
   !['FORECAST','OUTCOME'].includes(e.type)||!Number.isFinite(time(e.recordedAt)))
   throw Error('Late replay event identity invalid at '+(i+1));
  const {hash:given,...body}=e;
  if(hash(body)!==given)throw Error('Late replay event hash mismatch');
  const p=e.payload;
  if(e.type==='FORECAST'){
   if(!keys(p,freezeKeys)||p.model!==MODEL||
     !MARKET.test(p.marketId||'')||records.has(p.marketId)||
     !['YES','NO',null].includes(p.side)||
     !['SINGLE_EXCHANGE_PROXY','OFFICIAL_BRTI_LIVE'].includes(p.sourceType)||
     p.indexSourceType!==p.sourceType||
     !['UNVALIDATED_LATE_CHECKPOINT'].includes(p.validation)||
     p.realMoneyAuthorized!==false||p.calibratedProbability!==null||
     p.expectedValue!==null||
     !Number.isFinite(time(p.at))||!Number.isFinite(time(p.endTime))||
     time(p.endTime)-time(p.at)<150000||time(p.endTime)-time(p.at)>210000||
     p.leadMs!==time(p.endTime)-time(p.at)||
     Math.abs(time(e.recordedAt)-time(p.at))>5000||
     !HASH.test(p.inputCommitment||'')||!HASH.test(p.sampleCommitment||'')||
     !Number.isFinite(p.officialStrikeAtFreeze)||
     p.strikeTypeAtFreeze!=='greater_or_equal')
    throw Error('Late replay forecast source or timing invalid');
   records.set(p.marketId,{forecast:p,outcome:null,forecastEvent:e});
   forecasts++;
  }else{
   const r=records.get(p?.marketId);
   if(!r||r.outcome||!keys(p,outcomeKeys)||
     !['YES','NO','VOID'].includes(p.winner)||
     p.confirmationCount!==2||
     !HASH.test(p.evidenceSha256||'')||
     !Number.isFinite(time(p.checkedAt))||
     time(p.checkedAt)<time(r.forecast.endTime)||
     time(e.recordedAt)<time(r.forecast.endTime)-5000||
     !Number.isFinite(time(p.firstObservedAt))||
     time(p.firstObservedAt)>time(p.checkedAt)||
     p.numericRuleStatus===undefined)
    throw Error('Late replay outcome evidence inconsistent');
   if(r.forecast.sourceType==='SINGLE_EXCHANGE_PROXY'&&
      p.winner!=='VOID'){
    // Same checks applied by the live collector before recording:
    // numerical public Kalshi rule and public strike must match freeze.
    const {checkKalshiSettlement}=require('./kalshi-settlement-check');
    const numeric=checkKalshiSettlement(p.evidenceSnapshot);
    if(numeric.state!=='NUMERIC_MATCH'||p.numericRuleStatus!=='NUMERIC_MATCH'||
       numeric.strikeCents!==Math.round(r.forecast.officialStrikeAtFreeze*100)||
       hash(p.evidenceSnapshot)!==p.evidenceSha256)
      throw Error('Late replay official numeric settlement inconsistent');
   }
   r.outcome=p;outcomes++;
  }
  prev=e.hash;
 }
 if(forecasts>Math.floor(maxEvents/2)||outcomes>forecasts)
  throw Error('Late replay reserved event capacity exceeded');
 return {headHash:prev,forecasts,outcomes,records};
}
function createLateCheckpointStore({directory=process.env.CASH_AUDIT_DIR}={}){
 if(!directory)return {
  mode:'VOLATILE_SERVER_SESSION',configured:false,events:[],path:null,append(){}
 };
 if(typeof directory!=='string'||!path.isAbsolute(directory))
  throw Error('Late journal directory must be an absolute pre-mounted path');
 const dir=fs.lstatSync(directory);
 if(!dir.isDirectory()||dir.isSymbolicLink())
  throw Error('Late journal directory cannot be a symlink');
 const filename=path.join(directory,FILE);
 // existsSync follows the target and returns false on a DANGLING symlink.
 // Use lstat even when the link target does not exist; fail closed.
 function fileStat(){
  try{return fs.lstatSync(filename)}
  catch(e){if(e.code==='ENOENT')return null;throw e}
 }
 const current=fileStat();
 if(current&&(!current.isFile()||current.isSymbolicLink()||current.size>MAX_BYTES))
  throw Error('Late journal file must be an ordinary bounded file');
 const raw=current?fs.readFileSync(filename,'utf8'):'';
 if(Buffer.byteLength(raw)>MAX_BYTES||(raw&&!raw.endsWith('\n')))
  throw Error('Late journal is oversized or truncated');
 let events=[];
 if(raw)try{events=raw.trimEnd().split('\n').map(s=>JSON.parse(s))}
 catch{throw Error('Late journal is not valid JSONL')}
 verifyLateCheckpointChain(events);
 // Only writers honoring this lock are serialized; this is NOT a defense
 // against a privileged operator modifying the volume or remote replicas.
 // Never automatically remove a lock left by a crashed process.
 const lockfile=path.join(directory,'.late-checkpoint-events.write.lock');
 let expectedBytes=Buffer.byteLength(raw),expectedSha256=hash(raw);
 function append(event){
  // Check the complete proposed semantic chain before any filesystem write.
  verifyLateCheckpointChain([...events,event]);
  const buffer=Buffer.from(JSON.stringify(event)+'\n');
  // O_EXCL prevents simultaneous cooperating Node processes from appending
  // to the same volume. A stale lock means operator review, not auto-delete.
  const lockFd=fs.openSync(lockfile,
   fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|
    (fs.constants.O_NOFOLLOW||0),0o600);
  let wrote=false,newSha256=null;
  try{
   const st=fileStat();
   if(st&&(st.isSymbolicLink()||!st.isFile()))
    throw Error('Late journal path changed unexpectedly');
   if(st&&st.size>MAX_BYTES)throw Error('Late journal size limit reached');
   const flags=fs.constants.O_RDWR|fs.constants.O_CREAT|
     fs.constants.O_APPEND|(fs.constants.O_NOFOLLOW||0);
   const fd=fs.openSync(filename,flags,0o600);
   try{
    const state=fs.fstatSync(fd);
    if(!state.isFile()||state.size!==expectedBytes||
       (st&&(st.ino!==state.ino||st.dev!==state.dev)))
     throw Error('Late journal disk state diverged since last read');
    if(state.size+buffer.length>MAX_BYTES)
     throw Error('Late journal size limit reached');
    const existing=Buffer.alloc(state.size);
    let read=0;
    while(read<existing.length){
     const bytes=fs.readSync(fd,existing,read,existing.length-read,read);
     if(bytes<=0)throw Error('Late journal failed complete disk re-read');
     read+=bytes;
    }
    if(hash(existing)!==expectedSha256)
     throw Error('Late journal disk content diverged since last read');
    newSha256=hash(Buffer.concat([existing,buffer]));
    let offset=0;
    while(offset<buffer.length){
     const n=fs.writeSync(fd,buffer,offset,buffer.length-offset);
     if(n<=0)throw Error('Late journal write incomplete');
     offset+=n;
    }
    fs.fsyncSync(fd);
    wrote=true;
   }finally{fs.closeSync(fd)}
   // Flush the new file's directory entry before in-RAM advancement.
   const dirFd=fs.openSync(directory,'r');
   try{fs.fsyncSync(dirFd)}finally{fs.closeSync(dirFd)}
  }finally{
   fs.closeSync(lockFd);
   fs.unlinkSync(lockfile);
  }
  if(!wrote||!newSha256)throw Error('Late journal persistence incomplete');
  expectedBytes+=buffer.length;
  expectedSha256=newSha256;
  events.push(event);
 }
 return {mode:'FILESYSTEM_JOURNAL_UNVERIFIED',configured:true,
  events:events.map(e=>structuredClone(e)),path:filename,append};
}
module.exports={createLateCheckpointStore,verifyLateCheckpointChain,MAX_EVENTS};
