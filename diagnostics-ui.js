'use strict';
(function(){
 const root=document.getElementById('cashDiagnostics');if(!root)return;
 const el=id=>document.getElementById(id);
 const label=(x)=>({LIVE:'LIVE',PARTIAL:'PARTIAL',STALE:'STALE',OFFLINE:'OFFLINE'}[x]||'UNAVAILABLE');
 const age=x=>Number.isFinite(x)&&x>=0?' · '+Math.round(x/1000)+'s old':'';
 function show(data){
  if(data?.mode!=='SIMULATION_ONLY'||data?.validation?.realOrdersEnabled!==false||
    data.validation.qualifyingProspectiveContracts!==0||
    !['LIVE','DEGRADED','OFFLINE'].includes(data.dataStatus))throw Error('Invalid diagnostic state');
  const status=el('diagnosticStatus');
  status.textContent=data.dataStatus==='LIVE'?'DATA LIVE · SIMULATION ONLY':
    data.dataStatus==='DEGRADED'?'DATA DEGRADED · SIMULATION ONLY':'DATA OFFLINE · SIMULATION ONLY';
  status.className='diagnostic-state '+(data.dataStatus==='LIVE'?'live':'');
  for(const [key,id] of [['spot','diagnosticSpot'],['Kalshi','diagnosticKalshi'],['Polymarket','diagnosticPoly']]){
   const f=data.feeds?.[key];if(!f)throw Error('Incomplete feed status');
   el(id).textContent=label(f.state)+age(f.ageMs);
   el(id).className=f.state==='LIVE'?'good':f.state==='OFFLINE'?'bad':'';
  }
  el('diagnosticMonitor').textContent=data.monitor?.state||'UNAVAILABLE';
  const collecting=data.monitor?.collectionState||'UNKNOWN';
  el('diagnosticCoverage').textContent=collecting.replaceAll('_',' ')+' · '+
   (Number(data.monitor?.eligibleVenueCount)||0)+'/2 eligible';
  el('diagnosticGaps').textContent=(Number(data.monitor?.longGaps)||0)+' long gaps · '+
   (Number(data.monitor?.consecutiveNoEligibleScans)||0)+' scans without eligible quotes';
  el('diagnosticGate').textContent='0 / '+(Number(data.validation.requiredProspectiveContracts)||100)+' verified';
  el('diagnosticStorage').textContent=data.validation.storageMode==='VOLATILE_SERVER_SESSION'?
   'Server-session only · resets on redeploy':'Local journal · independent retention unverified';
  el('diagnosticReason').textContent=data.validation.blockers?.[0]||
   'Independent model validation is incomplete';
  el('diagnosticChecked').textContent='Checked '+new Date(data.generatedAt).toLocaleTimeString()+
   ' · read-only cached status, no trade authorization';
 }
 async function refresh(){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6500);
  try{
   const response=await fetch('/api/diagnostics',{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error('Diagnostic API unavailable');
   show(await response.json());
  }catch{
   el('diagnosticStatus').textContent='DIAGNOSTICS UNAVAILABLE';
   el('diagnosticStatus').className='diagnostic-state';
   for(const id of ['diagnosticSpot','diagnosticKalshi','diagnosticPoly','diagnosticMonitor',
     'diagnosticCoverage','diagnosticGaps'])el(id).textContent='UNAVAILABLE';
   el('diagnosticGate').textContent='0 / 100 verified';
   el('diagnosticReason').textContent='Could not verify status; do not rely on previous live indicators';
   el('diagnosticChecked').textContent='Last successful check unavailable';
  }finally{clearTimeout(timer)}
 }
 refresh();
 if(typeof setInterval==='function')setInterval(refresh,12000);
 if(typeof document.addEventListener==='function')document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
})();
