'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {selectOriginalRuns,writeSelection,MAX_RUNS,LOOKBACK_HOURS}=
 require('../late-observer-recovery-select');
const REPO='xandputaaa/CASH-staging',WF='CASH pre-expiry public research observer';
const NOW=Date.parse('2026-11-19T05:30:00Z');
function item(id,override={}){
 return {id,name:WF,event:'workflow_run',conclusion:'success',status:'completed',
  head_branch:'main',head_repository:{full_name:REPO},
  created_at:new Date(NOW-60000).toISOString(),...override};
}
test('recovers only actual previously completed and successful original schedule or parent-trigger observer',()=>{
 const pages=[{workflow_runs:[item(44461104333),item(44457895139,{event:'schedule'}),
  item(44461104333),item(44461104334,{event:'pull_request'}),
  item(44461104335,{event:'workflow_dispatch'}),
  item(44461104336,{conclusion:'failure'}),
  item(44461104337,{status:'in_progress',conclusion:null})]}];
 const r=selectOriginalRuns(pages,{nowMs:NOW});
 assert.deepEqual(new Set(r.originalRunIdsOldestFirst),
  new Set(['44461104333','44457895139']));
 assert.equal(r.eligibleRecentOriginalRuns,2);
 assert.equal(r.independentQualificationCount,0);
 assert.equal(r.ordersEnabled,false);
});
test('forks, wrong branch/workflow, expired and future original observations never enter recovery',()=>{
 const p={workflow_runs:[
  item(44461104333,{head_repository:{full_name:'untrusted/fork'}}),
  item(44461104334,{head_branch:'feature'}),
  item(44461104335,{name:'CASH different workflow'}),
  item(44461104336,{created_at:new Date(NOW-50*3600000).toISOString()}),
  item(44461104337,{created_at:new Date(NOW+6*60000).toISOString()}),
  item(44461104338,{id:'../../etc/passwd'}),
  item(44461104339)
 ]};
 const r=selectOriginalRuns([p],{nowMs:NOW});
 assert.deepEqual(r.originalRunIdsOldestFirst,['44461104339']);
 assert.equal(r.limited,false);
});
test('paginated API responses produce one chronological selection and never choose based on settlement outcome',()=>{
 const a={workflow_runs:[item(44461104333,{created_at:new Date(NOW-1000).toISOString()}),
  item(44461104331,{created_at:new Date(NOW-50000).toISOString()})]};
 const b={workflow_runs:[item(44461104332,{created_at:new Date(NOW-25000).toISOString()}),
  item(44461104333)]};
 const r=selectOriginalRuns([a,b],{nowMs:NOW});
 assert.deepEqual(r.originalRunIdsOldestFirst,
  ['44461104331','44461104332','44461104333']);
});
test('capped recoveries declare limitation explicitly, without promoting qualified results',()=>{
 const rows=Array.from({length:30},(_,i)=>item(44461000000+i,{
  created_at:new Date(NOW-i*60000).toISOString()
 }));
 const r=selectOriginalRuns([{workflow_runs:rows}],{
  nowMs:NOW,maxRuns:MAX_RUNS
 });
 assert.equal(r.originalRunIdsOldestFirst.length,24);
 assert.equal(r.eligibleRecentOriginalRuns,30);
 assert.equal(r.limit,24);
 assert.equal(r.limited,true);
 assert.equal(r.independentQualificationCount,0);
});
test('unsafe API structure, unbounded lookback or unsafe selection counts always fail closed',()=>{
 for(const bad of [[],[null],{},[{workflow_runs:null}]]){
  assert.throws(()=>selectOriginalRuns(bad,{nowMs:NOW}),/Invalid paginated/);
 }
 for(const opts of [{hours:0},{hours:LOOKBACK_HOURS+1},{maxRuns:MAX_RUNS+1},
  {maxRuns:0},{nowMs:NaN},{nowMs:1.9}]){
  assert.throws(()=>selectOriginalRuns([{workflow_runs:[]}],{nowMs:NOW,...opts}),
   /Invalid bounded/);
 }
});
test('source selection file writes only trusted numeric IDs in oldest-first order',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-gh-backfill-select-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const source=path.join(dir,'page.json'),ids=path.join(dir,'ids.txt');
 fs.writeFileSync(source,JSON.stringify([{workflow_runs:[
  item(44461104333,{created_at:new Date(NOW-1000).toISOString()}),
  item(44461104332,{created_at:new Date(NOW-15000).toISOString()})
 ]}]));
 const r=writeSelection(source,ids,{nowMs:NOW});
 assert.equal(r.originalRunIdsOldestFirst.length,2);
 assert.equal(fs.readFileSync(ids,'utf8'),'44461104332\n44461104333\n');
});
