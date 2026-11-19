'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {budgetForObserverEvent,watchScheduledObserver,
  MAX_RUNTIME_MS,TRUSTED_SCHEDULE_COMPLETION_BUDGET_MS
}=require('../observer-watch');
const yaml=fs.readFileSync(
  path.join(__dirname,'..','.github','workflows','preexpiry-observer.yml'),'utf8');
const WITNESS='CASH pre-expiry public research observer';
test('trusted scheduled parents add chances to witness late checkpoints, never recursively self-trigger',()=>{
 assert.match(yaml,/  workflow_run:\s*\n    workflows:/);
 for(const n of ['CASH dual-model research snapshot',
  'CASH Model Lab shadow public settlement recheck',
  'CASH witnessed-settlement reconciliation'])
  assert.ok(yaml.includes("      - '"+n+"'"));
 const runs=yaml.slice(yaml.indexOf('  workflow_run:'),
   yaml.indexOf('permissions:'));
 assert.doesNotMatch(runs,/\bCASH pre-expiry public research observer\b/);
 assert.match(runs,/types: \[completed\]/);
});
test('untrusted workflow_run parents cannot execute live watcher',()=>{
 const job=yaml.slice(yaml.indexOf('  capture-public-commitment:'));
 assert.match(job,/github\.ref == 'refs\/heads\/main'/);
 assert.match(job,/github\.event_name == 'workflow_run'/);
 assert.match(job,/github\.event\.workflow_run\.event == 'schedule'/);
 assert.match(job,/github\.event\.workflow_run\.conclusion == 'success'/);
 assert.match(job,/github\.event\.workflow_run\.head_branch == 'main'/);
 assert.match(job,/github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
 assert.match(job,/github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
 assert.match(yaml,/permissions:\s*\n  contents: read/);
 assert.match(yaml,/persist-credentials: false/);
 assert.doesNotMatch(yaml,/contents: write/);
});
test('workflow_run uses short bounded multi-probe watcher, scheduled retains 12-minute watcher',()=>{
 assert.equal(budgetForObserverEvent('workflow_run'),3*60000);
 assert.equal(TRUSTED_SCHEDULE_COMPLETION_BUDGET_MS,3*60000);
 assert.equal(budgetForObserverEvent('schedule'),MAX_RUNTIME_MS);
 assert.equal(MAX_RUNTIME_MS,12*60000);
 assert.match(yaml,/if \[\[ "\$GITHUB_EVENT_NAME" == "schedule" \|\| "\$GITHUB_EVENT_NAME" == "workflow_run" \]\]; then[\s\S]*?node observer-watch\.js/);
 assert.match(yaml,/else[\s\S]*?node preexpiry-observer\.js/);
});
test('both artifact uploads retain same GitHub run provenance, no extra external service',()=>{
 assert.match(yaml,/cash-preexpiry-observation-\$\{\{ github\.run_id \}\}/);
 assert.match(yaml,/path: witness\//);
 assert.match(yaml,/cash-observer-run-summary-\$\{\{ github\.run_id \}\}/);
 assert.match(yaml,/if: github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_run'/);
});
test('the fallback watcher stops within three simulated minutes and cannot invent evidence',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-late-3min-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let now=1795050000000;
 const result=await watchScheduledObserver({
  outDirectory:dir,
  clock:()=>now,
  wait:async ms=>{now+=ms},
  maxRuntimeMs:budgetForObserverEvent('workflow_run'),
  pollIntervalMs:40000,
  observer:async()=>({
   version:'CASH_OFFSERVER_OBSERVATION_V1',
   observationClass:'GITHUB_RUNNER_UTC_CLOCK_PROVISIONAL',
   observedAtRunner:new Date(now).toISOString(),
   githubRunId:'44401234567',githubRepo:'xandputaaa/CASH-staging',
   githubCommitSha:'a'.repeat(40),
   frozenEvidence:[],evidenceWitnessedBeforeExpiry:0,
   claimedIndependentlyQualifiedCount:0,
   calibrated:false,realOrdersEnabled:false
  })
 });
 assert.ok(result.attempts>=3&&result.attempts<=6);
 assert.equal(result.evidenceRecorded,0);
 assert.equal(result.additionalImmutableProbeFiles,0);
 assert.equal(result.independentQualifiedCount,0);
 assert.equal(result.ordersEnabled,false);
 assert.ok(now-1795050000000<=TRUSTED_SCHEDULE_COMPLETION_BUDGET_MS);
 assert.equal(fs.existsSync(path.join(dir,'public-preexpiry-observation.json')),false);
 assert.equal(fs.existsSync(path.join(dir,'observer-run-summary.json')),true);
});
