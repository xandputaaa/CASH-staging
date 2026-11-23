'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {assessBtc15Evidence}=require('../btc15-evidence-gate');
function group(model,{frozen=0,directional=0,waits=frozen-directional,
 witnessed=0,unwitnessed=directional-witnessed,
 hits=0,misses=0,unscored=witnessed-hits-misses,
 direct=0,priced=0,unpriced=hits+misses-priced}={}){
 return {model,allFrozen:frozen,allDirectional:directional,allWait:waits,
  publicProxyDirectional:directional,matchedDirectionalWitnesses:witnessed,
  publicProxyDirectionalWithoutMatchedWitness:unwitnessed,
  directlyRecheckedFinalDirectional:direct,witnessedDirectionalHits:hits,
  witnessedDirectionalMisses:misses,witnessedDirectionalUnresolvedOrRejected:unscored,
  witnessedDirectionalPaperPriced:priced,
  witnessedScoredDirectionalWithoutPaperPrice:unpriced,
  independentlyQualified:0,realOrdersEnabled:false};
}
function recon(){
 const early=group('KXBTC15M_SETTLEMENT_EARLY_V3',{frozen:320});
 const late=group('KXBTC15M_LATE_CHECKPOINT_SHADOW_V1',
  {frozen:136,directional:5,witnessed:3,hits:2,misses:1,direct:2,priced:2});
 return {version:'CASH_PROVISIONAL_EXTERNAL_WITNESS_RECONCILIATION_V1',
  independentQualifiedCount:0,executionVerified:false,ordersEnabled:false,
  pricesReconstructedFromLaterQuotes:false,
  witnessCoverage:{version:'CASH_VOLATILE_RESEARCH_WITNESS_COVERAGE_V1',
   denominatorScope:'CURRENT_VOLATILE_RAILWAY_JOURNALS_AND_FETCHED_RECENT_GITHUB_OBSERVATIONS',
   archivalCompletenessProven:false,independentlyQualifiedCount:0,
   realOrdersEnabled:false,actualFillsVerified:0,calibrated:false,
   groups:{early,late}},
  groups:{early:{directionalVerifiedOutcomes:0,hits:0,misses:0,directionalWitnessed:0},
   late:{directionalVerifiedOutcomes:3,hits:2,misses:1,directionalWitnessed:3}},
  githubRunCrossCheck:{archivalCompletenessProven:false,runSelectionTruncated:false}};
}
test('real-looking partial source remains research only; denominators and storage warnings preserved',()=>{
 const result=assessBtc15Evidence(recon());
 assert.equal(result.decision,'NO_GO_REAL_MONEY');
 assert.equal(result.independentQualifiedCount,0);
 assert.equal(result.byModel.late.sourceScoredDirectional,3);
 assert.equal(result.byModel.late.sourceScoredHits,2);
 assert.equal(result.byModel.late.preExpiryWitnessedDirectional,3);
 assert.equal(result.byModel.late.notWitnessedDirectional,2);
 assert.equal(result.byModel.late.directPublicKalshiFinalRecheckedDirectional,2);
 assert.equal(result.byModel.late.descriptiveWitnessedDirectionalHitRate,2/3);
 assert.ok(result.blockers.includes('EARLY_JOURNAL_CAPACITY_STOP'));
 assert.ok(result.blockers.includes('LATE_DIRECTIONAL_WITNESS_COVERAGE_INCOMPLETE'));
 assert.equal(result.byModel.early.liveCapacityVerified,false);
 assert.equal(result.realOrdersEnabled,false);
});
test('100 wins in a selected provisional sample still cannot unlock independent validation or trades',()=>{
 const x=recon();x.witnessCoverage.groups.late=
  group('KXBTC15M_LATE_CHECKPOINT_SHADOW_V1',{frozen:130,directional:100,witnessed:100,hits:100,misses:0,direct:100,priced:100});
 x.groups.late={directionalVerifiedOutcomes:100,hits:100,misses:0,directionalWitnessed:100};
 const r=assessBtc15Evidence(x);
 assert.equal(r.byModel.late.descriptiveWitnessedDirectionalHitRate,1);
 assert.equal(r.forecastingAccuracyCertified,false);
 assert.equal(r.claimedAccuracyAtLeast85Percent,false);
 assert.equal(r.chronologicalHoldoutComplete,false);
 assert.equal(r.independentQualifiedCount,0);
 assert.equal(r.decision,'NO_GO_REAL_MONEY');
});
test('contradictory denominators fail closed; missing witness never becomes a winner',()=>{
 const x=recon();
 x.witnessCoverage.groups.late.publicProxyDirectionalWithoutMatchedWitness=0;
 assert.throws(()=>assessBtc15Evidence(x),/denominator/);
 const y=recon();y.witnessCoverage.groups.late.witnessedDirectionalHits=7;
 assert.throws(()=>assessBtc15Evidence(y),/denominator/);
});
test('forged order permission, fills, calibration or independent qualification is refused',()=>{
 for(const edit of [
  x=>x.ordersEnabled=true,
  x=>x.independentQualifiedCount=100,
  x=>x.witnessCoverage.calibrated=true,
  x=>x.witnessCoverage.actualFillsVerified=1,
  x=>x.witnessCoverage.groups.late.realOrdersEnabled=true,
  x=>x.pricesReconstructedFromLaterQuotes=true
 ]){
  const x=recon();edit(x);
  assert.throws(()=>assessBtc15Evidence(x));
 }
});
test('missing external history is unknown, not validated completeness',()=>{
 const x=recon();x.githubRunCrossCheck.runSelectionTruncated=null;
 const r=assessBtc15Evidence(x);
 assert.ok(r.blockers.includes('GITHUB_RUN_RETRIEVAL_COMPLETENESS_UNVERIFIED'));
 assert.equal(r.independentQualifiedCount,0);
});
