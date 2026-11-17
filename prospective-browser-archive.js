'use strict';
/*
 * Device-local backup for CASH's read-only prospective research exports.
 * This does not run when the page is closed, backfill missing rounds, prove
 * timestamps, validate model accuracy or create an exchange order.
 */
(function(root){
 const KEY='cash-prospective-local-archive-v1';
 const FORMAT='CASH_LOCAL_PROSPECTIVE_ARCHIVE_V1';
 const FULL='CASH_PROSPECTIVE_HASHED_SESSION_V1';
 const REDACTED='CASH_PROSPECTIVE_REDACTED_COMMITMENTS_V1';
 const MAX_BYTES=2350000,MAX_SESSIONS=8,MAX_EVENTS=640;
 const hex=bytes=>Array.from(new Uint8Array(bytes)).map(v=>v.toString(16).padStart(2,'0')).join('');
 const empty=()=>({format:FORMAT,sessions:[],qualifyingForModelAccuracy:false});
 function load(storage){
  const raw=storage.getItem(KEY);
  if(!raw)return empty();
  if(raw.length>MAX_BYTES*2)throw Error('Local archive exceeds safe size');
  let v;try{v=JSON.parse(raw)}catch{throw Error('Local archive contains invalid JSON')}
  if(v?.format!==FORMAT||v.qualifyingForModelAccuracy!==false||
    !Array.isArray(v.sessions)||v.sessions.length>MAX_SESSIONS)
    throw Error('Local archive format invalid');
  return v;
 }
 async function verifySnapshot(snapshot,cryptoImpl){
  if(!snapshot||![FULL,REDACTED].includes(snapshot.format)||
    snapshot.version!=='CASH_PROSPECTIVE_KALSHI_V1'||
    snapshot.model!=='KXBTC15M_SETTLEMENT_EARLY_V3'||
    snapshot.qualifiedCount!==0||snapshot.independentlyTimeAttested!==false||
    snapshot.modelCalibrated!==false||snapshot.tradingAuthorized!==false||
    snapshot.automatedOrdersEnabled!==false||
    !Array.isArray(snapshot.events)||snapshot.events.length>MAX_EVENTS||
    !cryptoImpl?.subtle?.digest)throw Error('Unsupported or unsafe forecast export');
  let previous='GENESIS';
  const seen=new Set(),encoder=new TextEncoder();
  for(let i=0;i<snapshot.events.length;i++){
   const e=snapshot.events[i];
   if(!e||e.sequence!==i+1||!['FORECAST','OUTCOME'].includes(e.type)||
     !Number.isFinite(Date.parse(e.recordedAt))||
     e.previousHash!==previous||!/^[0-9a-f]{64}$/.test(e.hash||''))
    throw Error('Forecast export chain invalid');
   if(snapshot.format===FULL){
    if(!e.payload||typeof e.payload!=='object'||Array.isArray(e.payload))
     throw Error('Forecast export payload missing');
    if(e.type==='FORECAST'){
     const p=e.payload,at=Date.parse(p.at),end=Date.parse(p.endTime);
     if(!/^KXBTC15M-[A-Za-z0-9-]{6,70}$/.test(p.marketId||'')||
       seen.has(p.marketId)||p.model!==snapshot.model||
       !['YES','NO',null].includes(p.side)||!Number.isFinite(at)||
       !Number.isFinite(end)||end-at<90000||end-at>780000||
       p.realMoneyAuthorized!==false||p.validation!=='UNVALIDATED_PROXY_MODEL')
      throw Error('Invalid or duplicate frozen forecast');
     seen.add(p.marketId);
    }else{
     if(!seen.has(e.payload.marketId)||
       !['YES','NO','VOID'].includes(e.payload.winner))
      throw Error('Outcome without a prior frozen forecast');
    }
    const body={...e};delete body.hash;
    const digest=hex(await cryptoImpl.subtle.digest('SHA-256',encoder.encode(JSON.stringify(body))));
    if(digest!==e.hash)throw Error('Forecast export checksum mismatch');
   }else if(Object.hasOwn(e,'payload'))
    throw Error('Licensed-index redacted export unexpectedly contains a payload');
   // Redacted commitment hashes cannot be recomputed without hidden inputs.
   previous=e.hash;
  }
  if(previous!==snapshot.headHash)throw Error('Forecast export head mismatch');
  return true;
 }
 const identity=s=>s.events[0]?.hash+':'+s.format;
 async function verifyArchive(archive,cryptoImpl){
  if(archive?.format!==FORMAT||archive.qualifyingForModelAccuracy!==false||
   !Array.isArray(archive.sessions)||archive.sessions.length>MAX_SESSIONS)
   throw Error('Invalid CASH prospective archive wrapper');
  const used=new Set();
  for(const entry of archive.sessions){
   if(!entry||typeof entry.id!=='string'||used.has(entry.id)||
     !Number.isFinite(Date.parse(entry.savedAt))||!entry.snapshot?.events?.length||
     entry.id!==identity(entry.snapshot))
    throw Error('Invalid duplicate or missing archived session');
   used.add(entry.id);
   await verifySnapshot(entry.snapshot,cryptoImpl);
  }
 }
 function createArchive({storage,cryptoImpl,clock=()=>Date.now()}={}){
  if(!storage?.getItem||!storage?.setItem||!storage?.removeItem)
   throw Error('Device storage unavailable');
  function summary(){
   const a=load(storage);
   const markets=new Set();let redactedCommitments=0,fullEvents=0;
   for(const entry of a.sessions){
    if(entry.snapshot.format===REDACTED)
     redactedCommitments+=entry.snapshot.events.filter(e=>e.type==='FORECAST').length;
    else for(const e of entry.snapshot.events){
     fullEvents++;
     if(e.type==='FORECAST'&&typeof e.payload?.marketId==='string')
      markets.add(e.payload.marketId);
    }
   }
   return {sessions:a.sessions.length,uniqueProxyMarkets:markets.size,
    redactedCommitments,fullEvents,qualifiedCount:0};
  }
  async function merge(added){
   const existing=load(storage);
   await verifyArchive(existing,cryptoImpl);
   const merged={...existing,sessions:[...existing.sessions]};
   for(const snap of added){
    await verifySnapshot(snap,cryptoImpl);
    if(!snap.events.length)continue;
    const id=identity(snap),index=merged.sessions.findIndex(x=>x.id===id);
    const previous=index<0?null:merged.sessions[index].snapshot;
    if(previous){
     for(let i=0;i<Math.min(snap.events.length,previous.events.length);i++)
      if(snap.events[i].hash!==previous.events[i].hash)
       throw Error('Conflicting stored forecast journal');
     if(snap.events.length<=previous.events.length)continue;
    }
    const row={id,savedAt:new Date(clock()).toISOString(),snapshot:snap};
    if(index>=0)merged.sessions[index]=row;
    else merged.sessions.push(row);
   }
   if(merged.sessions.length>MAX_SESSIONS||
      new TextEncoder().encode(JSON.stringify(merged)).length>MAX_BYTES)
    throw Error('Browser capacity reached. Download a backup; no old evidence was deleted.');
   const changed=JSON.stringify(merged)!==JSON.stringify(existing);
   if(changed)storage.setItem(KEY,JSON.stringify(merged));
   return {saved:changed,...summary()};
  }
  async function capture(snap){return merge([snap])}
  async function importJson(raw){
   if(typeof raw!=='string'||new TextEncoder().encode(raw).length>MAX_BYTES+200000)
    throw Error('Backup file too large');
   let parsed;try{parsed=JSON.parse(raw)}catch{throw Error('Backup JSON invalid')}
   if(parsed?.format===FORMAT){
    await verifyArchive(parsed,cryptoImpl);
    return merge(parsed.sessions.map(x=>x.snapshot));
   }
   if([FULL,REDACTED].includes(parsed?.format))return merge([parsed]);
   throw Error('Not a CASH prospective archive or forecast export');
  }
  function exportJson(){
   const archived=load(storage);
   return JSON.stringify({...archived,downloadedAt:new Date(clock()).toISOString(),
    warning:'Browser-only unverified snapshots. Redacted index commitments cannot be recomputed. No independent timestamps, durable server history, proven forecast accuracy, or real orders.'},null,2);
  }
  function clear(){storage.removeItem(KEY)}
  return {capture,importJson,exportJson,summary,clear};
 }
 const api={KEY,FORMAT,FULL,REDACTED,createArchive,verifySnapshot,verifyArchive};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.CASHProspectiveArchive=api;
})(typeof window!=='undefined'?window:null);
