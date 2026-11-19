'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {verifiedJournal,observeJournal,buildObservation,diagnosePublicEligibility}=require('../preexpiry-observer');
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

function eligibilityFixture(items){
 const journal=fixture('late');
 journal.events=[];let prev='GENESIS';
 for(const [i,patch] of items.entries()){
  const data={...fixture('late').events[0].payload,
   marketId:'KXBTC15M-26NOV1718'+String(i+20).padStart(2,'0')+'-15',
   ...patch};
  const recordedAt=patch.recordedAt||data.at;
  delete data.recordedAt;
  const event={sequence:i+1,type:'FORECAST',recordedAt,
   payload:data,previousHash:prev};
  event.hash=SHA(event);journal.events.push(event);prev=event.hash;
 }
 journal.headHash=prev;journal.records=items.length;journal.pending=items.length;
 return journal;
}
test('public-source diagnostic partitions every verified forecast into exactly one reason',()=>{
 const items=[
  {at:'2026-11-17T23:12:00Z',endTime:'2026-11-17T23:15:00Z'},
  {at:'2026-11-17T23:05:00Z',endTime:'2026-11-17T23:15:00Z'},
  {at:'2026-11-17T23:12:45Z',endTime:'2026-11-17T23:15:45Z'},
  {at:'2026-11-17T23:09:40Z',endTime:'2026-11-17T23:12:40Z'},
  {at:'2026-11-17T23:12:00Z',endTime:'2026-11-17T23:15:00Z',
   recordedAt:'2026-11-17T23:12:10Z'},
  {at:'2026-11-17T23:12:00Z',endTime:'2026-11-17T23:15:00Z',
   indexSourceType:'OFFICIAL_BRTI_LIVE'},
  {at:'NOT_A_DATE',endTime:'2026-11-17T23:15:00Z'}
 ];
 const j=eligibilityFixture(items),t=Date.parse(observed);
 assert.equal(verifiedJournal(j,'late').length,items.length);
 const d=diagnosePublicEligibility(j,'late',t);
 assert.equal(d.status,'VALID_SELF_HASHED_SOURCE_JOURNAL');
 assert.equal(d.forecastCount,7);
 for(const [key,val] of Object.entries(d.reasons))
  assert.equal(val,1,'Expected one '+key);
 assert.equal(Object.values(d.reasons).reduce((sum,n)=>sum+n,0),7);
 assert.equal(d.eligibleBeforeThreeRecordCap,1);
 assert.equal(observeJournal(j,'late',t).length,1);
 assert.equal(d.independentQualifiedCount,0);
 assert.equal(d.ordersEnabled,false);
 assert.doesNotMatch(JSON.stringify(d),/KXBTC15M-|OFFICIAL_BRTI_LIVE|sampleWindow|spotPrice|privateKey/);
});
test('diagnostic mirrors actual original 3-event observation limit rather than claiming unlimited evidence',()=>{
 const items=Array.from({length:6},()=>({
  at:'2026-11-17T23:12:00Z',
  endTime:'2026-11-17T23:15:00Z',
  side:null
 }));
 const journal=eligibilityFixture(items),ts=Date.parse(observed);
 const d=diagnosePublicEligibility(journal,'late',ts);
 assert.equal(d.forecastCount,6);
 assert.equal(d.eligibleBeforeThreeRecordCap,6);
 assert.equal(d.retainedEligibleAfterThreeRecordCap,3);
 assert.equal(d.publicProxyCommitmentsBeyondThreeRecordCap,3);
 assert.equal(observeJournal(journal,'late',ts).length,3);
 assert.equal(d.independentQualifiedCount,0);
});
test('unfetched and corrupted journal diagnostics never pretend eligibility or leak full source inputs',()=>{
 const t=Date.parse(observed);
 const absent=diagnosePublicEligibility(null,'late',t);
 assert.equal(absent.status,'SOURCE_UNAVAILABLE_OR_UNFETCHED');
 assert.equal(absent.forecastCount,null);
 assert.equal(absent.reasons,null);
 const corrupted=fixture('late');
 corrupted.events[0].hash='0'.repeat(64);
 const invalid=diagnosePublicEligibility(corrupted,'late',t);
 assert.equal(invalid.status,'SOURCE_JOURNAL_INVALID');
 assert.equal(invalid.forecastCount,null);
 assert.equal(invalid.reasons,null);
 assert.throws(()=>diagnosePublicEligibility(fixture('late'),'bad',t),/Invalid eligibility/);
 assert.throws(()=>diagnosePublicEligibility(fixture('late'),'late',NaN),/Invalid eligibility/);
});
test('the diagnostic mirrors early-window model timing without rewriting any accepted side or hash',()=>{
 const journal=fixture('early',{
  at:'2026-11-17T23:03:00Z',endTime:'2026-11-17T23:15:00Z'
 });
 journal.events[0].recordedAt=journal.events[0].payload.at;
 const {hash,...body}=journal.events[0];
 journal.headHash=journal.events[0].hash=SHA(body);
 const atEarly=Date.parse('2026-11-17T23:05:00Z');
 const x=diagnosePublicEligibility(journal,'early',atEarly);
 assert.equal(x.reasons.ELIGIBLE_PUBLIC_PROXY_PREEXPIRY,1);
 assert.equal(x.independentQualifiedCount,0);
 assert.equal(observeJournal(journal,'early',atEarly).length,1);
});
