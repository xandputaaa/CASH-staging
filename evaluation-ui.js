'use strict';
(function(){
 const root=document.getElementById('cashEvaluation');
 if(!root)return;
 const el=id=>document.getElementById(id);
 const pct=x=>Number.isFinite(x)?(100*x).toFixed(1)+'%':'—';
 const count=x=>Number.isSafeInteger(x)&&x>=0?String(x):'—';
 function draw(report){
  if(report?.report!=='CASH_EXPERIMENTAL_SPOT_EVALUATION_V1'||
     report.mode!=='DESCRIPTIVE_SESSION_ONLY'||
     report.qualification?.state!=='NOT_VALIDATED'||
     report.qualification?.prospectiveIndependentAttested!==0||
     report.qualification?.realOrdersEnabled!==false)
    throw Error('Unexpected evaluation status');
  const total=report.total;
  if(!total||total.hits+total.misses!==total.scored||
     total.scored>total.sampleBacked||total.sampleBacked>total.candidates)
    throw Error('Inconsistent evaluation denominator');
  el('evaluationState').textContent=report.evaluationState==='EXPLORATORY_ONLY'?
   'EXPLORATORY · NOT VALIDATED':'INSUFFICIENT EVIDENCE';
  el('evaluationScored').textContent=count(total.scored);
  el('evaluationPending').textContent=count(total.awaitingExpiry+total.unresolvedAfterExpiry);
  el('evaluationUnproven').textContent=count(total.missingSettlementEvidence+
   total.legacyWithoutWindow+total.invalidCandidate);
  el('evaluationRate').textContent=total.scored?pct(total.hitRate):'—';
  el('evaluationCoverage').textContent='Sample-backed: '+count(total.sampleBacked)+
   ' / '+count(total.candidates)+' recorded candidates · settled evidence coverage '+
   pct(total.resultCoverage);
  el('evaluationMissing').textContent='Unresolved after expiry: '+
   count(total.unresolvedAfterExpiry)+' ('+count(total.overdueWithoutOutcome)+
   ' overdue) · void outcomes: '+count(total.voided)+
   ' · missing/invalid settlement evidence: '+count(total.missingSettlementEvidence);
  const venue=v=>{
   const x=report.venues?.[v];
   return v+': '+count(x?.scored)+' scored, '+
    count(x?.hits)+' hits, '+count(x?.misses)+' misses, rate '+pct(x?.hitRate);
  };
  el('evaluationVenues').textContent=venue('Kalshi')+' | '+venue('Polymarket');
  el('evaluationUncertainty').textContent=total.wilson95?
   'Naïve Wilson 95% interval: '+pct(total.wilson95.lower)+'–'+pct(total.wilson95.upper)+
    ' · does not account for biased or missing samples':
   'No outcome-backed candidate sample to estimate sampling uncertainty';
  el('evaluationUpdated').textContent='Session-only snapshot · '+
   new Date(report.evaluatedAt).toLocaleTimeString()+
   ' · 0 / 100 independently verified prospective forecasts';
 }
 async function refresh(){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7500);
  try{
   const res=await fetch('/api/evaluation',{cache:'no-store',signal:controller.signal});
   if(!res.ok)throw Error('Evaluation API unavailable');
   draw(await res.json());
  }catch{
   el('evaluationState').textContent='EVALUATION UNAVAILABLE';
   for(const id of ['evaluationScored','evaluationPending','evaluationUnproven',
    'evaluationRate','evaluationCoverage','evaluationMissing','evaluationVenues',
    'evaluationUncertainty'])el(id).textContent='—';
   el('evaluationUpdated').textContent='Cannot verify evidence. No results can be inferred.';
  }finally{clearTimeout(timer)}
 }
 refresh();
 if(typeof setInterval==='function')setInterval(refresh,20000);
 if(typeof document.addEventListener==='function')document.addEventListener('visibilitychange',()=>{
  if(!document.hidden)refresh();
 });
})();
