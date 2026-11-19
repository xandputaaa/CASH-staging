'use strict';
/*
 * Authenticated-by-GitHub-context source run origin. Only metadata; NO
 * private Kalshi account access and NO forecast, result, or trade inference.
 *
 * This file is an INPUT to independent GitHub API read-only cross-checking.
 * Self-reported origin fields alone are never sufficient to archive claims.
 */
const fs=require('node:fs'),path=require('node:path');
const VERSION='CASH_PUBLIC_LATE_GITHUB_OBSERVER_ORIGIN_V1';
const REPO='xandputaaa/CASH-staging';
const SOURCE='CASH pre-expiry public research observer';
const PARENTS=Object.freeze([
 'CASH dual-model research snapshot',
 'CASH Model Lab shadow public settlement recheck',
 'CASH witnessed-settlement reconciliation'
]);
const ID=/^[0-9]{8,16}$/;
const SHA=/^[a-f0-9]{40}$/;
function sourceOrigin(env=process.env){
 const event=env.GITHUB_EVENT_NAME;
 if(!['schedule','workflow_run'].includes(event)||
    env.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/main'||
    !ID.test(String(env.GITHUB_RUN_ID||''))||
    !SHA.test(env.GITHUB_SHA||''))
  throw Error('Public late witness origin requires scheduled trusted main run');
 const parent=event==='workflow_run'?{
  id:String(env.CASH_PARENT_RUN_ID||''),
  name:env.CASH_PARENT_NAME||'',
  event:env.CASH_PARENT_EVENT||'',
  conclusion:env.CASH_PARENT_CONCLUSION||'',
  headBranch:env.CASH_PARENT_HEAD_BRANCH||'',
  headRepository:env.CASH_PARENT_HEAD_REPOSITORY||''
 }:null;
 if(parent&&(!ID.test(parent.id)||!PARENTS.includes(parent.name)||
  parent.event!=='schedule'||parent.conclusion!=='success'||
  parent.headBranch!=='main'||parent.headRepository!==REPO))
  throw Error('Untrusted origin for workflow-run witness');
 return Object.freeze({
  version:VERSION,sourceWorkflow:SOURCE,runId:String(env.GITHUB_RUN_ID),
  event,repository:REPO,headBranch:'main',headSha:env.GITHUB_SHA,
  parent,independentlyQualifiedCount:0,ordersEnabled:false,
  note:'GitHub workflow-event metadata, cross-check with direct GitHub API before archiving. No independently certified trading prediction, inference-time BRTI calculation, executable quote, fill or profit.'
 });
}
function writeSourceOrigin({env=process.env,
 outFile='witness/observer-origin.json'}={}){
 const origin=sourceOrigin(env);
 const dest=path.resolve(outFile);
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.writeFileSync(dest,JSON.stringify(origin,null,2)+'\n',{
  flag:'wx',mode:0o600
 });
 console.log('CASH_LATE_WITNESS_ORIGIN='+origin.event);
 console.log('CASH_LATE_WITNESS_PARENT_PROVENANCE='+(
  origin.parent?'SCHEDULE_SUCCESS_MAIN':'DIRECT_SCHEDULE_MAIN'));
 console.log('CASH_LATE_WITNESS_ORIGIN_QUALIFIED=0');
 return origin;
}
if(require.main===module){
 try{writeSourceOrigin()}
 catch{console.error('Refusing unsigned or untrusted late witness provenance');
  process.exitCode=1}
}
module.exports={VERSION,REPO,SOURCE,PARENTS,ID,SHA,sourceOrigin,
 writeSourceOrigin};
