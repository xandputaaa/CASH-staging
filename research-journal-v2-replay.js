'use strict';
const {createHash}=require('node:crypto');
async function replayResearchStream(client,stream,validateChain){
 if(!/^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/.test(stream)||typeof validateChain!=='function')throw Error('Invalid replay arguments');
 const {rows}=await client.query('SELECT sequence,market_id,event_type,event_hash,previous_hash,original_event FROM cash_research_events_v2 WHERE stream=$1 ORDER BY sequence',[stream]);
 const events=[],forecasts=new Set(),outcomes=new Set();
 let head='GENESIS';
 for(const row of rows){
  const e=JSON.parse(row.original_event),{hash,...body}=e;
  const id=e.payload?.marketId;
  if(e.sequence!==events.length+1||BigInt(row.sequence)!==BigInt(e.sequence)||
   e.previousHash!==head||row.previous_hash!==head||row.event_hash!==hash||
   row.market_id!==id||row.event_type!==e.type||
   createHash('sha256').update(JSON.stringify(body)).digest('hex')!==hash||
   typeof id!=='string'||!id||!['FORECAST','OUTCOME'].includes(e.type))throw Error('Replay integrity mismatch');
  if(e.type==='FORECAST'){
   if(forecasts.has(id))throw Error('Replay duplicate forecast');
   forecasts.add(id);
  }else{
   if(!forecasts.has(id)||outcomes.has(id))throw Error('Replay orphan or duplicate outcome');
   outcomes.add(id);
  }
  events.push(e);head=hash;
 }
 if(await validateChain(structuredClone(events))!==true)throw Error('Replay semantic validation failed');
 return {events,headHash:head,forecastCount:forecasts.size,outcomeCount:outcomes.size};
}
module.exports={replayResearchStream};
