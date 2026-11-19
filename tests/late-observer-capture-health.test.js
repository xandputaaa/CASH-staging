'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {summarizeCaptures,classifyCapture,runCreationToFirstWitness,firstOriginalWitnessAt,triggerConversionCoverage}=require('../late-observer-capture-health');
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

function eligibilityForCapture(n){
 const model=eligible=>({
  validSourcePolls:5,unavailableSourcePolls:0,invalidSourcePolls:0,
  eligibleForecastPolls:eligible,expiredOnlyPolls:5-eligible,
  otherIneligiblePolls:0,emptyJournalPolls:0});
 return {early:model(n),late:model(4)};
}
function conversionForCapture(){
 const model=(eligibleWith,eligibleWithout,direct)=>({
  diagnosticPolls:5,diagnosticsMissingPolls:0,
  eligibleWithWitnessPolls:eligibleWith,
  eligibleWithoutWitnessPolls:eligibleWithout,
  eligibleWithDirectMatchPolls:direct,witnessWithoutEligibilityPolls:0});
 return {early:model(1,1,1),late:model(3,1,2)};
}
test('source-to-witness rollup excludes legacy conversion-unknown runs without fabricating zero captures',()=>{
 const x=summarizeCaptures([
  r(1),
  r(2,{eligibilityPolls:eligibilityForCapture(2)}),
  r(3,{eligibilityPolls:eligibilityForCapture(2),
   witnessConversion:conversionForCapture()})
 ]);
 const c=x.sourceToWitnessConversionDiagnostics;
 assert.equal(c.archivedRunsWithConversion,1);
 assert.equal(c.archivedRunsWithoutConversion,2);
 assert.equal(c.eligibilityRunsWithoutConversion,1);
 assert.equal(c.early.diagnosticPolls,5);
 assert.equal(c.early.eligibleWithWitnessPolls,1);
 assert.equal(c.early.eligibleWithoutWitnessPolls,1);
 assert.equal(c.late.eligibleWithWitnessPolls,3);
 assert.equal(c.late.eligibleWithoutWitnessPolls,1);
 assert.equal(c.late.eligibleWithDirectMatchPolls,2);
 assert.equal(x.sourceEligibilityDiagnostics.archivedRunsWithDiagnostics,2);
 assert.equal(x.independentlyQualifiedCount,0);
 assert.equal(x.realMoneyOrdersEnabled,false);
 assert.ok(x.caveat.includes('not interpreted as zero'));
 assert.doesNotMatch(JSON.stringify(c),/KXBTC15M-|spotPrice|apiKey/);
});
test('conversion totals reject missing eligibility, forged arithmetic, and private extra fields',()=>{
 const eligibility=eligibilityForCapture(2),conversion=conversionForCapture();
 const cases=[
  {witnessConversion:conversion},
  {eligibilityPolls:eligibility,witnessConversion:{
   ...conversion,early:{...conversion.early,diagnosticPolls:6}}},
  {eligibilityPolls:eligibility,witnessConversion:{
   ...conversion,late:{...conversion.late,eligibleWithoutWitnessPolls:2}}},
  {eligibilityPolls:eligibility,witnessConversion:{
   ...conversion,late:{...conversion.late,eligibleWithDirectMatchPolls:4}}},
  {eligibilityPolls:eligibility,witnessConversion:{
   ...conversion,early:{...conversion.early,privatePrice:65000}}},
  {eligibilityPolls:eligibility,witnessConversion:{
   ...conversion,early:{...conversion.early,diagnosticsMissingPolls:-1}}}
 ];
 for(const extra of cases)
  assert.throws(()=>summarizeCaptures([r(1,extra)]),
   /Malformed original witness conversion diagnostic/);
});
test('a valid empty archived inventory has explicit zero conversion-bearing runs and no evidence',()=>{
 const x=summarizeCaptures([]);
 assert.equal(x.sourceToWitnessConversionDiagnostics.archivedRunsWithConversion,0);
 assert.equal(x.sourceToWitnessConversionDiagnostics.archivedRunsWithoutConversion,0);
 assert.equal(x.sourceToWitnessConversionDiagnostics.late.eligibleWithWitnessPolls,0);
 assert.equal(x.independentlyQualifiedCount,0);
});

