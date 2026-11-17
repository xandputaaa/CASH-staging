'use strict';
/*
 * Reconcile OFF-SERVER pre-expiry GitHub runner observations with LATER public
 * Kalshi settlement journals. Uses only published public-proxy data.
 * The runner observation is provisional; no automated quality-gate unlock.
 * Does not fetch, modify predictions, issue orders, or read private accounts.
 */
const {createHash}=require('node:crypto');
const {verifiedJournal}=require('./preexpiry-observer');
const {checkKalshiSettlement}=require('./kalshi-settlement-check');
const {wilson95}=require('./prospective-scorecard');
const SHA=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const EXPECTED_REPO='xandputaaa/CASH-staging';
const MODELS={
 KXBTC15M_SETTLEMENT_EARLY_V3:'early',
 KXBTC15M_LATE_CHECKPOINT_SHADOW_V1:'late'
};
const iso=ms=>new Date(ms).toISOString();
function validObservation(w){
 if(!w||w.version!=='CASH_OFFSERVER_OBSERVATION_V1'||
    w.observationClass!=='GITHUB_RUNNER_UTC_CLOCK_PROVISIONAL'||
    w.githubRepo!==EXPECTED_REPO||
    w.claimedIndependentlyQualifiedCount!==0||
    w.calibrated!==false||w.realOrdersEnabled!==false||
    !Array.isArray(w.frozenEvidence)||
    w.evidenceWitnessedBeforeExpiry!==w.frozenEvidence.length||
    !/^\d{8,16}$/.test(String(w.githubRunId))||
    !/^[a-f0-9]{40}$/.test(String(w.githubCommitSha))||
    !Number.isFinite(Date.parse(w.observedAtRunner)))
   throw Error('Invalid external witness envelope');
 const observed=Date.parse(w.observedAtRunner);
 for(const e of w.frozenEvidence){
  if(!e||!MODELS[e.model]||
   !/^KXBTC15M-[A-Za-z0-9-]{6,70}$/.test(e.marketId||'')||
   !['YES','NO','WAIT'].includes(e.frozenSide)||
   !Number.isSafeInteger(e.journalSequence)||e.journalSequence<1||
   !/^[a-f0-9]{64}$/.test(e.frozenEventHash||'')||
   !/^[a-f0-9]{64}$/.test(e.headHashSeen||'')||
   e.publicProxyOnly!==true)
   throw Error('Invalid external forecast witness');
  const frozen=Date.parse(e.frozenAt),close=Date.parse(e.contractClosesAt);
  if(!Number.isFinite(frozen)||!Number.isFinite(close)||
    frozen>observed||close-observed<=15000||frozen>=close)
    throw Error('Forecast not witnessed before expiry');
 }
 return true;
}
function validateSettlement(forecast,outcome,kind){
 if(!outcome)return {state:'OUTCOME_PENDING'};
 if(Date.parse(outcome.recordedAt)<Date.parse(forecast.recordedAt)|| 
    Date.parse(outcome.recordedAt)<Date.parse(forecast.payload.endTime))
  return {state:'OUTCOME_EVIDENCE_REJECTED'};
 const op=outcome.payload,raw=kind==='early'?op?.evidence?.evidenceSnapshot:op?.evidenceSnapshot;
 const evidenceHash=kind==='early'?op?.evidence?.evidenceSha256:op?.evidenceSha256;
 const evidenceUrl=kind==='early'?op?.evidence?.evidenceSourceUrl:op?.evidenceSourceUrl;
 const confirm=kind==='early'?op?.evidence?.confirmationCount:op?.confirmationCount;
 const expectedUrl='https://external-api.kalshi.com/trade-api/v2/markets/'+forecast.payload.marketId;
 const winner=op?.winner;
 if(!raw||!['YES','NO'].includes(winner)||raw.ticker!==forecast.payload.marketId||
    raw.venue!=='Kalshi'||evidenceUrl!==expectedUrl||
    !/^[a-f0-9]{64}$/.test(evidenceHash||'')||
    SHA(raw)!==evidenceHash||confirm!==2)
  return {state:'OUTCOME_EVIDENCE_REJECTED'};
 const numeric=checkKalshiSettlement(raw);
 if(numeric.state!=='NUMERIC_MATCH'||
    raw.result.toUpperCase()!==winner)return {state:'OUTCOME_EVIDENCE_REJECTED'};
 const frozenStrike=kind==='early'?forecast.payload.targetPrice:
   forecast.payload.officialStrikeAtFreeze;
 if(!Number.isFinite(frozenStrike)||
   numeric.strikeCents!==Math.round(frozenStrike*100))
  return {state:'OUTCOME_EVIDENCE_REJECTED'};
 const first=Date.parse(kind==='early'?op?.evidence?.firstObservedAt:op?.firstObservedAt);
 const checked=Date.parse(kind==='early'?op?.evidence?.checkedAt:op?.checkedAt);
 if(!Number.isFinite(first)||!Number.isFinite(checked)||
   first<Date.parse(forecast.payload.endTime)||checked-first<20000)
  return {state:'OUTCOME_EVIDENCE_REJECTED'};
 return {state:'NUMERIC_RESULT_RECHECKED',winner,evidenceSha256:evidenceHash};
}
function reconcileOne(witness,kind,journal){
 // Validate full self-hash chain and source. No partial-journal guesses.
 verifiedJournal(journal,kind);
 const byId=new Map(),outcomes=new Map(),byHash=new Map();
 for(const e of journal.events){
  byHash.set(e.hash,e);
  if(e.type==='FORECAST')byId.set(e.payload.marketId,e);
  if(e.type==='OUTCOME'){
   const arr=outcomes.get(e.payload.marketId)||[];
   arr.push(e);outcomes.set(e.payload.marketId,arr);
  }
 }
 const results=[];
 for(const evidence of witness.frozenEvidence.filter(x=>MODELS[x.model]===kind)){
  const frozen=byId.get(evidence.marketId),observed=Date.parse(witness.observedAtRunner);
  if(!frozen||frozen.hash!==evidence.frozenEventHash||
     frozen.sequence!==evidence.journalSequence||
     !byHash.has(evidence.headHashSeen)||
     Date.parse(byHash.get(evidence.headHashSeen).recordedAt)>observed||
     frozen.payload.model!==evidence.model||
     (frozen.payload.side||'WAIT')!==evidence.frozenSide||
     frozen.payload.at!==evidence.frozenAt||
     frozen.payload.endTime!==evidence.contractClosesAt||
     frozen.payload.indexSourceType!=='SINGLE_EXCHANGE_PROXY'||
     Date.parse(frozen.recordedAt)>observed)
  {
   results.push({model:evidence.model,marketId:evidence.marketId,
    witnessedSide:evidence.frozenSide,state:'FORECAST_COMMITMENT_NOT_RECONCILED'});
   continue;
  }
  const settled=outcomes.get(evidence.marketId)||[];
  if(settled.length>1){
   results.push({model:evidence.model,marketId:evidence.marketId,
    witnessedSide:evidence.frozenSide,state:'DUPLICATE_OUTCOMES_REJECTED'});
   continue;
  }
  const result=validateSettlement(frozen,settled[0],kind);
  const state=result.state!=='NUMERIC_RESULT_RECHECKED'?result.state:
    evidence.frozenSide==='WAIT'?'OBSERVED_WAIT_RESOLVED':
    evidence.frozenSide===result.winner?'OBSERVED_DIRECTIONAL_HIT':'OBSERVED_DIRECTIONAL_MISS';
  results.push({
   model:evidence.model,marketId:evidence.marketId,
   witnessedSide:evidence.frozenSide,
   observedAtRunner:witness.observedAtRunner,
   witnessGitHubRunId:witness.githubRunId,
   observedCommitmentHash:frozen.hash,
   state,
   ...(result.state==='NUMERIC_RESULT_RECHECKED'?
     {publicWinner:result.winner,settlementEvidenceSha256:result.evidenceSha256}: {})
  });
 }
 return results;
}
function reconcileWitnesses({witnesses,early,late}){
 if(!Array.isArray(witnesses))throw Error('Witness artifacts must be an array');
 const sessions={early,late},results=[],seen=new Set(),blocked=[];
 for(const w of witnesses){
  try{validObservation(w)}catch{
   blocked.push('INVALID_WITNESS_ENVELOPE');continue;
  }
  for(const kind of ['early','late']){
   const applicable=w.frozenEvidence.filter(x=>MODELS[x.model]===kind);
   if(!applicable.length)continue;
   if(!sessions[kind]){blocked.push('MISSING_'+kind.toUpperCase()+'_JOURNAL');continue}
   try{
    for(const entry of reconcileOne({...w,frozenEvidence:applicable},kind,sessions[kind])){
     const key=entry.model+':'+entry.marketId;
     if(seen.has(key))continue;
     seen.add(key);
     results.push(entry);
    }
   }catch{blocked.push('INVALID_'+kind.toUpperCase()+'_JOURNAL')}
  }
 }
 const groups={early:{},late:{}};
 for(const [model,kind] of Object.entries(MODELS)){
  const entries=results.filter(x=>x.model===model);
  const hits=entries.filter(x=>x.state==='OBSERVED_DIRECTIONAL_HIT').length,
   misses=entries.filter(x=>x.state==='OBSERVED_DIRECTIONAL_MISS').length;
  groups[kind]={
   witnessedMarkets:entries.length,
   directionalWitnessed:entries.filter(x=>['YES','NO'].includes(x.witnessedSide)).length,
   directionalVerifiedOutcomes:hits+misses,
   hits,misses,
   waitsResolved:entries.filter(x=>x.state==='OBSERVED_WAIT_RESOLVED').length,
   unresolvedOrRejected:entries.filter(x=>!['OBSERVED_DIRECTIONAL_HIT',
    'OBSERVED_DIRECTIONAL_MISS','OBSERVED_WAIT_RESOLVED'].includes(x.state)).length,
   descriptiveHitRate:hits+misses?hits/(hits+misses):null,
   descriptiveWilson95:wilson95(hits,hits+misses)
  };
 }
 return {version:'CASH_PROVISIONAL_EXTERNAL_WITNESS_RECONCILIATION_V1',
  groups,matched:results,blocked,
  independentQualifiedCount:0,
  executionVerified:false,ordersEnabled:false,
  note:'Only compare already-external-observed public-proxy forecasts to self-reported later official-public settlement snapshots. Need independently check GitHub run timestamps, external public exchange records and whether the prediction was recorded prospectively. Not a statistically validated accuracy claim, trading recommendation, executable trade, or certified attestation.'};
}
module.exports={validObservation,validateSettlement,reconcileOne,reconcileWitnesses};
