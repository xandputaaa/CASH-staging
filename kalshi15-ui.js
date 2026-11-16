'use strict';
(function(){
 const root=document.getElementById('kalshi15Terminal');if(!root)return;
 const el=id=>document.getElementById(id);
 const price=n=>Number.isFinite(n)?'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
 const cents=n=>Number.isFinite(n)?(n*100).toFixed(1)+'¢':'—';
 let latest=null;let updateAt=null;let timeoutId=null;
 function fail(){
  latest=null;el('k15Status').textContent='NO CALL · DATA UNAVAILABLE';
  el('k15Status').className='shadow-state';
  for(const id of ['k15Target','k15Yes','k15No','k15Bid','k15Remaining',
    'k15Ticker','k15Spot','k15Signal','k15Fresh','k15AskSum'])el(id).textContent='—';
  el('k15Reasons').textContent='Could not verify current market. Do not use previously displayed prices.';
  el('k15Updated').textContent='No live verification · real-money calls disabled';
 }
 function countdown(){
  if(!latest)return;
  const end=Date.parse(latest.clock?.endTime),ms=end-Date.now();
  el('k15Remaining').textContent=Number.isFinite(end)?
   Math.floor(Math.max(0,ms)/60000)+':'+String(Math.floor(Math.max(0,ms)%60000/1000)).padStart(2,'0'):'—';
  if(ms<=0){
   el('k15Status').textContent='WINDOW CLOSED · RECHECK';
   el('k15Status').className='shadow-state';
  }
  if(updateAt&&Date.now()-updateAt>20000){
   el('k15Status').textContent='STALE · NO CALL';
   el('k15Status').className='shadow-state';
  }
 }
 function show(data){
  if(data?.version!=='CASH_KALSHI15_TERMINAL_V1'||
   data.realTradingAuthorized!==false||data.automaticOrdersEnabled!==false||
   data.independentForecastValidation!==0||data.liveDecision!=='NO_CALL_MODEL_NOT_VALIDATED'||
   !['NO_CALL','PAPER_MONITOR_READY'].includes(data.displayState))
   throw Error('Invalid Kalshi15 gate');
  latest=data;updateAt=Date.now();
  const st=data.displayState==='PAPER_MONITOR_READY'?'PAPER DATA READY':'NO CALL';
  el('k15Status').textContent=st+' · REAL ORDERS DISABLED';
  el('k15Status').className='shadow-state';
  el('k15Ticker').textContent=data.marketId||'No current market identifier';
  el('k15Target').textContent=price(data.target?.value);
  el('k15Yes').textContent=cents(data.market?.yesAsk);
  el('k15No').textContent=cents(data.market?.noAsk);
  el('k15Bid').textContent=cents(data.market?.yesBid);
  el('k15Spot').textContent=data.spotReference?.price!=null?
   price(data.spotReference.price)+' · '+data.spotReference.source+' (NOT BRTI)':'Not available — BRTI not connected';
  el('k15Signal').textContent=data.experimentalCandidate?.side?
   data.experimentalCandidate.side+' · experimental spot observation, NOT a verified call':
   'NO INDEPENDENTLY VALIDATED FORECAST';
  el('k15Fresh').textContent=Number.isFinite(data.clock?.quoteAgeMs)?
   (data.clock.quoteAgeMs/1000).toFixed(0)+' seconds since public quote':'Quote age unknown';
  el('k15AskSum').textContent=Number.isFinite(data.market?.askSum)?
   cents(data.market.askSum)+' combined asks · fees and slippage excluded':'Combined asks unavailable';
  el('k15Reasons').textContent=data.blockers?.length?
   data.blockers.join(' · '):
   'Public data meets PAPER monitoring checks. No independently verified BRTI forecast or positive trading edge established.';
  el('k15Updated').textContent='Snapshot '+new Date(data.updatedAt).toLocaleTimeString()+
   ' · real-money confidence unavailable · 0 / 100 independently verified';
  countdown();
 }
 async function refresh(){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8500);
  try{
   const resp=await fetch('/api/kalshi15',{cache:'no-store',signal:controller.signal});
   if(!resp.ok)throw Error('Kalshi terminal feed unavailable');
   show(await resp.json());
  }catch{fail()}
  finally{clearTimeout(timer)}
 }
 refresh();
 if(typeof setInterval==='function'){
  setInterval(refresh,12000);
  setInterval(countdown,1000);
 }
 if(typeof document.addEventListener==='function')
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
})();
