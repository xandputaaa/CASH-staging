'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const spec=fs.readFileSync(path.join(__dirname,'..','.github','workflows',
 'shadow-public-observer.yml'),'utf8');
test('main shadow witness keeps an explicit best-effort schedule and manual dispatch',()=>{
 assert.match(spec,/  schedule:\s*\n\s+- cron: '3,8,13,18,23,28,33,38,43,48,53,58 \* \* \* \*'/);
 assert.match(spec,/  workflow_dispatch:/);
});
test('only known, non-shadow existing workflows can opportunistically trigger observation',()=>{
 assert.match(spec,/  workflow_run:\s*\n    workflows:/);
 for(const source of [
  'CASH dual-model research snapshot',
  'CASH pre-expiry public research observer',
  'CASH witnessed-settlement reconciliation'
 ])assert.ok(spec.includes("      - '"+source+"'"));
 assert.doesNotMatch(spec,/\s+- 'CASH Model Lab public shadow pre-expiry witness'/);
});
test('a PR, failure, fork or unscheduled workflow cannot run a write-enabled shadow capture',()=>{
 const capture=spec.slice(spec.indexOf('  capture-shadow-public:'));
 assert.match(capture,/github\.ref == 'refs\/heads\/main'/);
 assert.match(capture,/github\.event_name == 'workflow_run'/);
 assert.match(capture,/github\.event\.workflow_run\.event == 'schedule'/);
 assert.match(capture,/github\.event\.workflow_run\.conclusion == 'success'/);
 assert.match(capture,/github\.event\.workflow_run\.head_branch == 'main'/);
 assert.match(capture,/github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
 assert.match(capture,/permissions:\s*\n      contents: write/);
 assert.match(capture,/ref: main/);
 assert.match(capture,/CASH_SHADOW_PUBLIC_WITNESS_ARCHIVED/);
});
test('workflow has serialized witness branch writes and cannot cancel competing run',()=>{
 assert.match(spec,/concurrency:\s*\n  group: cash-shadow-witness-/);
 assert.match(spec,/cancel-in-progress: false/);
});
test('untrusted PR branch never receives witness-store write credentials',()=>{
 const review=spec.slice(spec.indexOf('  review-shadow-witness:'),spec.indexOf('  capture-shadow-public:'));
 assert.match(review,/github\.event_name == 'pull_request'/);
 assert.match(review,/persist-credentials: false/);
 assert.doesNotMatch(review,/contents: write/);
 assert.match(review,/cash-shadow-source-coverage-runner\.js/);
});
