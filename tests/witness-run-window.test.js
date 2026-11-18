'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {selectWitnessRuns,writeSelectedRuns}=require('../witness-run-window');
const NOW=Date.parse('2026-11-18T04:00:00Z');
function run(id,minutesAgo,{conclusion='success',event='schedule'}={}){
 return {id,conclusion,event,
  created_at:new Date(NOW-minutesAgo*60000).toISOString(),
  updated_at:new Date(NOW-minutesAgo*60000+10000).toISOString()};
}
test('the previous 24-run observer cap is removed without silently losing run 25+',()=>{
 const pages=[{workflow_runs:Array.from({length:100},(_,i)=>
  run(44220000000+i,24*60-i*5))},
 {workflow_runs:Array.from({length:12},(_,i)=>
  run(44220000100+i,7*60-i*5))}];
 const x=selectWitnessRuns(pages,{nowMs:NOW});
 assert.equal(x.queriedPageCount,2);
 assert.equal(x.recentSuccessfulRunsFound,112);
 assert.equal(x.selectedSuccessfulRuns,112);
 assert.equal(x.runSelectionTruncated,false);
 assert.ok(x.workflow_runs.length>24);
 assert.equal(x.workflow_runs[0].id,44220000111);
 assert.equal(x.workflow_runs.some(x=>x.id===44220000001),true);
});
test('filters failed runs, duplicates, out-of-window and future timestamps',()=>{
 const x=selectWitnessRuns([
  {workflow_runs:[run(44230000001,4),run(44230000002,60*25),
   run(44230000003,3,{conclusion:'failure'}),run(44230000004,-30)]},
  {workflow_runs:[run(44230000001,4),run(44230000005,60*23)]}
 ],{nowMs:NOW});
 assert.deepEqual(x.workflow_runs.map(x=>x.id),[44230000001,44230000005]);
 assert.equal(x.selectedSuccessfulRuns,2);
});
test('explicitly reports truncated witness run retrieval when over the safety cap',()=>{
 const pages=[{workflow_runs:Array.from({length:200},(_,i)=>run(44240000000+i,i*2))}];
 const x=selectWitnessRuns(pages,{nowMs:NOW,maxRuns:40});
 assert.equal(x.recentSuccessfulRunsFound,200);
 assert.equal(x.selectedSuccessfulRuns,40);
 assert.equal(x.runSelectionTruncated,true);
 assert.equal(x.cappedAt,40);
});
test('serializes a paginated GitHub result and a newline-safe selected ID list',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-witness-index-'));
 try{
  const infile=path.join(dir,'pages.json'),outfile=path.join(dir,'selection.json'),
   ids=path.join(dir,'ids.txt');
  fs.writeFileSync(infile,JSON.stringify([{workflow_runs:[run(44250000001,4),
   run(44250000002,10)]}]));
  const result=writeSelectedRuns(infile,outfile,ids,{nowMs:NOW});
  const saved=JSON.parse(fs.readFileSync(outfile));
  assert.equal(result.selectedSuccessfulRuns,2);
  assert.equal(saved.workflow_runs.length,2);
  assert.equal(saved.windowStartedAt,'2026-11-17T04:00:00.000Z');
  assert.equal(fs.readFileSync(ids,'utf8'),'44250000001\n44250000002\n');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('rejects incomplete paginated API payloads and unbounded searches',()=>{
 assert.throws(()=>selectWitnessRuns([], {nowMs:NOW}),/GitHub paginated/);
 assert.throws(()=>selectWitnessRuns([{message:'api error'}],{nowMs:NOW}),/GitHub paginated/);
 assert.throws(()=>selectWitnessRuns([{workflow_runs:[]}],{nowMs:NOW,maxRuns:999}),/Invalid bounded/);
});

test('retains necessary provenance while dropping oversized GitHub API payload fields',()=>{
 const huge=run(44260000001,3);
 huge.head_sha='a'.repeat(40);
 huge.extra_payload='x'.repeat(200000);
 const result=selectWitnessRuns([{workflow_runs:[huge]}],{nowMs:NOW});
 const compact=result.workflow_runs[0];
 assert.equal(compact.id,huge.id);
 assert.equal(compact.created_at,huge.created_at);
 assert.equal(compact.updated_at,huge.updated_at);
 assert.equal(compact.event,'schedule');
 assert.equal(compact.head_sha,huge.head_sha);
 assert.equal(compact.conclusion,'success');
 assert.equal(Object.hasOwn(compact,'extra_payload'),false);
 assert.ok(Buffer.byteLength(JSON.stringify(result))<2000);
});
