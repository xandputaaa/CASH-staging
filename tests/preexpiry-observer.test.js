'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {verifiedJournal,observeJournal,buildObservation}=require('../preexpiry-observer');
const SHA=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const market='KXBTC15M-26NOV171815-15';
const at='2026-11-17T23:12:00Z',close='2026-11-17T23:15:00Z';
const observed='2026-11-17T23:12:30Z';
function fixture(kind='late',patch={}){
 const model=kind==='late'?'KXBTC15M_LATE_CHECKPOINT_SHADOW_V1':
  'KXBTC15M_SETTLEMENT_EARLY_V3';
 const p={marketId:market,model,side:'YES',at,endTime:close,
  indexSourceType:'SINGLE_EXCHANGE_PROXY',...patch};
 const e={sequence:1,type:'FORECAST',recordedAt:at,payload:p,previousHash:'GENESIS'};
 e.hash=SHA(e);
 return {
  version:kind==='late'?'CASH_LATE_CHECKPOINT_SHADOW_V1':'CASH_PROSPECTIVE_KALSHI_V1',
  format:kind==='late'?'CASH_LATE_CHECKPOINT_UNVERIFIED_HASH_CHAIN_V1':
   'CASH_PROSPECTIVE_HASHED_SESSION_V1',
  headHash:e.hash,events:[e],records:1,pending:1,
  independentQualification:0,qualifiedCount:0,
  independentlyTimeAttested:false,
  realMoneyAuthorized:false,tradingAuthorized:false,
  canExecuteOrders:false,automatedOrdersEnabled:false
 };
}
test('a GitHub observation of an existing frozen model before expiry preserves only public commitments',()=>{
 const e=fixture('early'),l=fixture('late');
 assert.equal(verifiedJournal(e,'early').length,1);
 assert.equal(verifiedJournal(l,'late').length,1);
 const r=buildObservation({early:e,late:l,observedAt:observed,
  runId:'12345',repository:'xandputaaa/CASH-staging',commitSha:'a'.repeat(40)});
 assert.equal(r.frozenEvidence.length,2);
 assert.equal(r.evidenceWitnessedBeforeExpiry,2);
 assert.equal(r.claimedIndependentlyQualifiedCount,0);
 assert.equal(r.realOrdersEnabled,false);
 assert.equal(r.frozenEvidence[0].frozenSide,'YES');
 assert.equal(r.frozenEvidence[1].frozenEventHash,l.events[0].hash);
 assert.equal(r.githubRunId,'12345');
 assert.doesNotMatch(JSON.stringify(r),/sampleWindow|privateKey|spotPrice/);
});
test('a post-expiry or pre-freeze observation is not counted as timely',()=>{
 const l=fixture();
 assert.equal(observeJournal(l,'late',Date.parse('2026-11-17T23:15:01Z')).length,0);
 assert.equal(observeJournal(l,'late',Date.parse('2026-11-17T23:11:59Z')).length,0);
 assert.equal(observeJournal(l,'late',Date.parse('2026-11-17T23:14:50Z')).length,0);
});
test('invalid or altered event hash, sequence, head or orphan outcome fails closed',()=>{
 const bad=fixture();
 bad.events[0].payload.side='NO';
 assert.throws(()=>verifiedJournal(bad,'late'),/checksum/);
 const seq=fixture();seq.events[0].sequence=2;
 assert.throws(()=>verifiedJournal(seq,'late'),/chain/);
 const head=fixture();head.headHash='f'.repeat(64);
 assert.throws(()=>verifiedJournal(head,'late'),/summary/);
 const state=fixture();state.independentlyTimeAttested=true;
 assert.throws(()=>verifiedJournal(state,'late'),/Untrusted/);
});
test('private BRTI research and wrong time windows never receive a public attestation',()=>{
 const b=fixture('late',{indexSourceType:'OFFICIAL_BRTI_LIVE'});
 assert.equal(observeJournal(b,'late',Date.parse(observed)).length,0);
 const wrong=fixture('late',{at:'2026-11-17T23:05:00Z'});
 wrong.events[0].recordedAt=wrong.events[0].payload.at;
 const body={...wrong.events[0]};delete body.hash;
 wrong.events[0].hash=SHA(body);wrong.headHash=wrong.events[0].hash;
 assert.equal(observeJournal(wrong,'late',Date.parse(observed)).length,0);
});
test('missing or malformed public exports report no witnessed predictions, not automatic validation',()=>{
 const r=buildObservation({early:null,late:{version:'BAD'},observedAt:observed});
 assert.equal(r.frozenEvidence.length,0);
 assert.equal(r.sourcesUnavailableOrInvalid.length,2);
 assert.equal(r.claimedIndependentlyQualifiedCount,0);
});
