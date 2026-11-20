'use strict';
(function(){
 const root=document.getElementById('cashManualCalls');if(!root)return;
 const el=id=>document.getElementById(id);
 const status=el('callsAction'),detail=el('callsEntryDetail'),manage=el('callsPositionDetail');
 const side=el('callsHeldSide'),fill=el('callsHeldFill'),qty=el('callsHeldQty');
 let tracked=null,serial=0,lastAt=0,lastMarket=null;
 const cents=n=>Number.isFinite(n)?(n*100).toFixed(1)+'¢':'—';
 const dollars=n=>Number.isFinite(n)?'$'+n.toFixed(2):'—';
 function clearStale(reason){
  status.textContent='WAIT · RECHECK';
  status.style.color='#e3cb9c';
  detail.textContent=reason;
  manage.textContent=tracked?'Cannot verify exit; do not rely on the previous price.':'No position tracked. CASH will not place any orders.';
 }
 async function refresh(){
  const token=++serial;
  try{
   const body=tracked?JSON.stringify({position:tracked}):null;
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),8500);
   let response;
   try{response=await fetch('/api/manual-calls',{
    method:tracked?'POST':'GET',cache:'no-store',
    headers:tracked?{'Content-Type':'application/json'}:{},
    body:body||undefined,signal:controller.signal
   })}finally{clearTimeout(timeout)}
   if(!response.ok)throw Error('Feed unavailable');
   const out=await response.json();
   if(token!==serial)return;
   if(out.version!=='CASH_MANUAL_CALLS_V1'||
      out.mode!=='EXPERIMENTAL_MANUAL_RESEARCH_ONLY'||
      out.automaticTradingEnabled!==false||out.ordersPlaced!==0||
      out.tradingAuthorization!==false||
      out.calibratedWinProbability!==null||out.expectedValue!==null||
      !['WAIT','ENTER_YES','ENTER_NO'].includes(out.call))throw Error('Unsafe call response');
   lastAt=Date.now();lastMarket=out.marketId;
   if(out.call==='WAIT'){
    status.textContent='WAIT · NO ENTRY';
    status.style.color='#d9bf94';
    detail.textContent='No entry: '+(out.blockers||[]).join(' · ')+'. Recheck the current Kalshi contract.';
   }else{
    if(!out.entry||out.entry.maxHypotheticalLossUsd!==10||
       out.entry.maxContractsAt10Usd<1||
       out.entry.estimatedTotalCostAtMax>10.000001||
       out.side!==(out.call==='ENTER_YES'?'YES':'NO'))
      throw Error('Incomplete entry call');
    status.textContent=out.call==='ENTER_YES'?'EXPERIMENTAL CALL · ENTER YES':'EXPERIMENTAL CALL · ENTER NO';
    status.style.color=out.side==='YES'?'#a0e6c8':'#e4b2b2';
    detail.textContent='Observed '+out.side+' ask '+cents(out.entry.maxIndicativeAsk)+
     ' · max indicative entry '+cents(out.entry.maxIndicativeAsk)+
     ' · spread '+cents(out.entry.observedSpread)+
     ' · up to '+out.entry.maxContractsAt10Usd+' contracts under $10 hypothetical cost ('+
     dollars(out.entry.estimatedTotalCostAtMax)+')'+
     ' · source: '+(out.sourceType==='OFFICIAL_BRTI_LIVE'?'BRTI live (not settlement average)':'single-exchange BTC proxy')+
     '. No calibrated probability or verified positive EV.';
   }
   if(!tracked)manage.textContent='No position tracked. If you manually enter on Kalshi, enter the actual fill price below and tap Track.';
   else if(out.position){
    const p=out.position;
    if(!Number.isFinite(p.estimatedNetPnlUsd)){
     manage.textContent='EXIT RECHECK · '+(p.reason||'No verified exit bid')+
      '. Active market may have rolled over; check Kalshi directly.';
    }else{
     manage.textContent=p.call.replaceAll('_',' ')+' · '+p.reason.replaceAll('_',' ')+
      ' · observed '+p.side+' bid '+cents(p.observedExitBid)+
      ' · hypothetical net P&L '+dollars(p.estimatedNetPnlUsd)+
      ' after estimated entry and exit fees · illustrative take-profit bid '+
      cents(p.illustrativeTakeProfitBid)+' / loss-review bid '+
      cents(p.illustrativeStopReviewBid)+
      '. Bid is not a guaranteed sell fill. No order submitted.';
    }
   }
   el('callsTicker').textContent=out.marketId||'Current market unavailable';
   el('callsUpdated').textContent='Updated '+new Date(out.at).toLocaleTimeString()+
    ' · '+Math.max(0,Math.ceil((out.timeRemainingMs||0)/1000))+
    's remaining · research only · orders disabled';
  }catch{if(token===serial){lastAt=0;lastMarket=null;clearStale('Live calls unavailable. Never act on a cached call.');}}
 }
 el('callsTrack').addEventListener('click',()=>{
  const n=Number(qty.value),p=Number(fill.value);
  if(!lastMarket||!Number.isSafeInteger(n)||n<1||n>100||
     !Number.isFinite(p)||p<1||p>99){
   clearStale('Choose an active market, fill price from 1–99 cents and 1–100 contracts.');
   return;
  }
  tracked={marketId:lastMarket,side:side.value,entryPrice:p/100,contracts:n};
  refresh();
 });
 el('callsClear').addEventListener('click',()=>{tracked=null;refresh()});
 refresh();setInterval(refresh,12000);
 setInterval(()=>{if(lastAt&&Date.now()-lastAt>21000){
  ++serial;lastAt=0;clearStale('Quote or signal expired. Await a fresh verified snapshot.');
 }},1000);
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden){++serial;lastAt=0;clearStale('Tab hidden. Refresh before using any call.');}
  else refresh();
 });
})();
