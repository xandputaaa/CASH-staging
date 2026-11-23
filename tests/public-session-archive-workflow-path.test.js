'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const archiveWorkflow=fs.readFileSync(path.join(__dirname,'..','.github','workflows','public-session-archive.yml'),'utf8');
const validator=fs.readFileSync(path.join(__dirname,'..','early-archive-capacity.js'),'utf8');

test('scheduled public session archive passes an absolute checked-out archive root',()=>{
 const step=archiveWorkflow.split('- name: Verify exact early journal archive coverage')[1]?.split('- name: ')[0];
 assert.ok(step,'Early capacity gate step must exist');
 assert.match(step,/node early-archive-capacity\.js/);
 assert.match(step,/source-read-only\/cash-public-research-unverified\.json/);
 assert.ok(step.includes('"$GITHUB_WORKSPACE/archive-store"'),
  'Do not pass a relative archive-store root; real November 23 runs failed at path.isAbsolute');
 assert.doesNotMatch(step,/\n\s*archive-store\s*(?:\n|$)/);
 assert.match(archiveWorkflow,/ref: cash-public-session-archive/);
 assert.match(archiveWorkflow,/persist-credentials: true/);
});
test('absolute-root fix does not weaken validation or archival safety gates',()=>{
 assert.match(validator,/path\.isAbsolute\(archiveRoot\)/);
 const a=archiveWorkflow.indexOf('Validate source hash chains and append whitelisted public self-reports');
 const b=archiveWorkflow.indexOf('Inspect full source-only archive before any branch commit');
 const c=archiveWorkflow.indexOf('Verify exact early journal archive coverage');
 const d=archiveWorkflow.indexOf('Reject any deletion, rewrite or backdated outcome before Git push');
 const e=archiveWorkflow.indexOf('Commit only new unverified public-session data');
 assert.ok(a>=0&&b>a&&c>b&&d>c&&e>d,'Full archive and no-rewrite gates must precede commit');
 assert.match(archiveWorkflow,/git push origin HEAD:cash-public-session-archive/);
 assert.doesNotMatch(archiveWorkflow,/\b(?:force-push|git push --force)\b/);
});
