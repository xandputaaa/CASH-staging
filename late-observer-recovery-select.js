'use strict';
/*
 * Select a small set of completed original GitHub-runner observations for
 * recovery from their STILL-EXISTING GitHub Actions artifacts.
 * No server source fetch, no outcome-based selection, and no backdating.
 * Actual original/parent run provenance is verified by late-observer-archive
 * against separate direct GitHub API requests before any write.
 */
const fs=require('node:fs'),path=require('node:path');
const REPO='xandputaaa/CASH-staging';
const WORKFLOW='CASH pre-expiry public research observer';
const MAX_RUNS=24,LOOKBACK_HOURS=48;
const ID=/^[0-9]{8,16}$/;
function selectOriginalRuns(pages,{nowMs=Date.now(),hours=LOOKBACK_HOURS,
 maxRuns=MAX_RUNS}={}){
 if(!Number.isSafeInteger(nowMs)||!Number.isInteger(hours)||hours<1||
    hours>LOOKBACK_HOURS||!Number.isInteger(maxRuns)||maxRuns<1||
    maxRuns>MAX_RUNS)
  throw Error('Invalid bounded original GH run recovery parameters');
 const a=Array.isArray(pages)?pages:[pages];
 if(!a.length||a.some(p=>!p||!Array.isArray(p.workflow_runs)))
  throw Error('Invalid paginated original GitHub observer response');
 const seen=new Set(),eligible=[],min=nowMs-hours*3600000;
 for(const p of a){
  for(const x of p.workflow_runs){
   const id=String(x?.id||''),when=Date.parse(x?.created_at);
   if(!ID.test(id)||seen.has(id)||x?.name!==WORKFLOW||
      !['schedule','workflow_run'].includes(x.event)||
      x?.status!=='completed'||x?.conclusion!=='success'||
      x?.head_branch!=='main'||
      (x.head_repository?.full_name||x.repository?.full_name)!==REPO||
      !Number.isFinite(when)||when<min||when>nowMs+300000)
    continue;
   seen.add(id);
   eligible.push({id,createdAt:when,event:x.event});
  }
 }
 eligible.sort((x,y)=>y.createdAt-x.createdAt||
  Number(y.id)-Number(x.id));
 const selected=eligible.slice(0,maxRuns);
 selected.reverse(); // archive in chronological, not outcome-favorable order
 return {version:'CASH_LATE_ORIGINAL_GH_RECOVERY_SELECTION_V1',
  source:'GITHUB_API_COMPLETED_SUCCESSFUL_OBSERVER_MAIN',
  eligibleRecentOriginalRuns:eligible.length,
  limited:eligible.length>maxRuns,limit:maxRuns,
  originallyCreatedWindowStart:new Date(min).toISOString(),
  originalRunIdsOldestFirst:selected.map(x=>x.id),
  independentQualificationCount:0,ordersEnabled:false};
}
function writeSelection(inputFile,idsFile,opts={}){
 const pages=JSON.parse(fs.readFileSync(inputFile,'utf8'));
 const r=selectOriginalRuns(pages,opts);
 fs.mkdirSync(path.dirname(idsFile),{recursive:true});
 fs.writeFileSync(idsFile,r.originalRunIdsOldestFirst.join('\n')+
  (r.originalRunIdsOldestFirst.length?'\n':''));
 console.log('CASH_LATE_RECOVERY_ELIGIBLE_ORIGINAL_RUNS='+r.eligibleRecentOriginalRuns);
 console.log('CASH_LATE_RECOVERY_SELECTED='+r.originalRunIdsOldestFirst.length);
 console.log('CASH_LATE_RECOVERY_SELECTION_LIMITED='+r.limited);
 console.log('CASH_LATE_RECOVERY_INDEPENDENTLY_QUALIFIED=0');
 return r;
}
if(require.main===module){
 const [inputFile,idsFile]=process.argv.slice(2);
 if(!inputFile||!idsFile)
  throw Error('Usage: node late-observer-recovery-select.js RUN-PAGES.json RUN-IDS.txt');
 writeSelection(inputFile,idsFile);
}
module.exports={selectOriginalRuns,writeSelection,LOOKBACK_HOURS,MAX_RUNS};
