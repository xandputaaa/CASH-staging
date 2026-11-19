'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {sourceOrigin,writeSourceOrigin}=require('../late-observer-origin');
const BASE={
 GITHUB_EVENT_NAME:'workflow_run',GITHUB_REPOSITORY:'xandputaaa/CASH-staging',
 GITHUB_REF:'refs/heads/main',GITHUB_RUN_ID:'44453487857',
 GITHUB_SHA:'f54605cf27e4c86aca2af96521da5803cd484149',
 CASH_PARENT_RUN_ID:'44453463087',
 CASH_PARENT_NAME:'CASH Model Lab shadow public settlement recheck',
 CASH_PARENT_EVENT:'schedule',CASH_PARENT_CONCLUSION:'success',
 CASH_PARENT_HEAD_BRANCH:'main',
 CASH_PARENT_HEAD_REPOSITORY:'xandputaaa/CASH-staging'
};
test('strict default branch scheduled-parent witness creates non-trading provenance metadata',()=>{
 const o=sourceOrigin(BASE);
 assert.equal(o.event,'workflow_run');
 assert.equal(o.parent.id,'44453463087');
 assert.equal(o.parent.event,'schedule');
 assert.equal(o.parent.conclusion,'success');
 assert.equal(o.independentlyQualifiedCount,0);
 assert.equal(o.ordersEnabled,false);
 assert.ok(!JSON.stringify(o).includes('PRIVATE_KEY'));
});
test('direct scheduled main observer produces null parent',()=>{
 const o=sourceOrigin({...BASE,GITHUB_EVENT_NAME:'schedule'});
 assert.equal(o.event,'schedule');
 assert.equal(o.parent,null);
});
test('invalid PR, fork, failed, manually triggered or recursive parents are refused',()=>{
 const cases=[
  {GITHUB_EVENT_NAME:'pull_request'},
  {GITHUB_REF:'refs/heads/candidate'},
  {GITHUB_REPOSITORY:'external/fork'},
  {CASH_PARENT_EVENT:'pull_request'},
  {CASH_PARENT_EVENT:'workflow_dispatch'},
  {CASH_PARENT_EVENT:'workflow_run'},
  {CASH_PARENT_CONCLUSION:'failure'},
  {CASH_PARENT_HEAD_BRANCH:'feature'},
  {CASH_PARENT_HEAD_REPOSITORY:'external/fork'},
  {CASH_PARENT_NAME:'CASH pre-expiry public research observer'},
  {CASH_PARENT_RUN_ID:'abc'},
  {GITHUB_RUN_ID:'../../../123'},
  {GITHUB_SHA:'0'.repeat(7)}
 ];
 for(const update of cases)
  assert.throws(()=>sourceOrigin({...BASE,...update}),/Untrusted|requires scheduled trusted/);
});
test('origin file is append-only and refuses overwriting the original GitHub event',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-source-origin-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const output=path.join(dir,'origin.json');
 const a=writeSourceOrigin({env:BASE,outFile:output});
 assert.deepEqual(JSON.parse(fs.readFileSync(output)),a);
 assert.throws(()=>writeSourceOrigin({env:BASE,outFile:output}),/EEXIST/);
});
