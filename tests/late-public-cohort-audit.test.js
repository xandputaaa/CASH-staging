'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {compareCohorts}=require('../late-public-cohort-audit');
const early='KXBTC15M_SETTLEMENT_EARLY_V3';
const late='KXBTC15M_LATE_CHECKPOINT_SHADOW_V1';
const MARKET='KXBTC15M-26NOV182330-30',SECOND='KXBTC15M-26NOV190000-00';
const HASH='a'.repeat(64),HASH2='b'.repeat(64);
const CLOSE='2026-11-19T04:30:00.000Z',BEFORE='2026-11-19T04:26:52.317Z';
const defaultDurable=(overrides={})=>({
 source:'durable',model:early,marketId:MARKET,
 hash:HASH,side:'WAIT',close:CLOSE,observedAt:BEFORE,
 githubRunId:'44457895139',directPublicKalshiMatched:true,
 ...overrides
});
const defaultLegacy=(overrides={})=>({
 source:'ledger',model:early,marketId:MARKET,
 hash:HASH,side:'WAIT',close:CLOSE,directFinal:false,
 paperPriced:false,winner:null,netConservativeUSD:null,...overrides
});
const run=(durableRows=[],legacyRows=[],runs=0)=>compareCohorts({
 durableRows,legacyRows,durableRunCount:runs,legacyFiles:legacyRows.length
});
test('empty archives never manufacture predictions, fills or a validated accuracy rate',()=>{
 const x=run();
 assert.equal(x.durable.originalArchiveRuns,0);
 assert.equal(x.distinctUnion.uniqueKalshiContracts,0);
 assert.equal(x.independentlyQualifiedCount,0);
 assert.equal(x.validationGateMet,false);
 assert.equal(x.tradeFillsVerified,0);
 assert.equal(x.realMoneyOrdersAllowed,false);
});
test('real archive-shaped model/contract dedup: four original runs are not four distinct forecast contracts',()=>{
 const d=[
  defaultDurable({githubRunId:'44457000598'}),
  defaultDurable({githubRunId:'44457895139'}),
  defaultDurable({githubRunId:'44458119634'}),
  defaultDurable({model:late,hash:HASH2,githubRunId:'44458119634'}),
  defaultDurable({model:early,marketId:SECOND,hash:'c'.repeat(64),
    githubRunId:'44461104333'})
 ];
 const x=run(d,[],4);
 assert.equal(x.durable.originalArchiveRuns,4);
 assert.equal(x.durable.runsWithAReadableFrozenDecision,4);
 assert.equal(x.durable.totalModelMarketDecisions,3);
 assert.equal(x.durable.uniqueKalshiContracts,2);
 assert.equal(x.durable.earlyWait,2);
 assert.equal(x.durable.lateWait,1);
 assert.equal(x.distinctUnion.uniqueKalshiContracts,2);
 assert.equal(x.independentlyQualifiedCount,0);
});
test('identical scheduled settlement-ledger record matches durable original frozen hash without double counting',()=>{
 const x=run([defaultDurable()],[defaultLegacy()],1);
 assert.equal(x.overlap.identicalFrozenCommitments,1);
 assert.equal(x.overlap.durableOnlyModelMarketDecisions,0);
 assert.equal(x.overlap.scheduledLedgerOnlyModelMarketDecisions,0);
 assert.equal(x.distinctUnion.totalModelMarketDecisions,1);
 assert.equal(x.distinctUnion.uniqueKalshiContracts,1);
});
test('WAIT can never become a settled win or priced hypothetical trade',()=>{
 for(const invalid of [
  defaultLegacy({directFinal:true}),
  defaultLegacy({paperPriced:true}),
  defaultLegacy({paperPriced:true,directFinal:true})
 ]){
  assert.throws(()=>run([defaultDurable()],[invalid],1),
   /Invalid immutable public cohort/);
 }
 const x=run([defaultDurable()],[defaultLegacy()],1);
 assert.equal(x.overlap.durableDirectionalWithSeparateScheduledTwoReadFinal,0);
 assert.equal(x.scheduledLegacy.directionalWithSeparateDirectFinal,0);
});
test('a later legacy direct final for the SAME original YES counts once and never activates orders',()=>{
 const direct=defaultDurable({model:late,side:'YES',hash:HASH2});
 const final=defaultLegacy({model:late,side:'YES',hash:HASH2,
  directFinal:true,paperPriced:true,winner:'YES',netConservativeUSD:0.015});
 const x=run([direct,direct],[final],1);
 assert.equal(x.overlap.identicalFrozenCommitments,1);
 assert.equal(x.overlap.durableDirectionalWithSeparateScheduledTwoReadFinal,1);
 assert.equal(x.overlap.precloseMarketMatchedAndSeparateFinal,1);
 assert.equal(x.scheduledLegacy.directionalWithSeparateDirectFinal,1);
 assert.equal(x.distinctUnion.lateDirectional,1);
 assert.equal(x.independentlyQualifiedCount,0);
 assert.equal(x.validationGateMet,false);
});
test('if original directional observation lacks published final, it remains unscored',()=>{
 const x=run([defaultDurable({model:late,side:'NO',hash:HASH2})],
  [defaultLegacy({model:late,side:'NO',hash:HASH2})],1);
 assert.equal(x.overlap.durableDirectionalAwaitingSeparateFinal,1);
 assert.equal(x.scheduledLegacy.directionalWithSeparateDirectFinal,0);
 assert.equal(x.distinctUnion.lateDirectional,1);
});
test('a same-market early and late forecast are two frozen model decisions but ONE independent Kalshi contract',()=>{
 const x=run([
  defaultDurable(),
  defaultDurable({model:late,side:'YES',hash:HASH2})
 ],[],1);
 assert.equal(x.distinctUnion.totalModelMarketDecisions,2);
 assert.equal(x.distinctUnion.uniqueKalshiContracts,1);
 assert.equal(x.durable.earlyWait,1);
 assert.equal(x.durable.lateDirectional,1);
});
test('cross-archive market identity conflicts fail closed instead of selecting later correct side',()=>{
 for(const fields of [
  {side:'YES',directFinal:true,winner:'YES'},{hash:'e'.repeat(64)},
  {close:'2026-11-19T04:45:00Z'}
 ]){
  const x=defaultLegacy(fields);
  assert.throws(()=>run([defaultDurable()],[x],1),
    /conflicts with scheduled settled ledger/);
 }
});
test('conflicting repeated original observations within archive fail before scoring',()=>{
 assert.throws(()=>run([
  defaultDurable(),defaultDurable({side:'NO'})
 ],[],1),/Conflicting frozen forecast identity/);
 assert.throws(()=>run([
  defaultDurable(),defaultDurable({hash:'f'.repeat(64)})
 ],[],1),/Conflicting frozen forecast identity/);
});
test('incomplete and older ledger-only directional records remain present but never treated as new durable proofs',()=>{
 const l=[
  defaultLegacy({model:late,side:'YES',hash:HASH2,
   directFinal:true,paperPriced:false,winner:'YES'}),
  defaultLegacy({model:late,marketId:SECOND,side:'NO',
   hash:'9'.repeat(64),directFinal:false})
 ];
 const x=run([],l,0);
 assert.equal(x.overlap.identicalFrozenCommitments,0);
 assert.equal(x.overlap.scheduledLedgerOnlyModelMarketDecisions,2);
 assert.equal(x.scheduledLegacy.directionalWithSeparateDirectFinal,1);
 assert.equal(x.scheduledLegacy.directionalWithoutDirectFinal,1);
 assert.equal(x.durable.lateDirectional,0);
 assert.equal(x.distinctUnion.uniqueKalshiContracts,2);
});
test('wrong model/source/market, postexpiry runner timestamp and invented ledger paper are rejected',()=>{
 for(const fields of [
  {source:'ledger'},{model:'KXBTC5M'}, {marketId:'../attack'},
  {observedAt:CLOSE},{hash:'bad'},{githubRunId:'../../'}
 ]){
  assert.throws(()=>run([defaultDurable(fields)],[],1),
   /Invalid immutable public cohort/);
 }
 assert.throws(()=>run([], [defaultLegacy({paperPriced:true})],0),
  /Invalid immutable public cohort/);
});
test('malformed denominators cannot be used to fabricate independent records',()=>{
 assert.throws(()=>compareCohorts({durableRunCount:1,
  durableRows:[defaultDurable()],legacyRows:[],legacyFiles:1}),
  /Legacy scheduled ledger count/);
 assert.throws(()=>compareCohorts({
  durableRows:[defaultDurable()],durableRunCount:0,legacyFiles:0
 }),/denominator inconsistency/);
 assert.throws(()=>compareCohorts({durableRunCount:-1}),/Invalid original archive/);
});
test('existing cross-archive workflow runs the real committed branches in read-only mode on PR and daily',()=>{
 const file=path.join(__dirname,'..','.github','workflows',
  'cross-archive-identity-audit.yml');
 const y=fs.readFileSync(file,'utf8');
 assert.match(y,/ref: cash-late-public-witness/);
 assert.match(y,/path: durable/);
 assert.match(y,/ref: cash-public-evidence-ledger/);
 assert.match(y,/path: witnesses/);
 assert.match(y,/node source\/late-public-cohort-audit\.js durable witnesses/);
 assert.match(y,/persist-credentials: false/);
 assert.match(y,/  schedule:\s*\n/);
 assert.match(y,/contents: read/);
 assert.doesNotMatch(y,/contents: write/);
});

