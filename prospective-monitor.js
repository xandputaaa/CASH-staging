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
const {prospectiveScorecard}=require('./prospective-scorecard');
const MAX=320,MAX_SETTLEMENT_READS_PER_SCAN=8,SETTLEMENT_CONCURRENCY=4;
const supported=/^KXBTC15M-[A-Za-z0-9-]{6,70}$/;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const clockISO=t=>new Date(t).toISOString();
// Public snapshot exposes only fixed diagnostic codes, never raw API data.
const OUTCOME_REASONS=Object.freeze({
 'Mismatched or missing market':'MARKET_LOOKUP_MISMATCH',
 'Provisional result is not final':'OFFICIAL_RESULT_PROVISIONAL',
 'Official market not settled':'AWAITING_OFFICIAL_FINALIZATION',
 'Official final result contradicts its published numeric settlement fields':'NUMERIC_SETTLEMENT_CONTRADICTION',
 'Public outcome lookup unavailable':'PUBLIC_OUTCOME_LOOKUP_UNAVAILABLE',
 'Official result service unavailable':'PUBLIC_RESULT_SERVICE_UNAVAILABLE',
 'Waiting for second matching finalized public result':'SECOND_FINALIZED_READ_PENDING'
});
function outcomeReason(result){
 if(result?.status==='verified')return 'EVIDENCE_REJECTED';
 return OUTCOME_REASONS[result?.reason]||'UNCONFIRMED_PUBLIC_OUTCOME';
}
function createProspectiveMonitor({quotes,spot,results,brti=null,clock=()=>Date.now(),
 maxRecords=MAX,store=null,settlementReadsPerScan=4}={}){
 if(!quotes||!spot||!results)throw Error('Missing prospective data feeds');
 if(!Number.isInteger(settlementReadsPerScan)||settlementReadsPerScan<1||
    settlementReadsPerScan>MAX_SETTLEMENT_READS_PER_SCAN)
  throw Error('Unsafe prospective settlement read limit');
 const records=[],ids=new Set(),events=[];
 let lastHash='GENESIS',inflight=null,scans=0,lastScanAt=null,failures=0,pendingCursor=0;
 let liveAssessment=null;
 const publicYesAskHistory=[];
 const readiness={lastReason:'NOT_CHECKED',lastMarketId:null,lastCheckedAt:null,
  observedWindowMs:null,checks:0,reasons:{}};
 function noteReadiness(reason,marketId=null,leadMs=null){
  readiness.lastReason=reason;
  readiness.lastMarketId=typeof marketId==='string'?marketId:null;
  readiness.lastCheckedAt=clockISO(clock());
  readiness.observedWindowMs=Number.isFinite(leadMs)?leadMs:null;
  readiness.checks++;
  readiness.reasons[reason]=(readiness.reasons[reason]||0)+1;
 }
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
      p.model!==NAME||!['UNVALIDATED_PROXY_MODEL','UNVALIDATED_BRTI_MODEL'].includes(p.validation)||
      !['YES','NO',null].includes(p.side)||p.realMoneyAuthorized!==false||
      p.calibratedProbability!==null||p.expectedValue!==null||
      !Number.isFinite(Date.parse(p.at))||Date.parse(p.endTime)-Date.parse(p.at)<90000||
      Date.parse(p.endTime)-Date.parse(p.at)>780000||
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
    r.lastOutcomeReason='OFFICIAL_RESULT_ACCEPTED';
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
    // When explicitly opted in to private index use, fail closed if that
    // source is offline; never silently switch back to a proxy model.
    const useIndex=brti?.forecastingEnabled?.()===true;
    const source=useIndex?brti.internal():s;
    const market=q?.marketId||null;
    const lead=q?.endTime?Date.parse(q.endTime)-clock():null;
    // Public quote history is observed-only; never imply this is a
    // Kalshi transaction chart or a known future price movement.
    if(q?.status==='live'&&!q.refreshFailed&&Number.isFinite(q.yesAsk)&&
      q.yesAsk>0&&q.yesAsk<1&&typeof market==='string'){
      const at=Date.parse(q.fetchedAt);
      if(Number.isFinite(at)&&at<=clock()+2000&&clock()-at<=12000&&
       !publicYesAskHistory.some(x=>x.marketId===market&&x.at===q.fetchedAt)){
       publicYesAskHistory.push({marketId:market,at:q.fetchedAt,yesAsk:q.yesAsk});
       if(publicYesAskHistory.length>240)publicYesAskHistory.splice(0,publicYesAskHistory.length-240);
      }
    }
    // Recompute the current settlement hypothesis, independent of frozen
    // research history. This live lean is NEVER scored or counted as
    // a pre-committed outcome. The frozen one-per-market decision is.
    const p=evaluateProspective({quote:q,spot:source,now:clock()});
    liveAssessment={marketId:market,checkedAt:clockISO(clock()),side:p.side||null,
      state:p.state,reason:p.reason,leadMs:lead,
      sourceType:p.indexSourceType||'SINGLE_EXCHANGE_PROXY',
      gapBps:p.indexSourceType==='OFFICIAL_BRTI_LIVE'?null:(p.gapBps??null),
      signalZ:p.indexSourceType==='OFFICIAL_BRTI_LIVE'?null:(p.signalZ??null),
      validation:p.validation};
    if(!market)noteReadiness('KALSHI_QUOTE_MISSING',null,lead);
    else if(ids.has(market))noteReadiness('ALREADY_FROZEN',market,lead);
    else if(records.length>=maxRecords)noteReadiness('JOURNAL_CAPACITY_REACHED',market,lead);
    else{
     noteReadiness(p.reason,market,lead);
     if(p.marketId&&(p.state==='PROVISIONAL_DIRECTION'||
       p.reason==='EDGE_UNCLEAR_VS_VOLATILITY')){
      const frozen={...p};
      append('FORECAST',frozen);
      records.push({...frozen,status:'PENDING',winner:null,resolvedAt:null,outcomeEvidence:null,
        lastOutcomeReason:'NOT_CHECKED_YET',lastOutcomeCheckAt:null,outcomeAttempts:0});
      ids.add(market);created++;if(!p.side)recordedWait++;
     }
    }
   }catch{failures++;noteReadiness('SOURCE_OR_JOURNAL_EXCEPTION');}
   // Bounded, fair catch-up for a durable pending backlog. Each 20-second
   // scan may read up to eight distinct settled markets, in at most four
   // concurrent read-only requests. No winner, source or quote may choose
   // which market is scanned; the existing FIFO cursor is preserved.
   // Resolver still requires TWO matching public reads at least 20s apart.
   const pending=records.filter(x=>x.status==='PENDING'&&Date.parse(x.endTime)<=clock());
   const start=pending.length?pendingCursor%pending.length:0;
   const selected=Array.from({length:Math.min(settlementReadsPerScan,pending.length)},
    (_,i)=>pending[(start+i)%pending.length]);
   pendingCursor=pending.length?(start+selected.length)%pending.length:0;
   // Process each bounded network batch in selection order. Only a verified,
   // fully checked result is appended. Errors never fabricate misses or wins.
   for(let offset=0;offset<selected.length;offset+=SETTLEMENT_CONCURRENCY){
    const batch=selected.slice(offset,offset+SETTLEMENT_CONCURRENCY);
    const lookedUp=await Promise.all(batch.map(async record=>{
     try{return {record,result:await results.lookup({
      venue:'Kalshi',marketId:record.marketId,slug:null})}}
     catch{return {record,error:true}}
    }));
    for(const {record,result,error} of lookedUp){
     record.outcomeAttempts=(record.outcomeAttempts||0)+1;
     record.lastOutcomeCheckAt=clockISO(clock());
     if(error){
      failures++;
      record.lastOutcomeReason='OUTCOME_CHECK_EXCEPTION';
      continue;
     }
     if(result?.status!=='verified'){
      record.lastOutcomeReason=outcomeReason(result);
      continue;
     }
     if(!hasVerifiedEvidence(result,{venue:'Kalshi',
      marketId:record.marketId,endTime:record.endTime,
      targetPriceAtCapture:record.targetPrice})){
      record.lastOutcomeReason='EVIDENCE_REJECTED';
      continue;
     }
     try{
      append('OUTCOME',{marketId:record.marketId,winner:result.winner,evidence:result});
      record.lastOutcomeReason='OFFICIAL_RESULT_ACCEPTED';
      record.winner=result.winner;record.resolvedAt=result.checkedAt;
      record.outcomeEvidence=result;
      record.status=result.winner==='VOID'?'VOID':record.side===null?'WAIT_RESOLVED':
       record.side===result.winner?'HIT':'MISS';
      resolved++;
     }catch{
      failures++;
      record.lastOutcomeReason='OUTCOME_CHECK_EXCEPTION';
     }
    }
   }
   lastScanAt=clockISO(clock());
   return {created,recordedWait,resolved};
  })().finally(()=>{inflight=null});
  return inflight;
 }
 function safeRecord(x){
  if(!x)return null;
  const licensed=x.indexSourceType==='OFFICIAL_BRTI_LIVE';
  return {marketId:x.marketId,at:x.at,endTime:x.endTime,
   side:x.side,reason:x.reason,status:x.status,winner:x.winner,
   outcomeStatus:x.status==='PENDING'?(x.lastOutcomeReason||'NOT_CHECKED_SINCE_RESTART'):x.status,
   leadMs:x.leadMs,model:x.model,validation:x.validation,
   indexSourceType:x.indexSourceType||'SINGLE_EXCHANGE_PROXY',
   // Never redistribute licensed BRTI values, detailed historical points,
   // exchange-auth credentials or settlement index-derived numeric features.
   targetPrice:x.targetPrice,spotPrice:licensed?null:x.spotPrice,
   signalZ:licensed?null:x.signalZ,gapBps:licensed?null:x.gapBps,
   sampleWindowSha256:x.sampleWindowSha256,
   realMoneyAuthorized:false};
 }
 function snapshot(){
  const now=clock();
  // Only an unexpired active contract can be described as the current call.
  const current=records.findLast(x=>x.status==='PENDING'&&
   Number.isFinite(Date.parse(x.endTime))&&Date.parse(x.endTime)>now)||null;
  const predictions=records.filter(x=>x.side==='YES'||x.side==='NO');
  const scored=predictions.filter(x=>x.status==='HIT'||x.status==='MISS');
  const hit=scored.filter(x=>x.status==='HIT').length;
  const scorecard=prospectiveScorecard(records);
  const waiting=records.filter(x=>x.status==='PENDING');
  const expired=waiting.filter(x=>Date.parse(x.endTime)<=now);
  const overdue=expired.filter(x=>now-Date.parse(x.endTime)>=600000);
  const blockedReasons={};
  for(const r of expired){
   const code=r.lastOutcomeReason||'NOT_CHECKED_SINCE_RESTART';
   blockedReasons[code]=(blockedReasons[code]||0)+1;
  }
  const pendingResolutionDiagnostics={
   pendingTotal:waiting.length,notExpired:waiting.length-expired.length,
   expiredAwaitingEvidence:expired.length,overdueTenMinutes:overdue.length,
   blockedReasons,
   warning:'Session-local diagnostics only. Pending does not imply an exchange loss or delay.',
   recentExpired:expired.slice(-8).reverse().map(r=>({
    marketId:r.marketId,side:r.side,expiresAt:r.endTime,
    overdueMinutes:Math.max(0,Math.floor((now-Date.parse(r.endTime))/60000)),
    lastCheckAt:r.lastOutcomeCheckAt||null,attempts:r.outcomeAttempts||0,
    reason:r.lastOutcomeReason||'NOT_CHECKED_SINCE_RESTART'
   }))
  };
  return {
   version:'CASH_PROSPECTIVE_KALSHI_V1',
   updatedAt:clockISO(clock()),
   model:NAME,
   state:records.length>=maxRecords?'CAPACITY_BLOCKED':'COLLECTING_EXPERIMENTAL',
   scans,lastScanAt,failures,
   settlementBackfill:{maxReadsPerScan:settlementReadsPerScan,
    maxConcurrentReads:SETTLEMENT_CONCURRENCY,
    pendingCursorMode:'FIFO_PENDING_MARKET_ROUND_ROBIN',
    twoIndependentReadRequirementUnchanged:true,
    independentlyQualifiedCount:0},
   capacity:{maxRecords,remainingRecords:Math.max(0,maxRecords-records.length),
    automaticRolloverEnabled:false,
    note:'Full journals block new captures but existing forecast and outcome evidence is retained.'},
   captureReadiness:{...readiness,reasons:{...readiness.reasons},
    note:'Repeated readiness checks are diagnostics, not independently frozen contracts.'},
   storage:store?.mode||'VOLATILE_SERVER_SESSION',headHash:lastHash,
   records:records.length,directional:predictions.length,
   waits:records.filter(x=>x.side===null).length,
   sourceBreakdown:{
    officialBrtiFrozen:records.filter(x=>x.indexSourceType==='OFFICIAL_BRTI_LIVE').length,
    proxyFrozen:records.filter(x=>x.indexSourceType!=='OFFICIAL_BRTI_LIVE').length,
    officialBrtiScored:scored.filter(x=>x.indexSourceType==='OFFICIAL_BRTI_LIVE').length,
    proxyScored:scored.filter(x=>x.indexSourceType!=='OFFICIAL_BRTI_LIVE').length
   },
   pending:waiting.length,pendingResolutionDiagnostics,scorecard,
   officiallyScored:scored.length,hits:hit,misses:scored.length-hit,
   voids:records.filter(x=>x.status==='VOID').length,
   hitRate:scored.length?hit/scored.length:null,
   qualifiedCount:0,requiredQualified:100,
   independentlyTimeAttested:false,modelCalibrated:false,
   tradingAuthorized:false,automatedOrdersEnabled:false,
   active:safeRecord(current),
   // Live lean may change: display-only, not an independently frozen call.
   liveAssessment:liveAssessment?.marketId===readiness.lastMarketId?{...liveAssessment}:null,
   publicQuoteChart:{
    kind:'KALSHI_PUBLIC_YES_ASK_SNAPSHOTS',
    description:'Public observed YES ask quotes, not executed trade candles or future prices.',
    marketId:readiness.lastMarketId,
    points:publicYesAskHistory.filter(x=>x.marketId===readiness.lastMarketId).slice(-48)
   },
   latest:safeRecord(records.at(-1)),
   recent:records.slice(-12).reverse().map(safeRecord),
   disclaimer:'Early YES/NO calls target final official 15-minute Kalshi BRTI settlement, not spot or quote ticks. Frozen calls use past-only public BTC proxy and official market strike. Dynamic live assessment is not scored. No independent time witness, durable store, calibration or verified trading edge.'
  };
 }
 function exportSession(){
  if(records.some(x=>x.indexSourceType==='OFFICIAL_BRTI_LIVE'))
   return {...snapshot(),format:'CASH_PROSPECTIVE_REDACTED_COMMITMENTS_V1',
    events:events.map(x=>({type:x.type,sequence:x.sequence,
      recordedAt:x.recordedAt,hash:x.hash,previousHash:x.previousHash})),
    warning:'Licensed BRTI raw data and private model inputs are not publicly exported. Commitments alone cannot reconstruct records or prove independent capture times.'};
  return {...snapshot(),format:'CASH_PROSPECTIVE_HASHED_SESSION_V1',
   events:events.map(x=>({...x})),warning:'Hashes are self-generated, not independent trusted timestamps.'};
 }
 return {scan,snapshot,exportSession};
}
module.exports={createProspectiveMonitor};
