'use strict';
(function(){
 const root=document.getElementById('cashCognition');
 if(!root)return;
 const el=id=>document.getElementById(id);
 function render(state){
  if(state?.name!=='CASH_COGNITIVE_CORE_V1'||
   state.nature!=='DETERMINISTIC_METACOGNITION_NOT_SENTIENCE'||
   state.tradingAllowed!==false||
   state.automaticOrdersEnabled!==false||
   state.autonomousModelUpdatesEnabled!==false||
   state.qualifyingProspectiveContracts!==0||
   state.executionDecision!=='ABSTAIN_FROM_REAL_MONEY_TRADING')
    throw Error('Unsafe or invalid cognitive payload');
  el('cognitionState').textContent=state.state.replaceAll('_',' ');
  el('cognitionState').className='shadow-state';
  el('cognitionAwareness').textContent='CASH self-check · '+state.selfAssessment.issues+
   ' active findings · '+state.selfAssessment.criticalIssues+' highest priority';
  el('cognitionConstraint').textContent=state.selfAssessment.mainConstraint;
  const attention=Array.isArray(state.attention)?state.attention.slice(0,3):[];
  el('cognitionReasons').replaceChildren();
  for(const issue of attention){
   const p=document.createElement('p');
   p.className='notice';
   p.textContent=issue.title+' — '+issue.detail;
   el('cognitionReasons').appendChild(p);
  }
  const steps=Array.isArray(state.proposedSafeSteps)?state.proposedSafeSteps.slice(0,2):[];
  el('cognitionNext').textContent=steps.map(x=>x.step).join(' ');
  el('cognitionUpdated').textContent='Read-only · refreshed '+
   new Date(state.generatedAt).toLocaleTimeString()+
   ' · no autonomous orders or self-modification';
 }
 async function refresh(){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),7000);
  try{
   const response=await fetch('/api/cognition',{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error('Cognitive self-check unavailable');
   render(await response.json());
  }catch{
   el('cognitionState').textContent='UNAVAILABLE · NO CALL';
   el('cognitionAwareness').textContent='The self-check could not verify current state.';
   el('cognitionConstraint').textContent='No evidence-based decision is available.';
   el('cognitionReasons').replaceChildren();
   el('cognitionNext').textContent='Review operational diagnostics; never infer trading readiness.';
   el('cognitionUpdated').textContent='No independent forecast validation · real orders disabled';
  }finally{clearTimeout(timeout)}
 }
 refresh();
 if(typeof setInterval==='function')setInterval(refresh,12000);
 if(typeof document.addEventListener==='function')
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
})();
