'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {summarizeCaptures,classifyCapture}=require('../late-observer-capture-health');
const BASE=Date.parse('2026-11-19T04:15:00Z');
function r(i,overrides={}){
 return {id:String(44457000598+i),createdAt:new Date(BASE+i*900000).toISOString(),
  event:i%2?'schedule':'workflow_run',
  attempts:5,valid:5,empty:0,invalid:0,commitments:2,directional:0,
  ...overrides};
}
test('empty archives preserve 0 independent outcomes and never activate orders',()=>{
 const x=summarizeCaptures([]);
 assert.equal(x.archivedObserverRuns,0);
 assert.equal(x.runsWithAtLeastOneDirectionalCommitment,0);
 assert.equal(x.originalPolls.attempted,0);
 assert.equal(x.lastDirectionalRunAt,null);
 assert.equal(x.independentlyQualifiedCount,0);
 assert.equal(x.realMoneyOrdersEnabled,false);
});
test('seven successful all-empty archived runs are capture gaps, not losses or source network failures',()=>{
 const x=summarizeCaptures([
  r(1,{directional:1}),
  ...Array.from({length:7},(_,i)=>r(2+i,{valid:18,empty:18,
   attempts:18,commitments:0,directional:0})),
  r(9),
  r(10,{directional:1})
 ]);
 assert.equal(x.archivedObserverRuns,10);
 assert.equal(x.runsWithAtLeastOneFrozenCommitment,3);
 assert.equal(x.runsWithOnlyValidEmptyPublicProxyPolls,7);
 assert.equal(x.runsWithAtLeastOneDirectionalCommitment,2);
 assert.equal(x.longestConsecutiveArchivedValidEmptyRuns,7);
 assert.equal(x.currentTrailingArchivedValidEmptyRuns,0);
 assert.equal(x.recentRecoveredGaps[0].emptyRunCount,7);
 assert.equal(x.recentRecoveredGaps[0].recoveredTo,'CAPTURED_WAITS_ONLY');
 assert.equal(x.sourceNetworkFailureEstablished,false);
 assert.equal(x.completeProspectiveDenominatorEstablished,false);
 assert.equal(x.independentlyQualifiedCount,0);
});
test('a trailing sequence is explicitly unresolved and never presumed to have recovered',()=>{
 const x=summarizeCaptures([
  r(1,{directional:1}),r(2,{valid:5,empty:5,commitments:0}),
  r(3,{valid:5,empty:5,commitments:0}),
  r(4,{valid:5,empty:5,commitments:0})
 ]);
 assert.equal(x.currentTrailingArchivedValidEmptyRuns,3);
 assert.equal(x.recentRecoveredGaps.length,1);
 assert.equal(x.recentRecoveredGaps[0].recoveredTo,'NOT_YET_CAPTURED_IN_ARCHIVED_RUNS');
 assert.equal(x.runsWithAtLeastOneDirectionalCommitment,1);
});
test('partially failed polls are separated from all-valid empty intervals',()=>{
 const x=summarizeCaptures([
  r(1,{valid:0,invalid:5,empty:0,commitments:0}),
  r(2,{valid:3,invalid:2,empty:3,commitments:0}),
  r(3,{valid:5,invalid:0,empty:5,commitments:0}),
  r(4,{valid:5,invalid:0,empty:3,commitments:0})
 ]);
 assert.equal(x.runsWithNoValidPolls,1);
 assert.equal(x.runsWithMixedOrIncompleteProbes,2);
 assert.equal(x.runsWithOnlyValidEmptyPublicProxyPolls,1);
 assert.equal(x.originalPolls.invalid,7);
 assert.equal(x.originalPolls.empty,11);
});
test('repeat runner observations are not reported as separate Kalshi markets',()=>{
 const x=summarizeCaptures([
  r(1,{directional:1}),r(2,{directional:1})
 ]);
 assert.equal(x.runsWithAtLeastOneDirectionalCommitment,2);
 assert.equal(x.independentlyQualifiedCount,0);
 assert.equal(x.actualFillsVerified,0);
 assert.ok(x.caveat.includes('not independent markets'));
});
test('time ordering is original GitHub run creation time, never settlement outcome or numerical run order',()=>{
 const x=summarizeCaptures([
  r(3,{valid:5,empty:5,commitments:0}),
  r(1,{directional:1}),
  r(2,{valid:5,empty:5,commitments:0})
 ]);
 assert.equal(x.currentTrailingArchivedValidEmptyRuns,2);
 assert.equal(x.lastDirectionalRunAt,new Date(BASE+900000).toISOString());
});
test('malformed original archives fail closed, no fabricated denominator',()=>{
 for(const bad of [
  r(1,{attempts:3}),r(1,{valid:4,empty:5}),
  r(1,{invalid:5}),r(1,{commitments:-1}),r(1,{directional:3}),
  r(1,{directional:1,commitments:0})
 ])assert.throws(()=>classifyCapture(bad),/Malformed original observer/);
 assert.throws(()=>summarizeCaptures([r(1),r(1)]),/Duplicate archived/);
 assert.throws(()=>summarizeCaptures([r(1)],{expectedRunCount:2}),/Invalid bounded/);
 assert.throws(()=>summarizeCaptures([r(1,{event:'pull_request'})]),
  /Untrusted archived/);
 assert.throws(()=>summarizeCaptures([r(1,{createdAt:'NOT_A_DATE'})]),
  /Untrusted archived/);
});
test('existing scheduled cross-archive workflow audits actual original witness-health on PR and daily',()=>{
 const file=path.join(__dirname,'..','.github','workflows','cross-archive-identity-audit.yml');
 const y=fs.readFileSync(file,'utf8');
 assert.match(y,/node source\/late-observer-capture-health\.js durable/);
 assert.match(y,/ref: cash-late-public-witness/);
 assert.match(y,/path: durable/);
 assert.match(y,/  schedule:\s*\n/);
 assert.match(y,/permissions:\s*\n  contents: read/);
 assert.doesNotMatch(y,/contents: write/);
});

