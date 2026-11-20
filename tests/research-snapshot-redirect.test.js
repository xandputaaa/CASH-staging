'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('authenticated research export requests never follow cross-origin redirects',()=>{
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/research-snapshot.yml'),'utf8');
 const fetches=workflow.match(/curl [^\n]*\\[\s\S]*?--output recovery\/cash-(?:public-research|late-checkpoint)-unverified\.json/g)||[];
 assert.equal(fetches.length,2,'both research export requests must be inspected');
 for(const fetch of fetches){
  assert.doesNotMatch(fetch,/--location(?:-trusted)?\b|(?:^|\s)-L(?:\s|$)/,
   'credentials must not be forwarded to redirected destinations');
  assert.match(fetch,/--max-redirs 0\b/);
  assert.match(fetch,/--max-time 30\b/);
 }
 assert.match(workflow,/401\|403\)/,'private authorization failures stay explicit');
 assert.match(workflow,/Unexpected research export HTTP status/,
  'unexpected HTTP status must fail closed');
});
