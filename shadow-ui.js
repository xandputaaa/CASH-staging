'use strict';
(function(){
 const root=document.getElementById('shadowMonitor');
 if(!root)return;
 const el=id=>document.getElementById(id);
 const fmtTime=s=>{const d=new Date(s);return Number.isFinite(d.valueOf())?d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):'—'};
 function safe(str){return String(str).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
 function show(data){
  if(data.mode!=='PUBLIC_MARKET_FAVORED_ASK_V1'||data.qualifyingForModelAccuracy!==false||data.storageMode!=='VOLATILE_SERVER_SESSION')throw Error('Unverified shadow payload');
  el('shadowState').textContent='SESSION BASELINE · NOT VERIFIED';
  el('shadowState').className='shadow-state';
  el('shadowCount').textContent=String(Number(data.observed)||0);
  el('shadowPending').textContent=String(Number(data.pending)||0);
  el('shadowSettled').textContent=String(Number(data.settled)||0);
  el('shadowAccuracy').textContent=Number.isFinite(data.baselineDirectionalAccuracy)?
   (100*data.baselineDirectionalAccuracy).toFixed(1)+'%':'—';
  el('shadowGate').textContent='0 / 100 qualifying prospective model predictions';
  el('shadowSession').textContent='Monitoring since '+fmtTime(data.bootAt)+
    ' · '+(data.lastScanAt?'last scan '+fmtTime(data.lastScanAt):'first scan pending')+
    ' · local server memory, reset on redeploy';
  const rows=Array.isArray(data.recent)?data.recent.slice(0,8):[];
  el('shadowRows').innerHTML=rows.length?rows.map(x=>
    '<tr><td>'+safe(x.venue)+'</td><td>'+safe(x.baselineSide)+'</td><td>'+
    Math.round(Math.max(0,Number(x.leadMs)||0)/1000)+'s</td><td>'+safe(x.status)+'</td>'+
    '<td>'+safe(x.marketId)+'</td></tr>').join(''):
    '<tr><td colspan="5" class="muted">No pre-expiry baseline observations this server session</td></tr>';
 }
 async function refresh(){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),7000);
  try{
   const res=await fetch('/api/shadow',{signal:controller.signal,cache:'no-store'});
   if(!res.ok)throw Error('Unavailable monitor');
   show(await res.json());
  }catch{
   el('shadowState').textContent='MONITOR UNAVAILABLE';
   el('shadowState').className='shadow-state';
   el('shadowSession').textContent='Could not read this server session. No verified records can be inferred.';
  }finally{clearTimeout(timeout)}
 }
 refresh();
 if(typeof setInterval==='function')setInterval(refresh,20000);
 if(typeof document.addEventListener==='function')document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
})();
