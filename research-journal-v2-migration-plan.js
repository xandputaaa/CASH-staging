'use strict';
// Pure preflight only: no database writes, filesystem writes or migration.
const {createHash}=require('node:crypto');
const sha=x=>createHash('sha256').update(x).digest('hex');
function inventoryLegacyJournal(stream,bytes,validateChain){
 if(typeof stream!=='string'||! /^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/.test(stream)||
 !Buffer.isBuffer(bytes)||typeof validateChain!=='function')throw Error('Invalid inventory arguments');
 if(bytes.length&&bytes.at(-1)!==10)throw Error('Truncated legacy journal');
 const raw=bytes.toString('utf8');
 if(!Buffer.from(raw,'utf8').equals(bytes))throw Error('Invalid UTF-8');
 const lines=raw?raw.slice(0,-1).split('\n'):[];
 const events=lines.map(line=>JSON.parse(line));
 let previous='GENESIS';
 const forecasts=new Set(),outcomes=new Set();
 for(const [i,e] of events.entries()){
  const {hash,...body}=e;
  const id=e.payload?.marketId;
  if(e.sequence!==i+1||e.previousHash!==previous||sha(JSON.stringify(body))!==hash||
    typeof id!=='string'||!id||!['FORECAST','OUTCOME'].includes(e.type))
   throw Error('Invalid legacy event chain');
  if(e.type==='FORECAST'){
   if(forecasts.has(id))throw Error('Duplicate forecast');
   forecasts.add(id);
  }else{
   if(!forecasts.has(id)||outcomes.has(id))throw Error('Orphan or duplicate outcome');
   outcomes.add(id);
  }
  previous=hash;
 }
 if(validateChain(structuredClone(events))!==true)throw Error('Legacy semantic validation failed');
 return {stream,sourceSha256:sha(bytes),sourceBytes:bytes.length,eventCount:events.length,
  forecasts:forecasts.size,outcomes:outcomes.size,headHash:previous,
  marketIds:[...forecasts],qualificationCredit:0};
}
module.exports={inventoryLegacyJournal};
