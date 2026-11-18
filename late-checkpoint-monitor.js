'use strict';
/*
 * CASH LATE CHECKPOINT — intentionally separate from the frozen early V3.
 * Fixed research rule: first eligible observation 2m30s–3m30s before KXBTC15M
 * close; use unchanged V3 volatility guard, official strike and past-only
 * BTC history. WAIT is frozen too. Never retune after viewing outcomes.
 * This is NOT independent validation, an early-trade recommendation, or a
 * probability forecast. State lives in RAM until persistent storage approved.
 */
const {createHash}=require('node:crypto');
const {evaluateProspective}=require('./kalshi-prospective-model');
const {hasVerifiedEvidence}=require('./shadow-monitor');
const {checkKalshiSettlement}=require('./kalshi-settlement-check');
const {prospectiveScorecard}=require('./prospective-scorecard');
const {paperSummary,oneContractPaper}=require('./paper-execution-audit');
const {verifyLateCheckpointChain}=require('./late-checkpoint-store');
const NAME='KXBTC15M_LATE_CHECKPOINT_SHADOW_V1';
const MIN_LEAD_MS=150000,MAX_LEAD_MS=210000,MAX_RECORDS=160;
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const iso=ms=>new Date(ms).toISOString();
const ID=/^KXBTC15M-[A-Za-z0-9-]{6,70}$/;
function createLateCheckpointMonitor({quotes,spot,results,brti=null,feeFeed=null,clock=()=>Date.now(),
 maxRecords=MAX_RECORDS,store=null}={}){
 if(!quotes||!spot||!results)throw Error('Late checkpoint requires three read-only sources');
 const bootAt=iso(clock()),records=[],events=[],seen=new Set(),missed=new Set();
 let headHash='GENESIS',inflight=null,scans=0,failures=0,lastReason='NOT_CHECKED',pendingCursor=0;
 let replayedForecasts=0;
 if(store){
  if(!Array.isArray(store.events)||typeof store.append!=='function')
   throw Error('Late checkpoint store interface invalid');
  const replay=verifyLateCheckpointChain(store.events);
  if(replay.forecasts>maxRecords)
   throw Error('Stored late research already exceeds configured market cap');
  for(const e of store.events){
   if(e.type==='FORECAST'){
    const p=structuredClone(e.payload);
    records.push({...p,status:'PENDING',winner:null,
     outcomeCheckedAt:null,outcomeReason:'RESTORED_PENDING_UNVERIFIED',
     outcomeAttempts:0});
    seen.add(p.marketId);
   }else{
    const p=e.payload,r=records.find(x=>x.marketId===p.marketId);
    if(!r||r.status!=='PENDING')throw Error('Late saved outcome replay order invalid');
    r.winner=p.winner;
    r.status=p.winner==='VOID'?'VOID':r.side===null?
     'WAIT_RESOLVED':r.side===p.winner?'HIT':'MISS';
    r.outcomeCheckedAt=p.checkedAt;
    r.outcomeReason='RESTORED_PREVIOUSLY_ACCEPTED_OUTCOME';
    r.outcomeAttempts=1;
   }
   events.push(structuredClone(e));headHash=e.hash;
  }
  replayedForecasts=replay.forecasts;
 }

 function append(type,payload){
  const body={sequence:events.length+1,recordedAt:iso(clock()),type,payload,previousHash:headHash};
  const e={...body,hash:sha(body)};
  if(store)store.append(e);
  events.push(e);headHash=e.hash;return e;
 }
 function stage(quote,source,seriesFees){
  const now=clock(),marketId=quote?.marketId,expires=Date.parse(quote?.endTime);
  const lead=expires-now;
  if(!ID.test(marketId||'')){lastReason='NO_ELIGIBLE_KALSHI_MARKET';return}
  if(seen.has(marketId)){lastReason='ALREADY_FROZEN';return}
  if(!Number.isFinite(expires)){lastReason='MISSING_MARKET_EXPIRY';return}
  if(lead>MAX_LEAD_MS){lastReason='BEFORE_LATE_CHECKPOINT';return}
  if(lead<MIN_LEAD_MS){
   if(!missed.has(marketId)&&missed.size<MAX_RECORDS)missed.add(marketId);
   lastReason='LATE_CHECKPOINT_MISSED';
   return;
  }
  if(records.length>=maxRecords){lastReason='LATE_JOURNAL_FULL';return}
  // The only source of a side is V3's pre-existing, frozen parameter formula.
  // Invalid data must not become a synthetic WAIT entry.
  const p=evaluateProspective({quote,spot:source,now});
  if(p.marketId!==marketId||
   !['PROVISIONAL_DIRECTION','WAIT'].includes(p.state)||
   !['STRIKE_GAP_EXCEEDS_VOLATILITY_AND_PROXY_BUFFER',
     'EDGE_UNCLEAR_VS_VOLATILITY'].includes(p.reason)){
   lastReason='PRECHECK_'+String(p.reason||'NOT_READY').replace(/[^A-Z0-9_]/g,'').slice(0,70);
   return;
  }
  // Keep only commitments and a source class; no licensed index prices,
  // samples, Kalshi private records, executable prices, or account identifiers.
  const captured={
   marketId,model:NAME,referenceModel:p.model,
   sourceType:p.indexSourceType,indexSourceType:p.indexSourceType,
   at:p.at,endTime:p.endTime,leadMs:p.leadMs,side:p.side,
   // Immutable Kalshi public strike; never a licensed live BRTI value.
   officialStrikeAtFreeze:p.targetPrice,strikeTypeAtFreeze:quote.strikeType,
   inputCommitment:p.inputSha256,sampleCommitment:p.sampleWindowSha256,
   // All asks are public; they are NOT order fills. Frozen with forecast
   // so future prices and revised fees can never be backfilled.
   publicAskAtFreeze:{YES:p.observedAsks.YES,NO:p.observedAsks.NO},
   publicAskQuoteFetchedAt:p.quoteFetchedAt,
   feeScheduleAtFreeze:seriesFees?.state==='SERIES_METADATA_LIVE'&&
    ['quadratic','quadratic_with_maker_fees'].includes(seriesFees.feeType)&&
    Number.isFinite(seriesFees.feeMultiplier)&&seriesFees.feeMultiplier>=0?
    {source:'KALSHI_PUBLIC_SERIES_API',feeType:seriesFees.feeType,
     multiplier:seriesFees.feeMultiplier,refreshedAt:seriesFees.refreshedAt}:null,
   validation:'UNVALIDATED_LATE_CHECKPOINT',realMoneyAuthorized:false,
   calibratedProbability:null,expectedValue:null
  };
  append('FORECAST',captured);
  records.push({...captured,status:'PENDING',winner:null,
   outcomeCheckedAt:null,outcomeReason:'NOT_YET_CHECKED',outcomeAttempts:0});
  seen.add(marketId);lastReason=captured.side?'FROZEN_DIRECTION':'FROZEN_WAIT';
 }
 async function settle(){
  const expired=records.filter(x=>x.status==='PENDING'&&Date.parse(x.endTime)<=clock());
  // Rotate pending checks so four slow/provisional markets never starve later ones.
  const start=expired.length?pendingCursor%expired.length:0;
  const selected=Array.from({length:Math.min(4,expired.length)},(_,i)=>expired[(start+i)%expired.length]);
  pendingCursor=expired.length?(start+selected.length)%expired.length:0;
  for(const r of selected){
   try{
    const x=await results.lookup({venue:'Kalshi',marketId:r.marketId,slug:null});
    r.outcomeAttempts++;
    r.outcomeCheckedAt=iso(clock());
    if(x?.status!=='verified'){r.outcomeReason='OFFICIAL_RESULT_NOT_YET_VERIFIED';continue}
    if(!hasVerifiedEvidence(x,{venue:'Kalshi',marketId:r.marketId,
       endTime:r.endTime,targetPriceAtCapture:null})){
     r.outcomeReason='OFFICIAL_EVIDENCE_REJECTED';continue;
    }
    // A settled label alone is insufficient: verify its published
    // numerical payout rule AND the exact strike frozen before close.
    // Without this, an altered strike could be scored as an easy 'hit'.
    const numeric=checkKalshiSettlement(x.evidenceSnapshot);
    if(x.winner!=='VOID'&&numeric.state!=='NUMERIC_MATCH'){
     r.outcomeReason='OFFICIAL_NUMERIC_RULE_UNCONFIRMED';continue;
    }
    if(x.winner!=='VOID'&&
       (!Number.isFinite(r.officialStrikeAtFreeze)||
        numeric.strikeCents!==Math.round(r.officialStrikeAtFreeze*100)||
        r.strikeTypeAtFreeze!=='greater_or_equal')){
     r.outcomeReason='FROZEN_STRIKE_CHANGED_OR_MISSING';continue;
    }
    const p={
     marketId:r.marketId,winner:x.winner,checkedAt:x.checkedAt,
     firstObservedAt:x.firstObservedAt,evidenceSha256:x.evidenceSha256,
     evidenceSourceUrl:x.evidenceSourceUrl,confirmationCount:2,
     numericRuleStatus:numeric.state,
     // The exchange PUBLIC settlement evidence is included for
     // independently reproducible source checks for public-proxy research.
     // Keep licensed live-index cohort's settlement data commitment-only.
     ...(r.sourceType!=='OFFICIAL_BRTI_LIVE'?
       {evidenceSnapshot:x.evidenceSnapshot}: {})
    };
    append('OUTCOME',p);
    r.winner=x.winner;r.status=x.winner==='VOID'?'VOID':r.side===null?
     'WAIT_RESOLVED':r.side===x.winner?'HIT':'MISS';
    r.outcomeReason='OFFICIAL_RESULT_ACCEPTED';
   }catch{
    failures++;r.outcomeReason='PUBLIC_OUTCOME_SOURCE_ERROR';
   }
  }
 }
 async function scan(){
  if(inflight)return inflight;
  inflight=(async()=>{
   scans++;
   try{
    const [quote,reference,seriesFees]=await Promise.all([
     quotes.query('Kalshi'),spot.update(),
     feeFeed?.query?feeFeed.query().catch(()=>null):Promise.resolve(null)
    ]);
    const useBrti=brti?.forecastingEnabled?.()===true;
    stage(quote,useBrti?brti.internal():reference,seriesFees);
   }catch{failures++;lastReason='SOURCE_OR_COLLECTION_ERROR'}
   await settle();
   return snapshot();
  })().finally(()=>{inflight=null});
  return inflight;
 }
 function snapshot(){
  const now=clock(),summaries=prospectiveScorecard(records),
    paperEconomics=paperSummary(records);
  const pending=records.filter(r=>r.status==='PENDING');
  const latest=records.at(-1);
  return {
   version:'CASH_LATE_CHECKPOINT_SHADOW_V1',model:NAME,
   referenceModel:'KXBTC15M_SETTLEMENT_EARLY_V3',bootAt,scans,failures,
   lastReason,storage:store?.mode||'VOLATILE_SERVER_SESSION',headHash,
   replayedForecasts,
   checkpointLeadWindowMs:{min:MIN_LEAD_MS,max:MAX_LEAD_MS},
   windowMissedMarketIds:missed.size,records:records.length,
   pending:pending.length,expiredPending:pending.filter(r=>Date.parse(r.endTime)<=now).length,
   scorecard:summaries,paperEconomics,
   latest:latest?{
    marketId:latest.marketId,at:latest.at,endTime:latest.endTime,
    side:latest.side,status:latest.status,sourceType:latest.sourceType,
    outcomeReason:latest.outcomeReason,
    paperQuote:oneContractPaper(latest)
   }:null,
   recent:records.slice(-8).reverse().map(r=>({
    marketId:r.marketId,at:r.at,side:r.side,status:r.status,
    winner:r.winner,sourceType:r.sourceType,outcomeReason:r.outcomeReason,
    paperQuote:oneContractPaper(r)
   })),
   independentQualification:0,requiredQualification:100,
   independentlyTimeAttested:false,calibrated:false,
   canExecuteOrders:false,realMoneyAuthorized:false,
   disclaimer:'Research-only late checkpoint. Frozen YES/NO/WAIT is never altered; observed public asks and series fee multipliers support only hypothetical one-contract conditional outcomes, not verified fills, execution or market depth. Self-hashed RAM records cannot prove independent accuracy. No model selection or trading edge established.'
  };
 }
 function exportSession(){
  return {...snapshot(),format:'CASH_LATE_CHECKPOINT_UNVERIFIED_HASH_CHAIN_V1',
   events:events.map(x=>({...x})),
   warning:'Self-generated hashes are not independent timestamps. Private BRTI numerical inputs are not exported; without an approved mounted persistent audit directory, history resets on service restart. Even mounted file replay does not reconstruct missed windows, runner witness timestamps or model calibration.'};
 }
 return {scan,snapshot,exportSession};
}
module.exports={createLateCheckpointMonitor,NAME,MIN_LEAD_MS,MAX_LEAD_MS};