test('synthetic eight verified directional finals show hits distinct from fee-negative correct predictions',()=>{
 const net=[-0.005,0.046,0.013,-0.008,0.017,0.019,-0.004,-0.009];
 const records=net.map((p,i)=>defaultLegacy({
  model:late,marketId:'KXBTC15M-26NOV18'+
   String(i+1).padStart(2,'0')+'45-45',
  hash:String(i+1).repeat(64),side:i%2?'NO':'YES',
  winner:i%2?'NO':'YES',directFinal:true,
  paperPriced:true,netConservativeUSD:p
 }));
 const x=run([],records,0);
 assert.equal(x.scheduledLegacy.lateDirectionalPublishedFinals,8);
 assert.equal(x.scheduledLegacy.lateDirectionalPublishedHits,8);
 assert.equal(x.scheduledLegacy.lateDirectionalPublishedMisses,0);
 assert.equal(x.scheduledLegacy.lateDirectionalPricedCounterfactuals,8);
 assert.equal(x.scheduledLegacy.lateCorrectButNonpositiveConservativePaper,4);
 assert.equal(x.scheduledLegacy.lateConservativeHypotheticalNetUSD,0.069);
 assert.equal(x.durable.lateDirectional,0);
 assert.equal(x.distinctUnion.uniqueKalshiContracts,8);
 assert.equal(x.independentlyQualifiedCount,0);
});
test('a failed verified result counts a miss and negative hypothetical paper without being discarded',()=>{
 const x=run([],[
  defaultLegacy({model:late,side:'YES',winner:'NO',
   directFinal:true,paperPriced:true,
   netConservativeUSD:-0.44})
 ],0);
 assert.equal(x.scheduledLegacy.lateDirectionalPublishedHits,0);
 assert.equal(x.scheduledLegacy.lateDirectionalPublishedMisses,1);
 assert.equal(x.scheduledLegacy.lateConservativeHypotheticalNetUSD,-0.44);
});
test('inconsistent winner or missing conditional paper economics fails closed',()=>{
 assert.throws(()=>run([],[defaultLegacy({
  model:late,side:'YES',directFinal:true,winner:null})],0),
 /Invalid immutable public cohort/);
 assert.throws(()=>run([],[defaultLegacy({
  model:late,side:'YES',winner:'YES',directFinal:true,
  paperPriced:true,netConservativeUSD:null})],0),
 /Invalid immutable public cohort/);
});

