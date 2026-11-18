'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {marketEvidenceSnapshot}=require('../resolution-feed');
const {checkDirectFinal,auditDirectFinal,MIN_SEPARATION_MS}=require('../direct-kalshi-final-audit');
const SHA=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const id='KXBTC15M-26NOV171845-45',close='2026-11-17T23:45:00Z';
const now=Date.parse('2026-11-17T23:55:00Z');
function market(x={}){
 return {ticker:id,status:'settled',result:'no',floor_strike:65000,
  expiration_value:64982.31,strike_type:'greater_or_equal',
  close_time:close,settlement_ts:'2026-11-17T23:45:03Z',
  is_provisional:false,...x};
}
function hash(m=market()){return SHA(marketEvidenceSnapshot('Kalshi',{market:m},id,null))}
function entry(overrides={}){
 return {
  model:'KXBTC15M_LATE_CHECKPOINT_SHADOW_V1',marketId:id,
  witnessedSide:'NO',state:'OBSERVED_DIRECTIONAL_HIT',
  publicWinner:'NO',settlementEvidenceSha256:hash(),
  contractClosesAt:close,
  witnessedPaper:{state:'WITNESSED_QUOTED_COUNTERFACTUAL_ONLY',
   observedAsk:.927,netAfterFees:{lower:.063,upper:.0682}},
  ...overrides
 };
}
function report(rows=[entry()]){
 return {version:'CASH_PROVISIONAL_EXTERNAL_WITNESS_RECONCILIATION_V1',
  independentQualifiedCount:0,ordersEnabled:false,executionVerified:false,
  matched:rows,groups:{early:{},late:{}}};
}
test('independent GitHub direct GET verifies numeric final settlement and identical saved public fields',()=>{
 const r=checkDirectFinal(entry(),market(),now);
 assert.equal(r.state,'DIRECT_FINAL_NUMERIC_MATCH');
 assert.equal(r.directWinner,'NO');
 assert.equal(r.publicStrikeCents,6500000);
 assert.equal(r.publicFinalCents,6498231);
 assert.equal(r.matchesServerJournalPublicFields,true);
 assert.equal(r.independentlyQualified,false);
 assert.equal(r.actualFillVerified,false);
 assert.equal(r.ordersEnabled,false);
});
test('direct final source rejects wrong ticker, close time and provisional/unresolved markets',()=>{
 for(const change of [
  [{ticker:'KXBTC15M-OTHER-45'},'DIRECT_FINAL_MARKET_OR_CLOSE_MISMATCH'],
  [{close_time:'2026-11-17T23:50:00Z'},'DIRECT_FINAL_MARKET_OR_CLOSE_MISMATCH'],
  [{status:'active'},'DIRECT_FINAL_NOT_YET_SETTLED'],
  [{is_provisional:true},'DIRECT_FINAL_NOT_YET_SETTLED'],
  [{result:''},'DIRECT_FINAL_NOT_YET_SETTLED'],
  [{settlement_ts:'2026-11-17T23:44:00Z'},'DIRECT_FINAL_SETTLEMENT_TIME_CONFLICT'],
  [{expiration_value:65001},'DIRECT_FINAL_NUMERIC_RULE_UNCONFIRMED'],
  [{result:'yes',expiration_value:65001},'DIRECT_FINAL_WINNER_CONFLICT']
 ]){
  const s=checkDirectFinal(entry(),market(change[0]),now);
  assert.equal(s.state,change[1],JSON.stringify(change[0]));
  assert.equal(s.finalResultCorroborated,undefined);
 }
});
test('missing numeric final values, pre-expiry requests and unavailable API are unverified',()=>{
 assert.equal(checkDirectFinal(entry(),market({expiration_value:null}),now).state,
   'DIRECT_FINAL_NUMERIC_RULE_UNCONFIRMED');
 assert.equal(checkDirectFinal(entry(),null,now).state,'DIRECT_FINAL_API_UNAVAILABLE');
 assert.equal(checkDirectFinal(entry(),market(),Date.parse(close)+15000).state,
   'DIRECT_FINAL_CHECK_TOO_EARLY');
 assert.equal(checkDirectFinal(entry({state:'OUTCOME_PENDING'}),market(),now).state,
   'INVALID_WITNESSED_SETTLEMENT_INPUT');
});
test('two temporally separated identical direct final source reads agree with documented self-journal digest',async()=>{
 let at=now,calls=0;
 const audited=await auditDirectFinal(report(),{
  clock:()=>at,
  delay:async d=>{assert.ok(d>=MIN_SEPARATION_MS);at+=d;},
  fetchImpl:async url=>{
   assert.equal(url,'https://external-api.kalshi.com/trade-api/v2/markets/'+id);
   calls++;
   return {ok:true,text:async()=>JSON.stringify({market:market()})};
  }
 });
 assert.equal(calls,2);
 assert.equal(audited.matched[0].directFinalStatus,'DIRECT_FINAL_TWO_READ_JOURNAL_HASH_MATCH');
 assert.equal(audited.matched[0].directFinal.finalResultCorroborated,true);
 assert.ok(audited.matched[0].directFinal.sourceReadSeparationMs>=20000);
 assert.equal(audited.secondSourceFinalAudit.uniqueMarketsAttempted,1);
 assert.equal(audited.secondSourceFinalAudit.late.secondSourceTwoReadConfirmed,1);
 assert.equal(audited.secondSourceFinalAudit.late.publicFieldsHashMatchesServer,1);
 assert.equal(audited.independentQualifiedCount,0);
 assert.equal(audited.executionVerified,false);
 assert.equal(audited.ordersEnabled,false);
});
test('same direct final winner but altered selected public source fields are clearly separated',async()=>{
 let at=now;
 const changed=entry({settlementEvidenceSha256:'b'.repeat(64)});
 const a=await auditDirectFinal(report([changed]),{
  clock:()=>at,delay:async d=>{at+=d;},
  fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify({market:market()})})
 });
 assert.equal(a.matched[0].directFinalStatus,'DIRECT_FINAL_TWO_READ_NUMERIC_MATCH_FIELDS_DIFFER');
 assert.equal(a.matched[0].directFinal.matchesServerJournalPublicFields,false);
 assert.equal(a.secondSourceFinalAudit.late.numericAgreesButSourceFieldsDiffer,1);
 assert.equal(a.secondSourceFinalAudit.late.publicFieldsHashMatchesServer,0);
});
test('changed direct result between reads is not a verified match even if the second label agrees',async()=>{
 let at=now,calls=0;
 const a=await auditDirectFinal(report(),{
  clock:()=>at,delay:async d=>{at+=d;},
  fetchImpl:async()=>{
   calls++;
   const raw=calls===1?market():market({settlement_ts:'2026-11-17T23:46:00Z'});
   return {ok:true,text:async()=>JSON.stringify({market:raw})};
  }
 });
 assert.equal(calls,2);
 assert.equal(a.matched[0].directFinalStatus,'DIRECT_FINAL_PUBLIC_SOURCE_CHANGED');
 assert.equal(a.secondSourceFinalAudit.late.secondSourceTwoReadConfirmed,0);
 assert.equal(a.secondSourceFinalAudit.late.contestedOrUnavailable,1);
});
test('separate reads without 20 seconds elapsed cannot certify finality',async()=>{
 let at=now;
 const a=await auditDirectFinal(report(),{
  clock:()=>at,delay:async()=>{},
  fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify({market:market()})})
 });
 assert.equal(a.matched[0].directFinalStatus,'DIRECT_FINAL_READS_TOO_CLOSE');
 assert.equal(a.secondSourceFinalAudit.late.secondSourceTwoReadConfirmed,0);
});
test('API errors and after-close official result not yet settled stay visible as uncorroborated',async()=>{
 const a=await auditDirectFinal(report(),{
  clock:()=>now,delay:async()=>{throw Error('Should not sleep for unavailable result')},
  fetchImpl:async()=>{throw Error('Network unavailable')}
 });
 assert.equal(a.matched[0].directFinalStatus,'DIRECT_FINAL_API_UNAVAILABLE');
 assert.equal(a.secondSourceFinalAudit.late.contestedOrUnavailable,1);
 assert.equal(a.secondSourceFinalAudit.late.secondSourceTwoReadConfirmed,0);
});
test('both early and late on same market reuse network fetch but compare each own final claim',async()=>{
 let at=now,calls=0;
 const original=entry();
 const early=entry({model:'KXBTC15M_SETTLEMENT_EARLY_V3',
  publicWinner:'YES',state:'OBSERVED_DIRECTIONAL_MISS',
  settlementEvidenceSha256:'e'.repeat(64)});
 const a=await auditDirectFinal(report([original,early]),{
  clock:()=>at,delay:async d=>{at+=d;},
  fetchImpl:async()=>{
   calls++;
   return {ok:true,text:async()=>JSON.stringify({market:market()})}
  }
 });
 assert.equal(calls,2);
 assert.equal(a.matched[0].directFinalStatus,'DIRECT_FINAL_TWO_READ_JOURNAL_HASH_MATCH');
 assert.equal(a.matched[1].directFinalStatus,'DIRECT_FINAL_COHORT_RESULT_OR_CLOSE_CONFLICT');
 assert.equal(a.secondSourceFinalAudit.early.secondSourceTwoReadConfirmed,0);
 assert.equal(a.secondSourceFinalAudit.late.secondSourceTwoReadConfirmed,1);
});
test('WAIT records, pending claims and quote-only observations are never sent to direct final auditing',async()=>{
 let calls=0;
 const a=await auditDirectFinal(report([{model:'KXBTC15M_LATE_CHECKPOINT_SHADOW_V1',
  marketId:id,witnessedSide:'WAIT',state:'OBSERVED_WAIT_RESOLVED'},
  {model:'KXBTC15M_LATE_CHECKPOINT_SHADOW_V1',
   marketId:id,witnessedSide:'YES',state:'OUTCOME_PENDING'}]),{
  fetchImpl:async()=>{calls++;throw Error('Must not read')}
 });
 assert.equal(calls,0);
 assert.equal(a.matched[0].directFinalStatus,'NOT_A_SCORED_DIRECTIONAL_SETTLEMENT');
 assert.equal(a.matched[1].directFinalStatus,'NOT_A_SCORED_DIRECTIONAL_SETTLEMENT');
 assert.equal(a.secondSourceFinalAudit.uniqueMarketsAttempted,0);
});
test('max 12 markets audited per workflow with no hidden normalization of unresolved data',async()=>{
 const a=await auditDirectFinal(report(Array.from({length:14},(_,i)=>entry({
  marketId:'KXBTC15M-TEST-'+String(i).padStart(6,'0'),
  contractClosesAt:close
 }))),{
  maxMarkets:12,clock:()=>now,
  fetchImpl:async()=>{throw Error('Offline')}
 });
 assert.equal(a.secondSourceFinalAudit.uniqueMarketsAttempted,12);
 assert.equal(a.secondSourceFinalAudit.late.contestedOrUnavailable,14);
 assert.equal(a.secondSourceFinalAudit.late.secondSourceTwoReadConfirmed,0);
});
