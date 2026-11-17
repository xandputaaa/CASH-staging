'use strict';
/* Directly test the SAME read-only app endpoint from the visitor's browser. */
(function(){
 const btn=document.getElementById('connectionCheck'),output=document.getElementById('connectionResult');
 if(!btn||!output)return;
 let inflight=false;
 const paint=(msg)=>{output.textContent=msg;};
 async function run(){
  if(inflight)return;
  inflight=true;btn.disabled=true;
  paint('Checking CASH, the current Kalshi market, and the BTC reference…');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
   const response=await fetch('/api/live-check',{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error('Live test endpoint unavailable');
   const data=await response.json();
   if(data?.version!=='CASH_LIVE_OPERATION_CHECK_V1'||
    data.site?.online!==true||data.model?.canExecuteRealTrade!==false||
    data.model?.independentValidatedForecasts!==0||
    data.paperPractice?.realOrdersEnabled!==false)
    throw Error('Unexpected readiness data');
   const mark=x=>x?'CONNECTED':'NOT READY';
   const a=data.site||{},m=data.market||{},p=data.paperPractice||{};
   paint('Website: '+mark(a.homepageReady&&a.simpleModeAssetsReady&&a.advancedModeAssetsReady)+
    ' · Kalshi live quotes: '+mark(m.kalshiQuotesFresh)+
    ' · BTC spot: '+mark(m.spotReferenceFresh)+
    ' · Paper practice: '+mark(p.clientAvailable)+
    '. '+(data.state==='LIVE_PAPER_MONITOR'?
      'Full paper market data checks passed.':'Some current market checks are incomplete.')+
    ' Trading predictions: NOT VERIFIED (0/100). Checked '+
    new Date(data.checkedAt).toLocaleTimeString()+'.');
  }catch{
   paint('Live connection could not be verified. The last displayed prices may be outdated. No verified trade recommendation is available.');
  }finally{inflight=false;btn.disabled=false;clearTimeout(timer)}
 }
 btn.addEventListener('click',run);
 run();
})();