test('first runner witness latency counts original archive RUNS by provenance not repeated polls or model outcomes',()=>{
 const start='2026-11-19T04:00:00.000Z';
 const row=(i,event,seconds,commitments=2)=>r(i,{
  event,createdAt:start,commitments,
  ...(seconds===undefined?{}:{firstWitnessAt:
    seconds===null?null:new Date(Date.parse(start)+seconds*1000).toISOString()})
 });
 const x=runCreationToFirstWitness([
  row(1,'schedule',0),row(2,'schedule',30),
  row(3,'schedule',30.001),row(4,'schedule',90),
  row(5,'schedule',90.001),row(6,'schedule',180),
  row(7,'schedule',180.001),row(8,'schedule',undefined),
  row(9,'schedule',null,0),
  row(10,'workflow_run',35),row(11,'workflow_run',95),
  row(12,'workflow_run',null,0)
 ]);
 assert.equal(x.schedule.runsWithWitness,8);
 assert.equal(x.schedule.withTiming,7);
 assert.equal(x.schedule.missingOriginalTime,1);
 assert.equal(x.schedule.runsWithoutWitness,1);
 assert.deepEqual([
  x.schedule.atMost30s,x.schedule.over30To90s,
  x.schedule.over90To180s,x.schedule.over180s
 ],[2,2,2,1]);
 assert.equal(x.schedule.medianSeconds,90);
 assert.equal(x.schedule.minimumSeconds,0);
 assert.equal(x.schedule.maximumSeconds,180.001);
 assert.equal(x.workflow_run.withTiming,2);
 assert.equal(x.workflow_run.medianSeconds,65);
 assert.equal(x.workflow_run.runsWithoutWitness,1);
});
test('clock skew is separate from success; fabricated long negative GH run lead fails closed',()=>{
 const start='2026-11-19T04:00:00.000Z';
 const row=(ms)=>r(1,{createdAt:start,event:'schedule',
  firstWitnessAt:new Date(Date.parse(start)+ms).toISOString()});
 const mild=runCreationToFirstWitness([row(-5000)]);
 assert.equal(mild.schedule.runnerClockBeforeRun,1);
 assert.equal(mild.schedule.withTiming,0);
 assert.equal(mild.schedule.medianSeconds,null);
 assert.throws(()=>runCreationToFirstWitness([row(-5001)]),
  /predates GitHub source run/);
 assert.throws(()=>runCreationToFirstWitness([r(1,{
  commitments:0,firstWitnessAt:start})]),
  /Non-capture run cannot have/);
 assert.throws(()=>runCreationToFirstWitness([r(1,{
  firstWitnessAt:'not-a-clock'})]),
  /Invalid original GitHub witness runtime clock/);
});
test('archived original first witness time prefers first qualifying immutable probe, not strongest later summary',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-first-original-run-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.mkdirSync(path.join(dir,'probes'));
 const id='44573847706',sha='a'.repeat(40);
 const obs=(when)=>({githubRunId:id,githubCommitSha:sha,
  observedAtRunner:when,frozenEvidence:[{model:'KXBTC15M_SETTLEMENT_EARLY_V3'}]});
 fs.writeFileSync(path.join(dir,'public-preexpiry-observation.json'),
  JSON.stringify(obs('2026-11-19T17:11:36.839Z')));
 fs.writeFileSync(path.join(dir,'probes','001.json'),
  JSON.stringify(obs('2026-11-19T17:08:25.000Z')));
 const manifest={sourceRunId:id,sourceHeadSha:sha,distinctCommitments:1,
  sourceArtifactFiles:[
   {file:'public-preexpiry-observation.json'},
   {file:'probes/001.json'}]};
 assert.equal(firstOriginalWitnessAt(dir,manifest),'2026-11-19T17:08:25.000Z');
 assert.equal(firstOriginalWitnessAt(dir,{
  ...manifest,distinctCommitments:0,sourceArtifactFiles:[]}),null);
 assert.throws(()=>firstOriginalWitnessAt(dir,{
  ...manifest,sourceHeadSha:'b'.repeat(40)}),/run identity changed/);
 assert.throws(()=>firstOriginalWitnessAt(dir,{
  ...manifest,sourceArtifactFiles:[]}),/Missing original frozen observation/);
});
test('archived runner witness timing is not called scheduling queue latency or qualified contracts',()=>{
 const start='2026-11-19T04:00:00Z';
 const x=summarizeCaptures([r(1,{event:'schedule',createdAt:start,
  firstWitnessAt:'2026-11-19T04:00:31.000Z'}),
  r(2,{event:'workflow_run',createdAt:start,
   firstWitnessAt:'2026-11-19T04:01:05.000Z'}),
  r(3,{event:'workflow_run',createdAt:start,commitments:0,
   empty:5,firstWitnessAt:null})]);
 assert.equal(x.githubRunCreationToFirstWitness.schedule.withTiming,1);
 assert.equal(x.githubRunCreationToFirstWitness.workflow_run.runsWithoutWitness,1);
 assert.equal(x.githubRunCreationToFirstWitness.workflow_run.medianSeconds,65);
 assert.equal(x.independentlyQualifiedCount,0);
 assert.equal(x.realMoneyOrdersEnabled,false);
 assert.match(x.caveat,/cannot establish when GitHub scheduled/);
});

