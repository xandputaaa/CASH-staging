'use strict';
/*
 * CASH opt-in-on-page local shadow archive. This only copies read-only public
 * baseline observations while the CASH page is open. It cannot certify when
 * the server saw a quote, preserve server collection during offline periods,
 * or qualify any independent forecast. Browser storage can be evicted.
 */
(function(root){
 const KEY='cash-shadow-local-archive-v1';
 const FORMAT='CASH-local-shadow-archive-v1';
 const MAX_BYTES=2200000,MAX_SESSIONS=8,MAX_EVENTS=650;
 const empty=()=>({format:FORMAT,evictedSessions:0,sessions:[]});
 function load(storage){
  const raw=storage.getItem(KEY);if(!raw)return empty();
  if(raw.length>MAX_BYTES*2)throw Error('Saved browser archive is unexpectedly large');
  let v;try{v=JSON.parse(raw)}catch{throw Error('Saved browser archive JSON is invalid')}
  if(!v||v.format!==FORMAT||!Array.isArray(v.sessions)||v.sessions.length>MAX_SESSIONS||
     !Number.isSafeInteger(v.evictedSessions)||v.evictedSessions<0)throw Error('Saved browser archive format is invalid');
  for(const s of v.sessions){
   if(!s||typeof s.bootAt!=='string'||!s.session||
     s.session.bootAt!==s.bootAt||!Array.isArray(s.session.events)||
     !Number.isFinite(Date.parse(s.savedAt)))throw Error('Saved browser archive session is invalid');
  }
  return v;
 }
 function hex(arrayBuffer){return Array.from(new Uint8Array(arrayBuffer)).map(v=>v.toString(16).padStart(2,'0')).join('')}
 async function verifySession(v,cryptoImpl){
  if(!v||!['CASH-shadow-volatile-v1','CASH-shadow-filesystem-unverified-v1'].includes(v.format)
    ||v.qualifyingForModelAccuracy!==false||v.qualifyingProspectiveContracts!==0
    ||v.independentForecastModel!==false
    ||!Number.isFinite(Date.parse(v.bootAt))||!Array.isArray(v.events)
    ||v.events.length>MAX_EVENTS||v.recordedEvents!==v.events.length
    ||!cryptoImpl||!cryptoImpl.subtle||typeof cryptoImpl.subtle.digest!=='function')
    throw Error('Shadow export invalid or checksum support unavailable');
  let previous='GENESIS';
  const encoder=new TextEncoder();
  for(let i=0;i<v.events.length;i++){
   const event=v.events[i];
   if(!event||event.sequence!==i+1||
     !['CAPTURE','RESOLUTION'].includes(event.type)||
     !Number.isFinite(Date.parse(event.recordedAt))||
     !event.payload||typeof event.payload!=='object'||Array.isArray(event.payload)||
     event.previousHash!==previous||typeof event.hash!=='string'||
     !/^[0-9a-f]{64}$/.test(event.hash))
     throw Error('Shadow export has an invalid audit chain');
   const body={...event};delete body.hash;
   const hash=hex(await cryptoImpl.subtle.digest('SHA-256',encoder.encode(JSON.stringify(body))));
   if(hash!==event.hash)throw Error('Shadow export checksum mismatch');
   previous=hash;
  }
  if(previous!==v.headHash)throw Error('Shadow export head hash mismatch');
  return true;
 }
 function createBrowserArchive({storage,cryptoImpl,clock=()=>Date.now()}={}){
  if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function')
   throw Error('Browser storage is not accessible');
  function summary(){
   const v=load(storage);
   return {sessions:v.sessions.length,events:v.sessions.reduce((n,s)=>n+s.session.events.length,0),
    evictedSessions:v.evictedSessions,storage:'THIS_BROWSER_ONLY',qualifyingForModelAccuracy:false};
  }
  async function capture(session){
   await verifySession(session,cryptoImpl);
   if(!session.events.length)return {...summary(),saved:false,reason:'No events to save yet'};
   const v=load(storage),idx=v.sessions.findIndex(s=>s.bootAt===session.bootAt);
   if(idx!==-1){
    const earlier=v.sessions[idx].session;
    if(session.events.length<earlier.events.length)
     return {...summary(),saved:false,reason:'Older snapshot ignored'};
    for(let i=0;i<earlier.events.length;i++){
     if(session.events[i]?.hash!==earlier.events[i].hash)
      throw Error('Conflicting history for the same server session');
    }
    if(session.events.length===earlier.events.length){
     if(session.headHash!==earlier.headHash)throw Error('Conflicting archive head hash');
     return {...summary(),saved:false,reason:'Already archived'};
    }
   }
   const next={bootAt:session.bootAt,savedAt:new Date(clock()).toISOString(),session};
   if(idx===-1)v.sessions.push(next);else v.sessions[idx]=next;
   v.sessions.sort((a,b)=>Date.parse(a.savedAt)-Date.parse(b.savedAt));
   let json=JSON.stringify(v);
   while(v.sessions.length>MAX_SESSIONS||new TextEncoder().encode(json).length>MAX_BYTES){
    if(v.sessions.length<2)throw Error('This snapshot is too large for the local browser archive; use direct server export');
    v.sessions.shift();v.evictedSessions++;
    json=JSON.stringify(v);
   }
   storage.setItem(KEY,json);
   return {...summary(),saved:true,reason:'Browser copy saved (not time-attested)'};
  }
 
 async function importJson(json){
  if(typeof json!=='string'||new TextEncoder().encode(json).length>MAX_BYTES+150000)
   throw Error('Import is too large for the browser archive');
  let parsed;try{parsed=JSON.parse(json)}catch{throw Error('Import is not valid JSON')}
  let sessions;
  if(parsed?.format===FORMAT){
   if(parsed.qualifyingForModelAccuracy!==false||
      !Array.isArray(parsed.sessions)||parsed.sessions.length>MAX_SESSIONS||
      !Number.isSafeInteger(parsed.evictedSessions)||parsed.evictedSessions<0)
    throw Error('Imported archive has an invalid format or qualification claim');
   sessions=parsed.sessions.map(row=>{
    if(!row||row.bootAt!==row.session?.bootAt||
      !Number.isFinite(Date.parse(row.savedAt)))
     throw Error('Imported archive has an invalid session wrapper');
    return row.session;
   });
  }else if(['CASH-shadow-volatile-v1','CASH-shadow-filesystem-unverified-v1'].includes(parsed?.format))
   sessions=[parsed];
  else throw Error('Unsupported CASH archive or session export');
  const seen=new Set();
  for(const session of sessions){
   if(typeof session?.bootAt!=='string'||seen.has(session.bootAt))
    throw Error('Imported archive has duplicate or invalid session identities');
   seen.add(session.bootAt);
  }
  const current=load(storage);
  // Verify all imported and existing records before a single transactional write.
  for(const row of current.sessions)await verifySession(row.session,cryptoImpl);
  for(const session of sessions)await verifySession(session,cryptoImpl);
  const updated={...current,sessions:current.sessions.map(row=>({...row}))};
  let importedSessions=0,updatedSessions=0,unchangedSessions=0;
  for(const session of sessions){
   if(!session.events.length){unchangedSessions++;continue}
   const idx=updated.sessions.findIndex(row=>row.bootAt===session.bootAt);
   if(idx===-1){
    updated.sessions.push({bootAt:session.bootAt,savedAt:new Date(clock()).toISOString(),session});
    importedSessions++;continue;
   }
   const old=updated.sessions[idx].session;
   for(let i=0;i<Math.min(old.events.length,session.events.length);i++){
    if(old.events[i].hash!==session.events[i].hash)
     throw Error('Conflicting event history for an archived server session');
   }
   if(session.events.length>old.events.length){
    updated.sessions[idx]={bootAt:session.bootAt,savedAt:new Date(clock()).toISOString(),session};
    updatedSessions++;
   }else unchangedSessions++;
  }
  if(importedSessions||updatedSessions){
   updated.sessions.sort((a,b)=>Date.parse(a.savedAt)-Date.parse(b.savedAt));
   if(updated.sessions.length>MAX_SESSIONS||
      new TextEncoder().encode(JSON.stringify(updated)).length>MAX_BYTES)
    throw Error('Import exceeds local archive capacity; export and clear old copies first');
   storage.setItem(KEY,JSON.stringify(updated));
  }
  return {...summary(),importedSessions,updatedSessions,unchangedSessions,
   warning:'Browser backup only; checksum consistency does not authenticate time or provenance'};
 }
 function exportJson(){
   const v=load(storage);
   return JSON.stringify({...v,exportedAt:new Date(clock()).toISOString(),
    qualifyingForModelAccuracy:false,
    warning:'Local browser copy only. Not an immutable audit, independent timestamp, or validated CASH model forecast.'},null,2);
  }
  function clear(){storage.removeItem(KEY);return summary()}
  return {summary,capture,importJson,exportJson,clear};
 }
 const api={KEY,createBrowserArchive,verifySession};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.CASHShadowArchive=api;
})(typeof window!=='undefined'?window:null);