test('same real GitHub close instant with and without .000Z is one matched prospective commitment',()=>{
 const market='KXBTC15M-26NOV190300-00';
 const hash='82deefb637ee4613da18416de6179e9ab2725bf6f2bcded5a696934282d1685a';
 const durable=defaultDurable({
  model:late,marketId:market,side:'YES',hash,
  close:'2026-11-19T08:00:00Z',
  observedAt:'2026-11-19T07:56:33.094Z',
  githubRunId:'44483220349'
 });
 const ledger=defaultLegacy({
  model:late,marketId:market,side:'YES',hash,
  close:'2026-11-19T08:00:00.000Z',
  winner:'YES',directFinal:true,paperPriced:true,netConservativeUSD:0.007
 });
 const x=run([durable],[ledger],1);
 assert.equal(x.overlap.identicalFrozenCommitments,1);
 assert.equal(x.overlap.durableDirectionalWithSeparateScheduledTwoReadFinal,1);
 assert.equal(x.distinctUnion.uniqueKalshiContracts,1);
 assert.equal(x.scheduledLegacy.lateConservativeHypotheticalNetUSD,0.007);
 assert.equal(x.independentlyQualifiedCount,0);
});
test('UTC close normalization preserves a real one-second mismatch and rejects invalid clock syntax',()=>{
 const durable=defaultDurable({close:'2026-11-19T04:30:00Z'});
 assert.throws(()=>run([durable],[defaultLegacy({close:'2026-11-19T04:30:01.000Z'})],1),
  /conflicts with scheduled settled ledger/);
 for(const close of [
  '2026-11-19 04:30:00','2026-11-19T04:30:00-07:00',
  '2026-11-19T04:30:00.00Z','2026-02-29T04:30:00Z','not-a-time'
 ]){
  assert.throws(()=>run([defaultDurable({close})],[],1),
   /Invalid UTC contract close timestamp|Noncanonical UTC/);
 }
});

