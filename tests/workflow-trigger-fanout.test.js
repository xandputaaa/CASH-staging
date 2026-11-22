'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..','.github','workflows');
function read(name){return fs.readFileSync(path.join(root,name),'utf8')}
function allowedParents(src){
 const block=src.match(/^  workflow_run:\n([\s\S]*?)^permissions:/m);
 assert.ok(block,'expected workflow_run top-level trigger');
 return [...block[1].matchAll(/^      - '([^']+)'\s*$/gm)].map(x=>x[1]);
}
test('scheduled witness jobs do not trigger each other and retain a single trusted fallback',()=>{
 for(const file of ['preexpiry-observer.yml','shadow-public-observer.yml']){
  const src=read(file);
  assert.deepEqual(allowedParents(src),['CASH dual-model research snapshot']);
  assert.match(src,/github\.event\.workflow_run\.event == 'schedule'/);
  assert.match(src,/github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(src,/github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(src,/github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
  assert.match(src,/id-token: write/,'trusted read-only OIDC capability preserved');
 }
});
test('existing best-effort schedules and append-only observer archiving remain intact',()=>{
 const early=read('preexpiry-observer.yml'),shadow=read('shadow-public-observer.yml');
 assert.match(early,/cron: '12,27,42,57 \* \* \* \*'/);
 assert.match(shadow,/cron: '3,8,13,18,23,28,33,38,43,48,53,58 \* \* \* \*'/);
 assert.match(early,/cash-observer-source-gate\.js preexpiry/);
 assert.match(shadow,/cash-observer-source-gate\.js shadow/);
 const archive=read('late-public-witness-archive.yml');
 assert.match(archive,/CASH pre-expiry public research observer/);
 const parent=read('research-snapshot.yml');
 assert.doesNotMatch(parent,/^  workflow_run:/m,'parent must not be triggered by workflow_run');
 assert.match(parent,/cron: '17,47 \* \* \* \*'/);
});
