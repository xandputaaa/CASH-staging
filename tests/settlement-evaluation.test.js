'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {wilson95,summarizeSettlementEvaluation:summarize}=require('../settlement-evaluation');
function row({side='YES',winner='YES',status='HIT',leadMs=600000,
 yesAsk=.63,noAsk=.38}={}){
 return {side,winner,status,leadMs,observedAsks:{YES:yesAsk,NO:noAsk}};
}
test('empty settlement sample never fabricates accuracy or a confidence interval',()=>{
 const v=summarize([]);
 assert.equal(v.officiallyScored,0);
 assert.equal(v.exploratoryAccuracy,null);
 assert.deepEqual(v.wilson95,{lower:null,upper:null});
 assert.equal(v.comparison.comparableScored,0);
 assert.equal(v.accuracyGuaranteed,false);
 assert.equal(v.independentlyValidated,false);
});
test('only official directional HIT/MISS records count, not WAIT/pending/void',()=>{
 const a=summarize([row(),row({side:'NO',winner:'YES',status:'MISS'}),
  row({side:null,winner:'YES',status:'WAIT_RESOLVED'}),
  row({winner:null,status:'PENDING'}),
  row({winner:'VOID',status:'VOID'})]);
 assert.equal(a.directionalFrozen,4);
 assert.equal(a.waitsFrozen,1);
 assert.equal(a.officiallyScored,2);
 assert.equal(a.hits,1);
 assert.equal(a.misses,1);
 assert.equal(a.coverage,4/5);
 assert.equal(a.pendingDirectional,1);
 assert.equal(a.voidDirectional,1);
 assert.equal(a.exploratoryAccuracy,.5);
 assert.ok(a.wilson95.lower<.5&&a.wilson95.upper>.5);
});
test('market quote comparison uses ASK side at freeze, never data from after settlement',()=>{
 const a=summarize([
  row({side:'YES',winner:'NO',status:'MISS',yesAsk:.85,noAsk:.17}),
  row({side:'NO',winner:'NO',status:'HIT',yesAsk:.8,noAsk:.2}),
  row({side:'NO',winner:'YES',status:'MISS',yesAsk:.75,noAsk:.26})
 ]);
 assert.equal(a.comparison.comparableScored,3);
 assert.equal(a.comparison.marketFavoredHits,1);
 assert.equal(a.comparison.cashHitsOnComparable,1);
 assert.equal(a.comparison.accuracyDifference,0);
 assert.equal(a.comparison.disagreementsScored,2);
 assert.equal(a.comparison.cashWinsInDisagreements,1);
 assert.equal(a.comparison.marketWinsInDisagreements,1);
 assert.equal(a.profitVerified,false);
});
test('invalid or tied market asks do not create a made-up baseline',()=>{
 const a=summarize([
  row({yesAsk:null,noAsk:.4}),
  row({yesAsk:.5,noAsk:.5}),
  row({yesAsk:1.2,noAsk:.1})
 ]);
 assert.equal(a.officiallyScored,3);
 assert.equal(a.comparison.comparableScored,0);
 assert.equal(a.comparison.marketFavoredHitRate,null);
 assert.equal(a.comparison.accuracyDifference,null);
});
test('lead cohorts distinguish >8m from 4-8m and last 4m',()=>{
 const a=summarize([
  row({leadMs:600000}),
  row({side:'NO',winner:'YES',status:'MISS',leadMs:420000}),
  row({leadMs:180000})
 ]);
 assert.equal(a.byLead.length,3);
 assert.deepEqual(a.byLead.map(x=>x.officiallyScored),[1,1,1]);
 assert.deepEqual(a.byLead.map(x=>x.hits),[1,0,1]);
});
test('Wilson limits are bounded and avoid presenting 100% confidence from 1 win',()=>{
 const one=wilson95(1,1),none=wilson95(0,1);
 assert.ok(one.lower>0&&one.lower<.3);
 assert.ok(one.upper<=1);
 assert.ok(none.upper>.7&&none.upper<.9);
 assert.deepEqual(wilson95(2,1),{lower:null,upper:null});
 assert.deepEqual(wilson95(0,0),{lower:null,upper:null});
});
test('contradictory outcome labels cannot inflate official-sample statistics',()=>{
 const a=summarize([row({side:'YES',winner:'NO',status:'HIT'}),
  row({side:'NO',winner:'YES',status:'MISS'})]);
 assert.equal(a.officiallyScored,1);
 assert.equal(a.hits,0);
 assert.equal(a.misses,1);
 assert.equal(a.independentlyValidated,false);
});