test('first GitHub witness lead bins are distinct model-market decisions, never duplicate polls',()=>{
 const rows=[
  defaultDurable({observedAt:'2026-11-19T04:29:45.000Z'}),
  defaultDurable({observedAt:'2026-11-19T04:27:50.000Z'}),
  defaultDurable({model:early,marketId:SECOND,hash:HASH2,
   observedAt:'2026-11-19T04:29:00.000Z'}),
  defaultDurable({model:late,hash:HASH2,
   observedAt:'2026-11-19T04:28:00.000Z'}),
  defaultDurable({model:late,hash:HASH2,
   observedAt:'2026-11-19T04:29:55.000Z'})
 ];
 const x=run(rows,[],2);
 const t=x.durable.firstWitnessLeadTiming;
 assert.deepEqual(t.early,{
  modelMarketDecisions:2,atMost30s:0,over30To60s:1,
  over60To120s:0,over120s:1,
  minimumLeadSeconds:60,medianLeadSeconds:95,maximumLeadSeconds:130
 });
 assert.deepEqual(t.late,{
  modelMarketDecisions:1,atMost30s:0,over30To60s:0,
  over60To120s:1,over120s:0,
  minimumLeadSeconds:120,medianLeadSeconds:120,maximumLeadSeconds:120
 });
 assert.equal(x.durable.uniqueKalshiContracts,2);
 assert.equal(x.durable.totalModelMarketDecisions,3);
 assert.equal(x.independentlyQualifiedCount,0);
 assert.equal(x.realMoneyOrdersAllowed,false);
});
test('witness lead categories treat exact boundaries consistently without time rounding',()=>{
 const times=['2026-11-19T04:29:30.000Z','2026-11-19T04:29:29.999Z',
  '2026-11-19T04:29:00.000Z','2026-11-19T04:28:59.999Z',
  '2026-11-19T04:28:00.000Z','2026-11-19T04:27:59.999Z'];
 const rows=times.map((observedAt,i)=>defaultDurable({
  model:late,marketId:'KXBTC15M-26NOV1900'+String(i+1)+'0-00',
  hash:String(i+1).repeat(64),observedAt
 }));
 const x=run(rows,[],1),t=x.durable.firstWitnessLeadTiming.late;
 assert.equal(t.modelMarketDecisions,6);
 assert.equal(t.atMost30s,1);
 assert.equal(t.over30To60s,2);
 assert.equal(t.over60To120s,2);
 assert.equal(t.over120s,1);
 assert.equal(t.minimumLeadSeconds,30);
 assert.equal(t.maximumLeadSeconds,120.001);
});
test('empty durable inventory leaves witness medians null, not fabricated zero-second captures',()=>{
 const x=run();
 for(const kind of ['early','late']){
  const t=x.durable.firstWitnessLeadTiming[kind];
  assert.equal(t.modelMarketDecisions,0);
  assert.equal(t.minimumLeadSeconds,null);
  assert.equal(t.medianLeadSeconds,null);
  assert.equal(t.maximumLeadSeconds,null);
 }
 assert.equal(x.validationGateMet,false);
});
test('first-witness timing never reads outcome or selects a later winner-dependent timestamp',()=>{
 const x=run([
  defaultDurable({model:late,side:'NO',hash:HASH2,
   observedAt:'2026-11-19T04:28:30.000Z',
   directPublicKalshiMatched:false}),
  defaultDurable({model:late,side:'NO',hash:HASH2,
   observedAt:'2026-11-19T04:29:48.000Z',
   directPublicKalshiMatched:true})
 ],[defaultLegacy({model:late,side:'NO',hash:HASH2,
  winner:'NO',directFinal:true,paperPriced:false})],2);
 assert.equal(x.durable.firstWitnessLeadTiming.late.medianLeadSeconds,90);
 assert.equal(x.durable.directionalWithPublicExchangeMatch,1);
 assert.equal(x.overlap.identicalFrozenCommitments,1);
 assert.equal(x.independentlyQualifiedCount,0);
 assert.equal(x.tradeFillsVerified,0);
});
