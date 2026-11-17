'use strict';
/*
 * Beginner view. Same read-only, strictly non-validating Kalshi15 endpoint
 * used by Advanced Mode. Never makes model calls, orders or new probabilities.
 */
(function(){
 const root=document.getElementById('cashSimple');
 if(!root)return;
 const el=id=>document.getElementById(id);
 const dollars=n=>Number.isFinite(n)?'$'+n.toLocaleString('en-US',{
  minimumFractionDigits:2,maximumFractionDigits:2}):'—';
 const cents=n=>Number.isFinite(n)?(100*n).toFixed(1)+'¢':'—';
 let last=null,lastReceived=0;
 const mode=()=>document.body.getAttribute('data-cash-mode')==='simple';
 function unavailable(message){
  last=null;lastReceived=0;
  el('simpleMarketStatus').textContent='DATA UNAVAILABLE';
  el('simpleCall').textContent='NO VERIFIED PICK';
  el('simpleWhy').textContent='CASH cannot verify live Kalshi data right now, and it has not passed independent prediction testing.';
  for(const id of ['simpleTimer','simpleTarget','simpleYes','simpleNo'])el(id).textContent='—';
  el('simpleContext').textContent=message||'Live market data could not be confirmed. No price or trade recommendation is available.';
 }
 function countdown(){
  if(!mode()||!last)return;
  const expires=Date.parse(last.clock?.endTime),age=Date.now()-lastReceived;
  const ms=expires-Date.now();
  if(!Number.isFinite(expires)||!Number.isFinite(ms)||ms<=0||age>20000){
   unavailable(ms<=0?'This 15-minute round has ended. Checking the next contract…':
    'The market update is too old. Refreshing prices…');
   return;
  }
  el('simpleTimer').textContent=Math.floor(ms/60000)+':'+String(Math.floor(ms%60000/1000)).padStart(2,'0');
 }
 function render(data){
  if(data?.version!=='CASH_KALSHI15_TERMINAL_V1'||
   data.realTradingAuthorized!==false||data.automaticOrdersEnabled!==false||
   data.liveDecision!=='NO_CALL_MODEL_NOT_VALIDATED'||
   data.independentForecastValidation!==0||
   data.finalization?.realTradingGatePassed!==false||
   data.finalization?.officialBrtiFeedAvailable!==false||
   !['PAPER_MONITOR_READY','NO_CALL'].includes(data.displayState))
   throw Error('Invalid CASH data');
  last=data;lastReceived=Date.now();
  const age=data.clock?.quoteAgeMs,remaining=data.clock?.remainingMs;
  const fresh=data.market?.status==='live'&&Number.isFinite(age)&&age<=12000
   &&Number.isFinite(remaining)&&remaining>0&&!data.market?.refreshFailed;
  const strike=fresh&&data.target?.source==='KALSHI_FLOOR_STRIKE'
   &&Number.isFinite(data.target?.value)?data.target.value:null;
  el('simpleMarketStatus').textContent=fresh?'LIVE PUBLIC PRICES · PAPER ONLY':'MARKET DATA NOT READY';
  el('simpleCall').textContent='NO VERIFIED PICK';
  el('simpleWhy').textContent=fresh?
   'Real Kalshi prices are available, but CASH has not proven that it can predict this round accurately. You can practice, but there is no verified YES or NO recommendation.':
   'CASH is missing current usable market information. There is no verified YES or NO recommendation.';
  el('simpleTarget').textContent=dollars(strike);
  el('simpleYes').textContent=fresh?cents(data.market.yesAsk):'—';
  el('simpleNo').textContent=fresh?cents(data.market.noAsk):'—';
  const reason=!fresh?'Live YES/NO quotes are unavailable or too old.':
   !strike?'Kalshi has not supplied a verified starting price for this contract.':
   data.displayState!=='PAPER_MONITOR_READY'?
    'Some official rule or data checks are incomplete. This does not affect the no-pick decision.':
    'Quotes available for paper practice. Prices do not include fees or guarantee an order fill.';
  el('simpleContext').textContent=reason+' Official BRTI settlement data is not connected.';
  countdown();
 }
 async function refresh(){
  if(!mode())return;
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),8500);
  try{
   const response=await fetch('/api/kalshi15',{cache:'no-store',signal:ctrl.signal});
   if(!response.ok)throw Error('No current Kalshi report');
   render(await response.json());
  }catch{unavailable('CASH could not verify the current Kalshi market. No prediction or price can be shown.')}
  finally{clearTimeout(timer)}
 }
 const toggle=el('simpleExplainToggle'),panel=el('simpleExplainer');
 toggle.addEventListener('click',()=>{
  const opening=panel.hidden;
  panel.hidden=!opening;
  toggle.setAttribute('aria-expanded',String(opening));
  toggle.textContent=opening?'Hide explanation':'Explain the prices';
 });
 if(typeof document.addEventListener==='function')
  document.addEventListener('cash-mode-change',()=>{if(mode())refresh()});
 refresh();
 if(typeof setInterval==='function'){
  setInterval(refresh,12000);
  setInterval(countdown,1000);
 }
 if(typeof document.addEventListener==='function')
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&mode())refresh()});
})();
