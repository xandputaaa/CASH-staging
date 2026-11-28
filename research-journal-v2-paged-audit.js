'use strict';
const {createHash}=require('node:crypto');
// Read-only structural audit. Caller must supply a dedicated client in a
// repeatable-read snapshot. Semantic validation remains mandatory separately.
async function auditJournalPages(client,stream,{pageSize=256}={}){
 if(typeof stream!=='string'||!/^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/.test(stream)||!Number.isInteger(pageSize)||pageSize<1||pageSize>1024)throw Error('Invalid audit arguments');
 let sequence=0,headHash='GENESIS',forecastCount=0,outcomeCount=0;
 for(;;){
  const {rows}=await client.query('SELECT sequence,market_id,event_type,event_hash,previous_hash,original_event FROM cash_research_events_v2 WHERE stream=$1 AND sequence>$2 ORDER BY sequence LIMIT $3',[stream,sequence,pageSize]);
  if(rows.length>pageSize)throw Error('Audit page exceeds bound');
  if(!rows.length)break;
  for(const row of rows){
   const event=JSON.parse(row.original_event),{hash,...body}=event;
   if(!Number.isSafeInteger(event.sequence)||event.sequence!==sequence+1||BigInt(row.sequence)!==BigInt(event.sequence)||event.previousHash!==headHash||row.previous_hash!==headHash||row.event_hash!==hash||row.market_id!==event.payload?.marketId||typeof row.market_id!=='string'||!row.market_id||row.event_type!==event.type||!['FORECAST','OUTCOME'].includes(event.type)||createHash('sha256').update(JSON.stringify(body)).digest('hex')!==hash)throw Error('Paged audit integrity mismatch');
   if(event.type==='OUTCOME'){
    const prior=await client.query("SELECT sequence FROM cash_research_events_v2 WHERE stream=$1 AND market_id=$2 AND event_type='FORECAST' AND sequence<$3",[stream,row.market_id,event.sequence]);
    if(prior.rows.length!==1)throw Error('Paged audit orphan outcome');
    outcomeCount++;
   }else forecastCount++;
   sequence=event.sequence;headHash=hash;
  }
 }
 return {sequence,headHash,forecastCount,outcomeCount};
}
// Own the snapshot explicitly; never use a client with an existing transaction.
async function auditJournalSnapshot(client,stream,options,validateSnapshot){
 if(validateSnapshot!==undefined&&typeof validateSnapshot!=='function')throw Error('Invalid snapshot validator');
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{
  const result=await auditJournalPages(client,stream,options);
  if(validateSnapshot&&await validateSnapshot(Object.freeze({...result}),client,stream)!==true)throw Error('Semantic snapshot rejected');
  await client.query('COMMIT');
  return result;
 }catch(error){
  try{await client.query('ROLLBACK')}catch{throw Error('Audit transaction state uncertain; discard client')}
  throw error;
 }
}
module.exports={auditJournalPages,auditJournalSnapshot};
