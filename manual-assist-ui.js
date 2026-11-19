'use strict';
(function(){
 const root=document.getElementById('cashManualAssist');if(!root)return;
 const side=root.querySelector('#assistSide'),qty=root.querySelector('#assistQty');
 const status=root.querySelector('#assistStatus'),details=root.querySelector('#assistDetails');
 let serial=0;
 async function refresh(){
  const n=++serial;status.textContent='CHECKING PUBLIC MARKET';details.textContent='No trade recommendation or execution.';
  try{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
   let response;
   try{response=await fetch('/api/manual-assist?side='+encodeURIComponent(side.value)+'&contracts='+encodeURIComponent(qty.value),{cache:'no-store',signal:controller.signal});}
   finally{clearTimeout(timer)}
   if(n!==serial)return;
   if(!response.ok)throw Error('Unavailable');
   const r=await response.json();
   if(r.mode!=='MANUAL_INFORMATION_ONLY'||r.realOrdersEnabled!==false||r.executionAuthorized!==false)throw Error('Unsafe response');
   status.textContent=r.status==='INFORMATION_ONLY'?'ESTIMATE AVAILABLE · NOT A TRADE SIGNAL':'BLOCKED · DATA OR RISK CHECK';
   const usd=x=>Number.isFinite(x)?'$'+x.toFixed(2):'unavailable';
   details.textContent='Market: '+(r.marketId||'unavailable')+' | '+(r.side||'—')+' ask: '+(Number.isFinite(r.observedAsk)?(r.observedAsk*100).toFixed(1)+'¢':'—')+
    ' | Estimated fee: '+usd(r.estimatedFee)+' | Estimated maximum loss: '+usd(r.estimatedMaxLossUsd)+
    ' | $10 ceiling | '+(r.blockers?.length?'Checks: '+r.blockers.join(', '):'All preview checks passed')+
    '. Public quotes are not executable prices; actual fills and fees may differ. No independently validated model edge. Manual trades only.';
  }catch{if(n===serial){status.textContent='BLOCKED · FEED UNAVAILABLE';details.textContent='No current verified estimate. Do not rely on a previous quote.'}}
 }
 side.addEventListener('change',refresh);qty.addEventListener('change',refresh);
 refresh();setInterval(refresh,12000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();else{++serial;status.textContent='PAUSED · RECHECK';details.textContent='Return to refresh public data.'}});
})();
