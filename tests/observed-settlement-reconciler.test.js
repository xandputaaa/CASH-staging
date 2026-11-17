'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {validObservation,reconcileWitnesses}=require('../observed-settlement-reconciler');
const sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const ID='KXBTC15M-26NOV171845-45';
const at='2026-11-17T23:41:32.650Z',close='2026-11-17T23:45:00.000Z';
const witnessed='2026-11-17T23:42:30.205Z';
const MODELS={early:'KXBTC15M_SETTLEMENT_EARLY_V3',
 late:'KXBTC15M_LATE_CHECKPOINT_SHADOW_V1'};
function journal(kind,side='YES',winner='YES'){
 const model=MODELS[kind],raw={
  venue:'Kalshi',ticker:ID,status:'finalized',result:winner.toLowerCase(),
  floor_strike:65000,expiration_value:winner==='YES'?'65021.75':'64990.15',
  strike_type:'greater_or_equal',is_provisional:false,settlement_ts:'2026-11-17T23:45:06Z',
  close_time:close
 };
 const detail={marketId:ID,model,side:side==='WAIT'?null:side,at,
  endTime:close,indexSourceType:'SINGLE_EXCHANGE_PROXY',
  ...(kind==='early'?{targetPrice:65000}:{officialStrikeAtFreeze:65000})};
 const forecast={sequence:1,type:'FORECAST',recordedAt:at,
  payload:detail,previousHash:'GENESIS'};
 forecast.hash=sha(forecast);
 const url='https://external-api.kalshi.com/trade-api/v2/markets/'+ID;
 const op=kind==='early'?
  {marketId:ID,winner,evidence:{
   evidenceSnapshot:raw,evidenceSha256:sha(raw),evidenceSourceUrl:url,
   confirmationCount:2,firstObservedAt:'2026-11-17T23:45:21Z',
   checkedAt:'2026-11-17T23:45:43Z'
  }}:
  {marketId:ID,winner,evidenceSnapshot:raw,evidenceSha256:sha(raw),
   evidenceSourceUrl:url,confirmationCount:2,
   firstObservedAt:'2026-11-17T23:45:21Z',
   checkedAt:'2026-11-17T23:45:43Z'};
 const outcome={sequence:2,type:'OUTCOME',recordedAt:'2026-11-17T23:45:43Z',
  payload:op,previousHash:forecast.hash};
 outcome.hash=sha(outcome);
 const obj={
  version:kind==='early'?'CASH_PROSPECTIVE_KALSHI_V1':'CASH_LATE_CHECKPOINT_SHADOW_V1',
  format:kind==='early'?'CASH_PROSPECTIVE_HASHED_SESSION_V1':
   'CASH_LATE_CHECKPOINT_UNVERIFIED_HASH_CHAIN_V1',
  events:[forecast,outcome],records:1,pending:0,
  headHash:outcome.hash,independentlyTimeAttested:false,
  ...(kind==='early'?{qualifiedCount:0,tradingAuthorized:false,
   automatedOrdersEnabled:false}:{independentQualification:0,
    realMoneyAuthorized:false,canExecuteOrders:false})
 };
 return {obj,forecast,outcome};
}
function witness(kind,record,side='YES'){
 return {
  version:'CASH_OFFSERVER_OBSERVATION_V1',
  observationClass:'GITHUB_RUNNER_UTC_CLOCK_PROVISIONAL',
  observedAtRunner:witnessed,githubRunId:'44201690201',
  githubRepo:'xandputaaa/CASH-staging',
  githubCommitSha:'a'.repeat(40),
  frozenEvidence:[{
   model:MODELS[kind],marketId:ID,
   frozenSide:side,frozenAt:at,contractClosesAt:close,
   journalSequence:1,frozenEventHash:record.forecast.hash,
   headHashSeen:record.forecast.hash,publicProxyOnly:true
  }],
  evidenceWitnessedBeforeExpiry:1,
  claimedIndependentlyQualifiedCount:0,realOrdersEnabled:false,calibrated:false
 };
}
test('witnessed YES and later checked public numerical outcome produces provisional match, not certification',()=>{
 const late=journal('late'),w=witness('late',late);
 const r=reconcileWitnesses({witnesses:[w],late:late.obj});
 assert.equal(r.groups.late.directionalWitnessed,1);
 assert.equal(r.groups.late.directionalVerifiedOutcomes,1);
 assert.equal(r.groups.late.hits,1);
 assert.equal(r.groups.late.misses,0);
 assert.equal(r.groups.early.witnessedMarkets,0);
 assert.equal(r.matched[0].state,'OBSERVED_DIRECTIONAL_HIT');
 assert.equal(r.matched[0].settlementEvidenceSha256,late.outcome.payload.evidenceSha256);
 assert.equal(r.independentQualifiedCount,0);
 assert.equal(r.executionVerified,false);
 assert.equal(r.ordersEnabled,false);
});
test('witnessed NO incorrectly predicts an official YES winner: counted as a miss, not excluded',()=>{
 const late=journal('late','NO','YES');
 const r=reconcileWitnesses({witnesses:[witness('late',late,'NO')],late:late.obj});
 assert.equal(r.groups.late.misses,1);
 assert.equal(r.groups.late.hits,0);
 assert.equal(r.groups.late.directionalVerifiedOutcomes,1);
});
test('WAIT is externally observed but never a scored directional win, even after matching a YES outcome',()=>{
 const early=journal('early','WAIT','YES');
 const r=reconcileWitnesses({witnesses:[witness('early',early,'WAIT')],early:early.obj});
 assert.equal(r.groups.early.witnessedMarkets,1);
 assert.equal(r.groups.early.waitsResolved,1);
 assert.equal(r.groups.early.directionalVerifiedOutcomes,0);
 assert.equal(r.groups.early.descriptiveHitRate,null);
 assert.equal(r.groups.early.descriptiveWilson95,null);
});
test('pair both models on the same Kalshi market, but never pool independent qualification',()=>{
 const early=journal('early','WAIT','YES'),late=journal('late','YES','YES');
 const w=witness('early',early,'WAIT');
 w.frozenEvidence.push(witness('late',late).frozenEvidence[0]);
 w.evidenceWitnessedBeforeExpiry=2;
 const r=reconcileWitnesses({witnesses:[w],early:early.obj,late:late.obj});
 assert.equal(r.matched.length,2);
 assert.equal(r.groups.early.waitsResolved,1);
 assert.equal(r.groups.late.hits,1);
 assert.equal(r.independentQualifiedCount,0);
});
test('forecast hash mismatch, witness future or missing historical session never creates a scored hit',()=>{
 const late=journal('late'),w=witness('late',late);
 w.frozenEvidence[0].frozenEventHash='b'.repeat(64);
 const mismatched=reconcileWitnesses({witnesses:[w],late:late.obj});
 assert.equal(mismatched.matched[0].state,'FORECAST_COMMITMENT_NOT_RECONCILED');
 assert.equal(mismatched.groups.late.hits,0);
 const past=witness('late',late);
 past.observedAtRunner='2026-11-17T23:45:01Z';
 assert.throws(()=>validObservation(past),/before expiry/);
 const missing=reconcileWitnesses({witnesses:[witness('late',late)],late:null});
 assert.equal(missing.groups.late.directionalVerifiedOutcomes,0);
 assert.match(missing.blocked.join('|'),/MISSING_LATE_JOURNAL/);
});
test('retroactive or contradictory evidence cannot make a witnessed YES look correct',()=>{
 const wrong=journal('late'),w=witness('late',wrong);
 wrong.outcome.payload.evidenceSnapshot.floor_strike=65000.01;
 wrong.outcome.payload.evidenceSha256=sha(wrong.outcome.payload.evidenceSnapshot);
 wrong.outcome.hash=sha({...wrong.outcome,hash:undefined});
 wrong.obj.events[1]=wrong.outcome;wrong.obj.headHash=wrong.outcome.hash;
 const bad=reconcileWitnesses({witnesses:[w],late:wrong.obj});
 assert.equal(bad.groups.late.hits,0);
 assert.equal(bad.matched[0].state,'OUTCOME_EVIDENCE_REJECTED');
});
test('duplicated GitHub observer reports cannot double count the same contract',()=>{
 const late=journal('late'),w=witness('late',late);
 const r=reconcileWitnesses({witnesses:[w,w],late:late.obj});
 assert.equal(r.groups.late.witnessedMarkets,1);
 assert.equal(r.groups.late.directionalVerifiedOutcomes,1);
});
test('unverified or absent final result stays pending, never counted as a correct call',()=>{
 const late=journal('late'),w=witness('late',late);
 late.obj.events=[late.forecast];late.obj.headHash=late.forecast.hash;
 late.obj.pending=1;
 const r=reconcileWitnesses({witnesses:[w],late:late.obj});
 assert.equal(r.matched[0].state,'OUTCOME_PENDING');
 assert.equal(r.groups.late.directionalVerifiedOutcomes,0);
});
test('no observed evidence means no accuracy metric despite perfect archived market results',()=>{
 const late=journal('late');
 const r=reconcileWitnesses({witnesses:[],late:late.obj});
 assert.equal(r.groups.late.witnessedMarkets,0);
 assert.equal(r.groups.late.directionalVerifiedOutcomes,0);
 assert.equal(r.groups.late.descriptiveHitRate,null);
});
