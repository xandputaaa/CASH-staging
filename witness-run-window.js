'use strict';
/*
 * Bound and disclose GitHub witness search coverage. The earlier GitHub
 * reconciler silently kept only 24 successful runs from one page. With 4
 * cron slots per hour, 24 runs can be ~6 hours, not a full day. This helper
 * reads ALL API pages from GitHub's date-filtered workflow-run endpoint,
 * selects a bounded last-24h set, and explicitly reports any truncation.
 *
 * This is NOT a signing service, a model audit or independent qualification.
 */
const fs=require('node:fs'),path=require('node:path');
const HOURS=24,MAX_RUNS=192;
const RUN_ID=/^\d{8,16}$/;
function selectWitnessRuns(pages,{nowMs=Date.now(),hours=HOURS,maxRuns=MAX_RUNS}={}){
 if(!Number.isFinite(nowMs)||!Number.isInteger(hours)||hours<1||hours>48||
    !Number.isInteger(maxRuns)||maxRuns<1||maxRuns>MAX_RUNS)
  throw Error('Invalid bounded workflow witness search');
 const raw=Array.isArray(pages)?pages:[pages];
 if(!raw.length||raw.some(p=>!p||!Array.isArray(p.workflow_runs)))
  throw Error('GitHub paginated response missing workflow runs');
 const seen=new Set(),valid=[];
 const from=nowMs-hours*3600000;
 for(const page of raw){
  for(const r of page.workflow_runs){
   const id=String(r?.id||''),created=Date.parse(r?.created_at);
   if(!RUN_ID.test(id)||seen.has(id)||r?.conclusion!=='success'||
      !Number.isFinite(created)||created<from||created>nowMs+300000)
    continue;
   seen.add(id);
   valid.push(r);
  }
 }
 valid.sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||
  Number(b.id)-Number(a.id));
 const selected=valid.slice(0,maxRuns);
 return {
  source:'GITHUB_ACTIONS_WORKFLOW_RUNS_PAGINATED_DATE_FILTERED',
  windowStartedAt:new Date(from).toISOString(),
  windowEndedAt:new Date(nowMs).toISOString(),
  queriedPageCount:raw.length,
  recentSuccessfulRunsFound:valid.length,
  selectedSuccessfulRuns:selected.length,
  cappedAt:maxRuns,
  runSelectionTruncated:valid.length>maxRuns,
  // Retain only provenance fields used downstream; omit bulky GitHub API metadata.
  workflow_runs:selected.map(r=>({id:r.id,conclusion:r.conclusion,
   created_at:r.created_at,updated_at:r.updated_at,
   event:r.event||null,head_sha:r.head_sha||null}))
 };
}
function writeSelectedRuns(inputPath,outputPath,idsPath,opts={}){
 const pages=JSON.parse(fs.readFileSync(inputPath,'utf8'));
 const result=selectWitnessRuns(pages,opts);
 fs.mkdirSync(path.dirname(outputPath),{recursive:true});
 fs.writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n');
 fs.writeFileSync(idsPath,result.workflow_runs.map(x=>x.id).join('\n')+
  (result.workflow_runs.length?'\n':''));
 console.log('CASH_WITNESS_RUN_PAGES='+result.queriedPageCount);
 console.log('CASH_WITNESS_RUNS_FOUND_24H='+result.recentSuccessfulRunsFound);
 console.log('CASH_WITNESS_RUNS_SELECTED_24H='+result.selectedSuccessfulRuns);
 console.log('CASH_WITNESS_RUNS_TRUNCATED='+result.runSelectionTruncated);
 console.log('CASH_WITNESS_SEARCH_WINDOW_START='+result.windowStartedAt);
 return result;
}
if(require.main===module){
 const [inputPath,outputPath,idsPath]=process.argv.slice(2);
 if(!inputPath||!outputPath||!idsPath)
  throw Error('Usage: node witness-run-window.js PAGES_JSON SELECTED_JSON RUN_ID_TXT');
 writeSelectedRuns(inputPath,outputPath,idsPath);
}
module.exports={selectWitnessRuns,writeSelectedRuns,HOURS,MAX_RUNS};