test('eligibility rollup counts only original diagnostic-bearing runs and preserves legacy unknowns',()=>{
 const diag=(eligible,expired)=>({
  early:{validSourcePolls:1,unavailableSourcePolls:1,invalidSourcePolls:0,
   eligibleForecastPolls:eligible,expiredOnlyPolls:expired,
   otherIneligiblePolls:0,emptyJournalPolls:0},
  late:{validSourcePolls:1,unavailableSourcePolls:0,invalidSourcePolls:1,
   eligibleForecastPolls:0,expiredOnlyPolls:1,
   otherIneligiblePolls:0,emptyJournalPolls:0}
 });
 const x=summarizeCaptures([r(1),r(2,{eligibilityPolls:diag(1,0)}),
  r(3,{eligibilityPolls:diag(0,1)})]);
 assert.equal(x.sourceEligibilityDiagnostics.archivedRunsWithDiagnostics,2);
 assert.equal(x.sourceEligibilityDiagnostics.archivedRunsWithoutDiagnostics,1);
 assert.equal(x.sourceEligibilityDiagnostics.early.eligibleForecastPolls,1);
 assert.equal(x.sourceEligibilityDiagnostics.early.expiredOnlyPolls,1);
 assert.equal(x.sourceEligibilityDiagnostics.late.invalidSourcePolls,2);
 assert.equal(x.independentlyQualifiedCount,0);
 assert.equal(x.realMoneyOrdersEnabled,false);
});
test('malformed eligibility diagnostics fail closed rather than fabricate coverage',()=>{
 const valid={early:{validSourcePolls:1,unavailableSourcePolls:0,
  invalidSourcePolls:0,eligibleForecastPolls:1,expiredOnlyPolls:0,
  otherIneligiblePolls:0,emptyJournalPolls:0},
 late:{validSourcePolls:0,unavailableSourcePolls:0,invalidSourcePolls:0,
  eligibleForecastPolls:0,expiredOnlyPolls:0,
  otherIneligiblePolls:0,emptyJournalPolls:0}};
 assert.throws(()=>summarizeCaptures([r(1,{eligibilityPolls:null})]),
  /Malformed original eligibility/);
 assert.throws(()=>summarizeCaptures([r(1,{eligibilityPolls:{
  ...valid,early:{...valid.early,expiredOnlyPolls:1}}})]),
  /Malformed original eligibility/);
 assert.throws(()=>summarizeCaptures([r(1,{eligibilityPolls:{
  ...valid,late:{...valid.late,invalidSourcePolls:6}}})]),
  /Malformed original eligibility/);
});
