'use strict';
(function(){
 const root=document.getElementById('cashProspective');
 if(!root)return;
 const el=id=>document.getElementById(id);
 const pct=x=>Number.isFinite(x)?(x*100).toFixed(1)+'%':'—';
 const set=(id,value)=>{const x=el(id);if(x)x.textContent=value};
 const simpleCall=el('simpleForecast');
 function missing(){
  set('pfStatus','FORECAST DATA UNAVAILABLE');
  set('pfSide','NO FROZEN FORECAST');
  set('pfCount','—');set('pfScored','—');set('pfAccuracy','—');
  set('pfContext','Could not verify prospective model records. No real-money signal is available.');
  if(simpleCall)simpleCall.textContent='Experimental model record unavailable. No verified pick.';
 }
 async function refresh(){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),7000);
  try{
   const response=await fetch('/api/prospective',{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error('No report');
   const r=await response.json();
   if(r.version!=='CASH_PROSPECTIVE_KALSHI_V1'||r.qualifiedCount!==0||
    r.tradingAuthorized!==false||r.automatedOrdersEnabled!==false||
    r.independentlyTimeAttested!==false||r.modelCalibrated!==false)
    throw Error('Unsafe model state');
   set('pfStatus','UNVALIDATED · REAL CALLS DISABLED');
   set('pfCount',r.directional+' frozen directions · '+r.waits+' waits');
   set('pfScored',r.officiallyScored+' paired official settlements');
   set('pfAccuracy',pct(r.hitRate)+' exploratory, NOT validated');
   const v=r.active;
   const dir=v?.side;
   set('pfSide',dir?'CURRENT PROVISIONAL '+dir:'NO ACTIVE FROZEN DIRECTION');
   const why=r.captureReadiness?.lastReason||'NOT_CHECKED';
   const status=why.replaceAll('_',' ');
   const mode=v?.indexSourceType==='OFFICIAL_BRTI_LIVE'?
    'private official index research':'public BTC proxy research';
   set('pfContext',v?
    'Frozen '+new Date(v.at).toLocaleTimeString()+' · '+v.reason.replaceAll('_',' ')+
    ' · expires '+new Date(v.endTime).toLocaleTimeString()+
    ' · '+mode+' · NOT an authorized live-money signal':
    'No CURRENT unexpired frozen forecast. Last scanner assessment: '+status+
    '. Model only freezes 1.5–4 minutes before Kalshi expiry, with continuous past-only market history.');
   if(simpleCall)simpleCall.textContent=dir?
    'Current experimental CASH direction: '+dir+' (UNVALIDATED, not a real-money recommendation).':
    'NO CURRENT EXPERIMENTAL FORECAST. Last check: '+status+'. No verified pick.';
  }catch{missing()}
  finally{clearTimeout(timeout)}
  try{
   const res=await fetch('/api/brti-health',{cache:'no-store'});
   if(res.ok){
    const b=await res.json();
    set('pfBrti',b.state==='LIVE'?
     'Official BRTI authenticated data: connected privately; NOT YET used in forecast model.':
     'Official BRTI: '+String(b.state||'UNKNOWN').replaceAll('_',' ')+
      '. CASH still uses a public exchange proxy for experimental predictions.');
   }else{set('pfBrti','Official BRTI connection status unavailable.')}
  }catch{set('pfBrti','Official BRTI connection status unavailable.')}
 }
 refresh();
 if(typeof setInterval==='function')setInterval(refresh,20000);
 if(typeof document.addEventListener==='function')document.addEventListener('visibilitychange',()=>{
  if(!document.hidden)refresh();
 });
})();
