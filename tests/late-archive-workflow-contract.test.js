'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const flow=fs.readFileSync(path.join(__dirname,'..','.github','workflows',
 'late-public-witness-archive.yml'),'utf8');
test('privileged archive workflow has native GitHub substitutions, never escaped literal IDs or tokens',()=>{
 assert.doesNotMatch(flow,/\\\$\{/,'Backslashed expansion silently prevents authentic run ID lookup');
 assert.match(flow,/GH_TOKEN: \$\{\{ github\.token \}\}/);
 assert.match(flow,/CASH_SOURCE_RUN_ID: \$\{\{ github\.event\.workflow_run\.id \}\}/);
 assert.match(flow,/gh api "repos\/\$\{GITHUB_REPOSITORY\}\/actions\/runs\/\$\{CASH_SOURCE_RUN_ID\}"/);
 assert.match(flow,/-n "cash-preexpiry-observation-\$\{CASH_SOURCE_RUN_ID\}"/);
 assert.match(flow,/actions\/runs\/\$\{PARENT_RUN_ID\}"/);
 assert.match(flow,/Append pre-expiry CASH public runner evidence \(run \$\{CASH_SOURCE_RUN_ID\}\)/);
});
test('archive still only accepts a successful real scheduled main-branch observer or scheduled-parent origin',()=>{
 assert.match(flow,/github\.event_name == 'workflow_run'/);
 assert.match(flow,/github\.event\.workflow_run\.conclusion == 'success'/);
 assert.match(flow,/github\.event\.workflow_run\.head_branch == 'main'/);
 assert.match(flow,/github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
 assert.match(flow,/github\.event\.workflow_run\.event == 'schedule'/);
 assert.match(flow,/github\.event\.workflow_run\.event == 'workflow_run'/);
 assert.match(flow,/ref: main/);
 assert.match(flow,/node late-observer-archive\.js/);
 assert.match(flow,/ref: cash-late-public-witness/);
});
test('untrusted PR reads cannot write to permanent late archive',()=>{
 const block=flow.split('  archive-successful-public-observer:')[0];
 assert.match(block,/persist-credentials: false/);
 assert.doesNotMatch(block,/contents: write/);
 assert.match(flow,/if: github\.event_name == 'pull_request' && github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
});
