'use strict';
(function(){
 const root=document.getElementById('cashEarlyMove');if(!root)return;
 const el=id=>document.getElementById(id);
 const set=(id,str)=>{const node=el(id);if(node)node.textContent=str;};
 const money=n=>Number.isFinite(n)?'$'+n.toLocaleString('en-US',{
  minimumFractionDigits:2,maximumFractionDigits:2}):'—';
 const pct=n=>Number.isFinite(n)?(n*100).toFixed(1)+'%':'—';
 function plot(data){
  const svg=el('earlyChart'),line=el('earlyActual'),forecast=el('earlyProjected'),
    cursor=el('earlyCursor'),label=el('earlyChartLabel');
  if(!svg||!line||!forecast||!cursor)return;
  const hist=(Array.isArray(data.history)?data.history:[]).filter(p=>
   Number.isFinite(p.price)&&Number.isFinite(Date.parse(p.time)));
  if(hist.length<2){line.setAttribute('points','');forecast.setAttribute('points','');
   set('earlyChartLabel','Not enough live spot history yet.');return}
  const last=hist.at(-1),at=Date.parse(last.time),start=at-240000;
  const visible=hist.filter(p=>Date.parse(p.time)>=start&&Date.parse(p.time)<=at);
  const call=data.active;
  const projection=call&&call.side&&Number.isFinite(call.forecastPrice)&&
   Number.isFinite(Date.parse(call.at))&&
   Date.parse(call.at)<=at&&Date.parse(call.dueAt)>Date.now()?call:null;
  const values=visible.map(x=>x.price);
  if(projection)values.push(projection.forecastPrice);
  const low=Math.min(...values),high=Math.max(...values);
  const pad=Math.max(10,(high-low)*.18),bottom=low-pad,top=high+pad;
  const y=price=>Math.max(14,Math.min(194,194-(price-bottom)/(top-bottom)*180));
  const x=t=>Math.max(20,Math.min(452,20+(t-start)/240000*432));
  line.setAttribute('points',visible.map(p=>
   x(Date.parse(p.time)).toFixed(1)+','+y(p.price).toFixed(1)).join(' '));
  cursor.setAttribute('x1','452');cursor.setAttribute('x2','452');
  cursor.setAttribute('y1','12');cursor.setAttribute('y2','203');
  if(projection){
   const startPoint=visible.findLast(p=>Date.parse(p.time)<=Date.parse(projection.at));
   if(startPoint){
    forecast.setAttribute('points',x(Date.parse(startPoint.time)).toFixed(1)+','+
     y(startPoint.price).toFixed(1)+' 579,'+y(projection.forecastPrice).toFixed(1));
    forecast.setAttribute('stroke',projection.side==='UP'?'#66d9ae':'#f68089');
   }else forecast.setAttribute('points','');
  }else forecast.setAttribute('points','');
  label.textContent='PUBLIC BTC SPOT · '+money(last.price)+
   ' · solid = observed · dashed = speculative next 45s · NOT Kalshi contract price';
 }
 function fail(){
  set('earlyState','DATA UNAVAILABLE');set('earlySide','WAIT');
  set('earlyExplanation','No fresh, verifiable public spot history. No early forecast available.');
  set('earlyAccuracy','—');set('earlyCounts','—');
  el('earlyActual')?.setAttribute('points','');
  el('earlyProjected')?.setAttribute('points','');
 }
 async function refresh(){
  const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),6500);
  try{
   const res=await fetch('/api/early-move',{cache:'no-store',signal:ctrl.signal});
   if(!res.ok)throw Error('Feed unavailable');
   const a=await res.json();
   if(a.version!=='CASH_SPOT_EARLY_MOVE_V1'||a.modelCalibrated!==false||
     a.tradingAuthorized!==false||a.automaticOrdersEnabled!==false||
     a.independentlyTimeAttested!==false||a.independentValidation!==0)
    throw Error('Unsafe early signal');
   const call=a.active;
   const side=call?.side;
   set('earlyState',side?'EARLY CALL FROZEN · NOT VALIDATED':'WAIT · RESEARCH ONLY');
   set('earlySide',side==='UP'?'↑ UP / NEXT 45s':side==='DOWN'?'↓ DOWN / NEXT 45s':'WAIT · NO EARLY CALL');
   el('earlySide').style.color=side==='UP'?'#66d9ae':side==='DOWN'?'#f68089':'#e8b879';
   set('earlyExplanation',call?
    'Frozen at '+new Date(call.at).toLocaleTimeString()+
    '. Public '+call.source+' spot only. Check after '+
    new Date(call.dueAt).toLocaleTimeString()+
    '. This does not predict Kalshi YES/NO settlement.':
    'No active frozen short-horizon call. Reason: '+
    String(a.lastReason||'NOT_READY').replaceAll('_',' ')+
    '. Calls require roughly 90s of continuous live spot observations.');
   set('earlyAccuracy',pct(a.hitRate)+' · experimental');
   set('earlyCounts',a.scored+' scored / '+a.hits+' hits / '+a.misses+
    ' misses · '+a.waits+' waits · '+a.unobserved+' unobserved');
   set('earlyUpdates',a.spotFresh?'LIVE SPOT REFERENCE':'SPOT STALE · NO NEW CALL');
   plot(a);
  }catch{fail()}
  finally{clearTimeout(timeout)}
 }
 refresh();
 if(typeof setInterval==='function')setInterval(refresh,5000);
 if(typeof document.addEventListener==='function')document.addEventListener('visibilitychange',()=>{
  if(!document.hidden)refresh();
 });
})();