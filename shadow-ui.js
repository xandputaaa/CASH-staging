'use strict';
(function(){
 const root=document.getElementById('shadowMonitor');
 if(!root)return;
 const el=id=>document.getElementById(id);
 const fmtTime=s=>{const d=new Date(s);return Number.isFinite(d.valueOf())?d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):'—'};
 function safe(str){return String(str).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
 function show(data){
  if(data.mode!=='PUBLIC_MARKET_FAVORED_ASK_V1'||data.qualifyingForModelAccuracy!==false||!['VOLATILE_SERVER_SESSION','FILESYSTEM_JOURNAL_UNVERIFIED'].includes(data.storageMode))throw Error('Unverified shadow payload');
  el('shadowState').textContent=data.storageMode==='FILESYSTEM_JOURNAL_UNVERIFIED'?'FILESYSTEM JOURNAL · UNVERIFIED':'SESSION BASELINE · NOT VERIFIED';
  el('shadowState').className='shadow-state';
  el('shadowCount').textContent=String(Number(data.observed)||0);
  el('shadowPending').textContent=String(Number(data.pending)||0);
  el('shadowSettled').textContent=String(Number(data.settled)||0);
  el('shadowAccuracy').textContent=Number.isFinite(data.baselineDirectionalAccuracy)?
   (100*data.baselineDirectionalAccuracy).toFixed(1)+'%':'—';
  if(data.spotCandidateQualified===true)throw Error('Unverified signal was marked qualified');
  el('spotCandidateCount').textContent=String(Number(data.spotCandidateObservations)||0);
  el('spotCandidateSettled').textContent=String(Number(data.spotCandidateSettled)||0);
  el('spotCandidateCorrect').textContent=String(Number(data.spotCandidateCorrect)||0);
  el('spotCandidateAccuracy').textContent=Number.isFinite(data.spotCandidateAccuracy)?
    (100*data.spotCandidateAccuracy).toFixed(1)+'%':'—';
  el('shadowGate').textContent='0 / 100 qualifying prospective model predictions';
  el('shadowChecks').textContent='Official settlement checks: '+(Number(data.totalSettlementChecks)||0)+' · pending outcomes are never inferred from the clock';
  el('shadowSession').textContent='Monitoring since '+fmtTime(data.bootAt)+
    ' · '+(data.lastScanAt?'last scan '+fmtTime(data.lastScanAt):'first scan pending')+
    ' · '+(data.storageMode==='FILESYSTEM_JOURNAL_UNVERIFIED'?'local journal configured; mount durability unverified':'local server memory, reset on redeploy');
  el('shadowStorageNote').textContent=data.storageMode==='FILESYSTEM_JOURNAL_UNVERIFIED'?'Filesystem journal configured; '+(Number(data.recoveredEvents)||0)+' events were replayed at startup. Independent timestamps, volume persistence and qualified accuracy are NOT verified.':'No persistent Railway volume attached: session memory resets when the server restarts or redeploys. No qualifying forecasts are retained.';
  const rows=Array.isArray(data.recent)?data.recent.slice(0,8):[];
  el('shadowRows').innerHTML=rows.length?rows.map(x=>
    '<tr><td>'+safe(x.venue)+'</td><td>'+safe(x.baselineSide)+'</td><td>'+safe(
      x.spotCandidate?.predictedContractSide
       ?x.spotCandidate.predictedContractSide+(x.status==='PENDING'?' · pending':x.status==='VOID'?' · void':x.winner===x.spotCandidate.predictedContractSide?' · hit':' · miss')
       :'—')+'</td><td>'+
    Math.round(Math.max(0,Number(x.leadMs)||0)/1000)+'s</td><td>'+safe(x.status)+'</td><td>'+safe((Number(x.settlementAttempts)||0)+' checks'+(x.pendingReason?' · '+x.pendingReason:''))+'</td>'+
    '<td>'+safe(x.marketId)+'</td></tr>').join(''):
    '<tr><td colspan="7" class="muted">No pre-expiry baseline observations this server session</td></tr>';
 }
 async function refresh(){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),7000);
  try{
   const res=await fetch('/api/shadow',{signal:controller.signal,cache:'no-store'});
   if(!res.ok)throw Error('Unavailable monitor');
   show(await res.json());
  }catch{
   el('shadowState').textContent='MONITOR UNAVAILABLE';
   for(const id of ['spotCandidateCount','spotCandidateSettled','spotCandidateCorrect','spotCandidateAccuracy'])el(id).textContent='—';
   el('shadowState').className='shadow-state';
   el('shadowSession').textContent='Could not read this server session. No verified records can be inferred.';
   el('shadowChecks').textContent='Official settlement check status unavailable';
   el('shadowStorageNote').textContent='Monitor state could not be verified. Do not rely on previous readings.';
  }finally{clearTimeout(timeout)}
 }
 refresh();
 if(typeof setInterval==='function')setInterval(refresh,20000);
 if(typeof document.addEventListener==='function')document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
})();
