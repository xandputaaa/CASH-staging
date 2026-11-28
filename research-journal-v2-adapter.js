'use strict';
// Isolated draft adapter. Caller supplies a dedicated PostgreSQL client and
// lane-specific semantic validator. No startup wiring or migration.
const {createHash}=require('node:crypto');
async function appendResearchEvent(client,stream,originalEvent,validate){
 if(typeof stream!=='string'||!stream.trim()||typeof originalEvent!=='string'||typeof validate!=='function')
  throw Error('Invalid journal append arguments');
 const event=JSON.parse(originalEvent);
 const {hash,...body}=event;
 if(!Number.isSafeInteger(event.sequence)||event.sequence<1||
 !['FORECAST','OUTCOME'].includes(event.type)||
 typeof event.payload?.marketId!=='string'||!event.payload.marketId||
 createHash('sha256').update(JSON.stringify(body)).digest('hex')!==hash)
  throw Error('Invalid event identity or hash');
 await client.query('BEGIN');
 try{
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[stream]);
  const head=(await client.query('SELECT sequence,event_hash FROM cash_research_events_v2 WHERE stream=$1 ORDER BY sequence DESC LIMIT 1',[stream])).rows[0];
  if(BigInt(event.sequence)!==(head?BigInt(head.sequence)+1n:1n)||
     event.previousHash!==(head?.event_hash||'GENESIS'))
   throw Error('Journal head mismatch');
  const prior=(await client.query('SELECT event_type,original_event FROM cash_research_events_v2 WHERE stream=$1 AND market_id=$2',[stream,event.payload.marketId])).rows;
  if(prior.some(r=>r.event_type===event.type)||
    (event.type==='OUTCOME'&&!prior.some(r=>r.event_type==='FORECAST')))
   throw Error('Duplicate or orphan event');
  if(await validate(event,prior)!==true)throw Error('Semantic validation rejected event');
  await client.query('INSERT INTO cash_research_events_v2 (stream,sequence,market_id,event_type,event_hash,previous_hash,original_event) VALUES ($1,$2,$3,$4,$5,$6,$7)',[stream,event.sequence,event.payload.marketId,event.type,hash,event.previousHash,originalEvent]);
  await client.query('COMMIT');
 }catch(error){
  try{await client.query('ROLLBACK')}catch{throw Error('Journal transaction state uncertain; reconnect and reconcile')}
  throw error;
 }
 return {sequence:event.sequence,hash};
}
module.exports={appendResearchEvent};
