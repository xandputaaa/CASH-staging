'use strict';
/*
 * Live prospective forecast journal. A decision is captured only in a fixed
 * pre-expiry horizon, kept immutable, and paired with independently checked
 * public outcome evidence. Session-only unless an approved audit volume is
 * attached; never counts toward 100 independently time-attested forecasts.
 */
const {createHash}=require('node:crypto');
const {evaluateProspective,NAME,digest}=require('./kalshi-prospective-model');
const {hasVerifiedEvidence}=require('./shadow-monitor');
const MAX=320;
const supported=/^KXBTC15M-[A-Za-z0-9-]{6,70}$/;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const clockISO=t=>new Date(t).toISOString();
function createProspectiveMonitor({quotes,spot,results,clock=()=>Date.now(),
 maxRecords=MAX,store=null}={}){
 if(!quotes||!spot||!results)throw Error('Missing prospective data feeds');
 const records=[],ids=new Set(),events=[];
 let lastHash='GENESIS',inflight=null,scans=0,lastScanAt=null,failures=0,pendingCursor=0;
 function append(type,payload){
  const body={sequence:events.length+1,type,recordedAt:clockISO(clock()),payload,
   previousHash:lastHash};
  const e={...body,hash:hash(body)};
  if(store)store.append(e);
  events.push(e);lastHash=e.hash;
  return e;
 }
 // Replay externally persisted records only after checking hashes and semantics.
 if(store&&Array.isArray(store.events)){
  for(const event of store.events){
   const {hash:given,...body}=event;
   if(event.previousHash!==lastHash||event.sequence!==events.length+1||
      !['FORECAST','OUTCOME'].includes(event.type)||hash(body)!==given)
    throw Error('Prospective journal chain verification failed');
   const p=event.payload;
   if(event.type==='FORECAST'){
    if(!p||ids.has(p.marketId)||!supported.test(p.marketId)||
      p.model!==NAME||p.validation!=='UNVALIDATED_PROXY_MODEL'||
      !['YES','NO',null].includes(p.side)||p.realMoneyAuthorized!==false||
      p.calibratedProbability!==null||p.expectedValue!==null||
      !Number.isFinite(Date.parse(p.at))||Date.parse(p.endTime)-Date.parse(p.at)<90000||
      Date.parse(p.endTime)-Date.parse(p.at)>240000||
      !Array.isArray(p.sampleWindow)||digest(p.sampleWindow)!==p.sampleWindowSha256)
     throw Error('Prospective saved forecast invalid');
    records.push({...p,status:'PENDING',winner:null,resolvedAt:null,outcomeEvidence:null});
    ids.add(p.marketId);
   }else{
    const r=records.find(x=>x.marketId===p.marketId);
    if(!r||r.status!=='PENDING'||!p.evidence||
      !hasVerifiedEvidence(p.evidence,{venue:'Kalshi',marketId:r.marketId,
        endTime:r.endTime,targetPriceAtCapture:r.targetPrice})||
      !['YES','NO','VOID'].includes(p.winner)||p.winner!==p.evidence.winner)
     throw Error('Prospective saved outcome invalid');
    r.winner=p.winner;r.resolvedAt=p.evidence.checkedAt;
    r.outcomeEvidence=p.evidence;
    r.status=p.winner==='VOID'?'VOID':p.winner===r.side?'HIT':p.winner!==r.side&&r.side?'MISS':'WAIT_RESOLVED';
   }
   events.push(event);lastHash=event.hash;
  }
 }
 async function scan(){
  if(inflight)return inflight;
  inflight=(async()=>{
   scans++;
   let created=0,resolved=0,recordedWait=0;
   try{
    // Quote & spot are fetched before the model freeze; future data never enter.
    const [q,s]=await Promise.all([quotes.query('Kalshi'),spot.update()]);
    if(q?.marketId&&!ids.has(q.marketId)&&records.length<maxRecords){
     const p=evaluateProspective({quote:q,spot:s,now:clock()});
     if(p.marketId&&p.state!=='WAIT'||
        p.marketId&&p.reason==='EDGE_UNCLEAR_VS_VOLATILITY'){
      const frozen={...p};
      append('FORECAST',frozen);
      records.push({...frozen,status:'PENDING',winner:null,resolvedAt:null,outcomeEvidence:null});
      ids.add(q.marketId);created++;if(!p.side)recordedWait++;
     }
    }
   }catch{failures++}
   // Stagger official outcome polling; max 4 lookups per scan. A result is
   // acceptable only after two separate public reads and evidence checks.
   const pending=records.filter(x=>x.status==='PENDING'&&Date.parse(x.endTime)<=clock());
   const start=pending.length?pendingCursor%pending.length:0;
   const selected=Array.from({length:Math.min(4,pending.length)},(_,i)=>pending[(start+i)%pending.length]);
   pendingCursor=pending.length?(start+selected.length)%pending.length:0;
   for(const record of selected){
    try{
     const result=await results.lookup({venue:'Kalshi',marketId:record.marketId,slug:null});
     if(result.status!=='verified'||!hasVerifiedEvidence(result,{venue:'Kalshi',
      marketId:record.marketId,endTime:record.endTime,
      targetPriceAtCapture:record.targetPrice}))continue;
     append('OUTCOME',{marketId:record.marketId,winner:result.winner,evidence:result});
     record.winner=result.winner;record.resolvedAt=result.checkedAt;
     record.outcomeEvidence=result;
     record.status=result.winner==='VOID'?'VOID':record.side===null?'WAIT_RESOLVED':
      record.side===result.winner?'HIT':'MISS';
     resolved++;
    }catch{failures++}
   }
   lastScanAt=clockISO(clock());
   return {created,recordedWait,resolved};
  })().finally(()=>{inflight=null});
  return inflight;
 }
 function snapshot(){
  const predictions=records.filter(x=>x.side==='YES'||x.side==='NO');
  const scored=predictions.filter(x=>x.status==='HIT'||x.status==='MISS');
  const hit=scored.filter(x=>x.status==='HIT').length;
  return {
   version:'CASH_PROSPECTIVE_KALSHI_V1',
   updatedAt:clockISO(clock()),
   model:NAME,
   state:records.length>=maxRecords?'CAPACITY_BLOCKED':'COLLECTING_EXPERIMENTAL',
   scans,lastScanAt,failures,
   storage:store?.mode||'VOLATILE_SERVER_SESSION',headHash:lastHash,
   records:records.length,directional:predictions.length,
   waits:records.filter(x=>x.side===null).length,
   pending:records.filter(x=>x.status==='PENDING').length,
   officiallyScored:scored.length,hits:hit,misses:scored.length-hit,
   voids:records.filter(x=>x.status==='VOID').length,
   hitRate:scored.length?hit/scored.length:null,
   qualifiedCount:0,requiredQualified:100,
   independentlyTimeAttested:false,modelCalibrated:false,
   tradingAuthorized:false,automatedOrdersEnabled:false,
   latest:records.length?{...records.at(-1),outcomeEvidence:undefined}:null,
   recent:records.slice(-12).reverse().map(x=>({
    marketId:x.marketId,at:x.at,side:x.side,reason:x.reason,
    leadMs:x.leadMs,signalZ:x.signalZ,targetPrice:x.targetPrice,
    spotPrice:x.spotPrice,barrierBps:x.barrierBps,status:x.status,winner:x.winner
   })),
   disclaimer:'Real pre-expiry frozen decisions, but no independent time witness, durable production store, calibrated accuracy or verified edge. Never represent as actionable investment advice.'
  };
 }
 function exportSession(){
  return {...snapshot(),format:'CASH_PROSPECTIVE_HASHED_SESSION_V1',
   events:events.map(x=>({...x})),warning:'Hashes are self-generated, not independent trusted timestamps.'};
 }
 return {scan,snapshot,exportSession};
}
module.exports={createProspectiveMonitor};