test('trigger conversion separates direct scheduled and parent-triggered run and poll denominators',()=>{
 const conversion=(yes,no)=>({diagnosticPolls:yes+no,
  diagnosticsMissingPolls:0,eligibleWithWitnessPolls:yes,
  eligibleWithoutWitnessPolls:no,eligibleWithDirectMatchPolls:yes,
  witnessWithoutEligibilityPolls:0});
 const rows=[
  r(1,{event:'schedule',witnessConversion:{
   early:conversion(2,1),late:conversion(0,2)}}),
  r(2,{event:'workflow_run',witnessConversion:{
   early:conversion(1,0),late:conversion(1,0)}}),
  r(3,{event:'schedule'}),
  r(4,{event:'workflow_run',witnessConversion:{
   early:conversion(0,2),late:conversion(0,0)}})
 ];
 const d=triggerConversionCoverage(rows);
 assert.equal(d.schedule.archivedRuns,2);
 assert.equal(d.schedule.withConversion,1);
 assert.equal(d.schedule.withoutConversion,1);
 assert.deepEqual(d.schedule.early,{
  eligiblePolls:3,eligibleWithoutWitnessPolls:1,
  eligibleWithWitnessPolls:2,runsWithEligiblePolls:1,
  runsWithUnwitnessedEligiblePolls:1});
 assert.equal(d.schedule.late.runsWithUnwitnessedEligiblePolls,1);
 assert.equal(d.workflow_run.withConversion,2);
 assert.equal(d.workflow_run.early.eligiblePolls,3);
 assert.equal(d.workflow_run.early.eligibleWithoutWitnessPolls,2);
 assert.equal(d.workflow_run.early.runsWithEligiblePolls,2);
 assert.equal(d.workflow_run.early.runsWithUnwitnessedEligiblePolls,1);
 assert.equal(d.workflow_run.late.eligiblePolls,1);
 assert.equal(d.workflow_run.late.runsWithUnwitnessedEligiblePolls,0);
});
test('trigger conversion excludes historical unknowns and fails closed on impossible counts',()=>{
 const empty=triggerConversionCoverage([r(1,{event:'schedule'})]);
 assert.equal(empty.schedule.withConversion,0);
 assert.equal(empty.schedule.withoutConversion,1);
 assert.equal(empty.schedule.early.eligiblePolls,0);
 assert.throws(()=>triggerConversionCoverage([r(1,{event:'manual'})]),
  /Unknown original observer trigger/);
 const bad={diagnosticPolls:1,diagnosticsMissingPolls:0,
  eligibleWithWitnessPolls:2,eligibleWithoutWitnessPolls:-1,
  eligibleWithDirectMatchPolls:0,witnessWithoutEligibilityPolls:0};
 assert.throws(()=>triggerConversionCoverage([r(1,{
  witnessConversion:{early:bad,late:bad}})]),
  /Trigger conversion/);
});
