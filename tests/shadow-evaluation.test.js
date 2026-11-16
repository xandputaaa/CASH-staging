'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {evaluateShadowRecords,wilson95}=require('../shadow-evaluation');
const {proposeSpotMomentum}=require('../spot-momentum');
const t=Date.parse('2026-11-16T20:00:00.000Z');
function candidate(at=t){
 const series=[-100000,-90000,-75000,-60000,-45000,-30000,-15000,0].map((dt,i)=>({
  time:new Date(at+dt).toISOString(),price:86000+i*4,source:'Kraken BTC/USD'}));
 return {...proposeSpotMomentum({status:'live',source:'Kraken BTC/USD',history:series,
  fetchedAt:new Date(at).toISOString()},at),predictedContractSide:'YES'};
}
function record({id='KXBTC15M-TEST123',time=t,status='PENDING',winner=null,spot=true,withEvidence=true}={}){
 return {id:'Kalshi:'+id,venue:'Kalshi',marketId:id,slug:null,serverCapturedAt:new Date(time).toISOString(),
  endTime:new Date(time+150000).toISOString(),leadMs:150000,
  baselineSide:'NO',spotCandidate:spot?candidate(time):null,status,winner,
  outcomeCheckedAt:status==='PENDING'?null:new Date(time+200000).toISOString(),
  outcomeSource:'Kalshi public market result',outcomeEvidence:withEvidence?{
   confirmationCount:2,firstObservedAt:new Date(time+175000).toISOString(),
   evidenceSha256:'a'.repeat(64),evidenceSourceUrl:'https://external-api.kalshi.com/trade-api/v2/markets/'+id,
   evidenceSnapshot:{venue:'Kalshi',ticker:id,status:'settled',result:winner?.toLowerCase()}
  }:null};
}
test('empty evaluation does not invent accuracy or prospective qualifying contracts',()=>{
 const a=evaluateShadowRecords([],{now:t});
 assert.equal(a.total.scored,0);assert.equal(a.total.hitRate,null);
 assert.equal(a.total.wilson95,null);assert.equal(a.total.resultCoverage,null);
 assert.equal(a.qualification.prospectiveIndependentAttested,0);
 assert.equal(a.evaluationState,'INSUFFICIENT_RESOLVED_EVIDENCE');
});
test('pending before expiry, overdue after expiry, and missing candidate remain distinct',()=>{
 const a=evaluateShadowRecords([
  record({id:'KXBTC15M-ONE',time:t}),
  record({id:'KXBTC15M-TWO',time:t-900000}),
  record({id:'KXBTC15M-THREE',time:t,spot:false})
 ],{now:t+10000});
 assert.equal(a.total.captured,3);assert.equal(a.total.candidates,2);
 assert.equal(a.total.withoutCandidate,1);
 assert.equal(a.total.awaitingExpiry,1);
 assert.equal(a.total.unresolvedAfterExpiry,1);
 assert.equal(a.total.overdueWithoutOutcome,1);
 assert.equal(a.total.scored,0);
});
test('two-check evidence can count descriptive candidate hits and misses, not verified qualification',()=>{
 const good=record({id:'KXBTC15M-FOUR',status:'INCORRECT',winner:'YES'});
 const miss=record({id:'KXBTC15M-FIVE',status:'CORRECT',winner:'NO'});
 const evaled=evaluateShadowRecords([good,miss],{now:t+240000,
  verifyOutcome:x=>x.confirmationCount===2});
 assert.equal(evaled.total.scored,2);assert.equal(evaled.total.hits,1);
 assert.equal(evaled.total.misses,1);assert.equal(evaled.total.hitRate,0.5);
 assert.ok(evaled.total.wilson95.lower<0.5&&evaled.total.wilson95.upper>0.5);
 assert.equal(evaled.qualification.independentTimeAttestation,false);
 assert.equal(evaled.qualification.prospectiveIndependentAttested,0);
});
test('without trustworthy public evidence even settled-looking records are excluded',()=>{
 const r=record({status:'CORRECT',winner:'NO',withEvidence:false});
 const evaled=evaluateShadowRecords([r],{now:t+260000,verifyOutcome:()=>false});
 assert.equal(evaled.total.scored,0);
 assert.equal(evaled.total.missingSettlementEvidence,1);
 assert.equal(evaled.total.hitRate,null);
});
test('legacy, forged and inconsistent records cannot manufacture hits',()=>{
 const legacy=record({id:'KXBTC15M-L1',status:'INCORRECT',winner:'YES'});
 delete legacy.spotCandidate.sampleWindow;delete legacy.spotCandidate.sampleWindowSha256;
 const forged=record({id:'KXBTC15M-L2',status:'INCORRECT',winner:'YES'});
 forged.spotCandidate.predictedContractSide='NO';
 const contrad=record({id:'KXBTC15M-L3',status:'CORRECT',winner:'YES'});
 const evaled=evaluateShadowRecords([legacy,forged,contrad],{now:t+260000,verifyOutcome:()=>true});
 assert.equal(evaled.total.legacyWithoutWindow,1);
 assert.equal(evaled.total.invalidCandidate,1);
 assert.equal(evaled.total.missingSettlementEvidence,1);
 assert.equal(evaled.total.scored,0);
});
test('voided contracts and duplicate market identifiers are excluded from accuracy denominator',()=>{
 const voided=record({id:'KXBTC15M-VOID',status:'VOID',winner:'VOID'});
 const duplicate=record({id:'KXBTC15M-VOID',status:'VOID',winner:'VOID'});
 const evaled=evaluateShadowRecords([voided,duplicate],{now:t+260000,verifyOutcome:()=>true});
 assert.equal(evaled.total.voided,1);assert.equal(evaled.total.scored,0);
 assert.equal(evaled.duplicates,1);
});
test('Wilson score interval stays bounded including zero and perfect hit samples',()=>{
 assert.equal(wilson95(0,0),null);
 for(const x of [wilson95(0,1),wilson95(1,1),wilson95(9,10)]){
  assert.ok(x.lower>=0&&x.upper<=1&&x.upper>=x.lower);
 }
});
test('independent venue groups preserve separate denominators and explicit missing outcome categories',()=>{
 const k=record({id:'KXBTC15M-GROUP',status:'INCORRECT',winner:'YES'});
 const p=record({id:'KXBTC15M-DUMMY'});
 p.venue='Polymarket';p.marketId='0x'+'a'.repeat(64);
 p.id='Polymarket:'+p.marketId;p.slug='btc-updown-5m-1794859200';
 p.spotCandidate.predictedContractSide='UP';
 const evaled=evaluateShadowRecords([k,p],{now:t+280000,verifyOutcome:()=>true});
 assert.equal(evaled.venues.Kalshi.scored,1);
 assert.equal(evaled.venues.Polymarket.unresolvedAfterExpiry,1);
 assert.equal(evaled.total.scored,1);
});

test('Kalshi exploratory outcome evidence tracks numeric settlement-rule coverage separately from hits',()=>{
 const r=record({id:'KXBTC15M-NUMERIC',status:'INCORRECT',winner:'YES'});
 r.outcomeEvidence.evidenceSnapshot.floor_strike=86000.11;
 r.outcomeEvidence.evidenceSnapshot.expiration_value=86000.17;
 r.outcomeEvidence.evidenceSnapshot.strike_type='greater_or_equal';
 const report=evaluateShadowRecords([r],{now:t+240000,verifyOutcome:()=>true});
 assert.equal(report.venues.Kalshi.kalshiNumericChecked,1);
 assert.equal(report.venues.Kalshi.kalshiNumericMissing,0);
 assert.equal(report.total.scored,1);
 assert.equal(report.qualification.prospectiveIndependentAttested,0);
});
