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
 paperPriced:false,...overrides
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
  directFinal:true,paperPriced:true});
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
  {side:'YES',directFinal:true},{hash:'e'.repeat(64)},
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
   directFinal:true,paperPriced:false}),
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
