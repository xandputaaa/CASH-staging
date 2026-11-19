'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'..','.github','workflows');
const recovery=fs.readFileSync(path.join(base,'late-observer-recovery.yml'),'utf8');
const routine=fs.readFileSync(path.join(base,'late-public-witness-archive.yml'),'utf8');
test('merge-triggered safe recovery starts without manual clock time or waiting for next witness',()=>{
 assert.match(recovery,/  push:\s*\n    branches: \[main\]\s*\n    paths:\s*\n      - '\.github\/workflows\/late-observer-recovery\.yml'/);
 assert.match(recovery,/  schedule:\s*\n    - cron: '5 \*\/6 \* \* \*'/);
 assert.match(recovery,/  workflow_dispatch:/);
});
test('recovery and live archive share immutable single-writer queue without cancelling',()=>{
 for(const yaml of [routine,recovery]){
  assert.match(yaml,/group: cash-late-public-witness-archive/);
  assert.match(yaml,/cancel-in-progress: false/);
  assert.doesNotMatch(yaml,/\\\$\{/,'All native expressions must remain unescaped');
 }
});
test('read-only PR validation cannot access token to write an evidence archive',()=>{
 const head=recovery.split('  recover-original-witnesses:')[0];
 assert.match(head,/persist-credentials: false/);
 assert.match(head,/if: github\.event_name == 'pull_request' && github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
 assert.doesNotMatch(head,/contents: write/);
});
test('privileged recovery executes only on trusted default-branch push or schedule and original API runs',()=>{
 assert.match(recovery,/if: github\.ref == 'refs\/heads\/main'/);
 assert.match(recovery,/GH_TOKEN: \$\{\{ github\.token \}\}/);
 assert.match(recovery,/permissions:\s*\n      contents: write\s*\n      actions: read/);
 assert.match(recovery,/ref: main/);
 assert.match(recovery,/ref: cash-late-public-witness/);
 assert.match(recovery,/gh api --paginate --slurp/);
 assert.match(recovery,/node late-observer-recovery-select\.js/);
 assert.match(recovery,/gh run download "\$id"/);
 assert.match(recovery,/node late-observer-archive\.js/);
 assert.match(recovery,/git push origin HEAD:cash-late-public-witness/);
});
test('recovery never synthesizes a missing original receipt, still checks parent identity, and rejects unsafe IDs',()=>{
 assert.match(recovery,/\[\[ ! "\$id" =~ \^\[0-9\]\{8,16\}\$ \]\]/);
 assert.match(recovery,/observer-origin\.json/);
 assert.match(recovery,/observer-run-summary\.json/);
 assert.match(recovery,/CASH_LATE_RECOVERY_MISSING_OR_EXPIRED_ORIGINAL_ARTIFACT/);
 assert.match(recovery,/CASH_LATE_RECOVERY_ORIGINAL_PROVENANCE_NOT_PRESENT/);
 assert.match(recovery,/gh api "repos\/\$\{GITHUB_REPOSITORY\}\/actions\/runs\/\$id"/);
 assert.match(recovery,/gh api "repos\/\$\{GITHUB_REPOSITORY\}\/actions\/runs\/\$parent"/);
 assert.match(recovery,/late-observer-archive\.js/);
});
