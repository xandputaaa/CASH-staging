'use strict';
/*
 * Kalshi 15-minute settlement YES/NO early research presentation.
 * Current live leaning can change; only the one frozen per-contract call
 * is eligible for post-settlement exploratory scoring. No trading.
 */
(function(){
 const root=document.getElementById('cashSettlementCall');if(!root)return;
 const el=id=>document.getElementById(id);
 const set=(id,value)=>{const target=el(id);if(target)target.textContent=value};
 const pct=n=>Number.isFinite(n)?(n*100).toFixed(1)+'%':'—';
 const nice=t=>Number.isFinite(Date.parse(t))?new Date(t).toLocaleTimeString():'unknown time';
 function chart(data,frozen){
  const poly=el('settlementYesAskLine'),mark=el('settlementCallMark');
  if(!poly||!mark)return;
  const list=data?.publicQuoteChart?.kind==='KALSHI_PUBLIC_YES_ASK_SNAPSHOTS'&&
   data?.publicQuoteChart?.marketId===data?.liveAssessment?.marketId?
   data.publicQuoteChart.points:[];
  const clean=(Array.isArray(list)?list:[]).filter(v=>
   Number.isFinite(Date.parse(v?.at))&&Number.isFinite(v?.yesAsk)&&
   v.yesAsk>0&&v.yesAsk<1);
  if(clean.length<2){
   poly.setAttribute('points','');mark.setAttribute('visibility','hidden');
   set('settlementChartCaption','Collecting real Kalshi YES ask snapshots. No forecasted contract-price points are invented.');
   return;
  }
  const oldest=Date.parse(clean[0].at),newest=Date.parse(clean.at(-1).at);
  const span=Math.max(1000,newest-oldest);
  const x=t=>20+580*(t-oldest)/span;
  const y=v=>200-180*v;
  poly.setAttribute('points',clean.map(p=>
   x(Date.parse(p.at)).toFixed(1)+','+y(p.yesAsk).toFixed(1)).join(' '));
  const freezeTime=Date.parse(frozen?.at);
  if(Number.isFinite(freezeTime)&&freezeTime>=oldest&&freezeTime<=newest){
   mark.setAttribute('x1',x(freezeTime).toFixed(1));
   mark.setAttribute('x2',x(freezeTime).toFixed(1));
   mark.setAttribute('visibility','visible');
  }else mark.setAttribute('visibility','hidden');
  set('settlementChartCaption','Observed Kalshi YES ask: '+
   (clean.at(-1).yesAsk*100).toFixed(1)+'¢. Cyan = observed quotes; gold = frozen decision time, if visible. This is not an official Kalshi trade-candle chart or a projected YES price.');
 }
 function render(r){
  if(r?.version!=='CASH_PROSPECTIVE_KALSHI_V1'||
   r.model!=='KXBTC15M_SETTLEMENT_EARLY_V3'||
   r.tradingAuthorized!==false||r.automatedOrdersEnabled!==false||
   r.qualifiedCount!==0||r.independentlyTimeAttested!==false||
   r.modelCalibrated!==false)
   throw Error('Settlement model state is not safe for display');
  const live=r.liveAssessment?.marketId===r.publicQuoteChart?.marketId?
   r.liveAssessment:null;
  const frozen=r.active?.marketId===live?.marketId?r.active:null;
  const side=live?.side;
  const label=side==='YES'?'YES · UP AT SETTLEMENT':
   side==='NO'?'NO · DOWN AT SETTLEMENT':'WAIT · NO CLEAR SETTLEMENT EDGE';
  const sideEl=el('settlementLiveSide');
  if(sideEl)sideEl.style.color=side==='YES'?'#72dcac':side==='NO'?'#ff8793':'#ebc48a';
  set('settlementLiveSide',label);
  set('settlementCallStatus',side?'LIVE PROVISIONAL · UNVALIDATED':'WAIT · RESEARCH ONLY');
  // The primary Simple Mode call is the same *unvalidated* settlement
  // hypothesis as this panel, not the deprecated 45-second spot direction.
  set('simpleCall',side==='YES'?'EXPERIMENTAL YES · NOT VALIDATED':
    side==='NO'?'EXPERIMENTAL NO · NOT VALIDATED':'WAIT · NO CLEAR YES/NO CALL');
  set('simpleWhy',side?
    'Kalshi 15m settlement hypothesis, not a verified profitable signal. This live lean may change. Only the separate frozen research call is scored later against official settlement. No automated orders.':
    'No reliable YES/NO settlement direction from the available historical inputs. CASH is not validated for real-money predictions.');
  const reason=String(live?.reason||r.captureReadiness?.lastReason||'NOT_READY')
   .replaceAll('_',' ').toLowerCase();
  const lead=Number.isFinite(live?.leadMs)?(live.leadMs/60000).toFixed(1):'—';
  const gap=Number.isFinite(live?.gapBps)?live.gapBps.toFixed(1)+' basis points':'unavailable';
  set('settlementLiveReason',
   'Live settlement assessment from the official Kalshi target and recent public BTC proxy; '+
   lead+' minutes until contract expiry. Gap to strike: '+gap+
   '. Reason: '+reason+'. It can change before the market closes. No verified prediction edge.');
  set('settlementFrozenSide',frozen?.side==='YES'?'FROZEN YES':
   frozen?.side==='NO'?'FROZEN NO':frozen?'FROZEN WAIT':'NOT YET CAPTURED');
  set('settlementFrozenTime',frozen?
   'Captured '+nice(frozen.at)+' with '+Math.round(frozen.leadMs/60000)+
    ' min remaining · immutable':'One initial qualified observation per 15-minute market');
  set('settlementAccuracy',pct(r.hitRate)+(r.officiallyScored?' exploratory':' · no scored calls'));
  set('settlementScored',r.hits+' hits / '+r.misses+
   ' misses · '+r.officiallyScored+' frozen directional settlements scored'+
   ' · 0/100 independently validated');
  const evaluation=r.evaluation;
  const ci=evaluation?.wilson95;
  const p=x=>Number.isFinite(x)?(x*100).toFixed(1)+'%':'—';
  set('settlementEvidenceRange',evaluation?.officiallyScored>0&&
   Number.isFinite(ci?.lower)&&Number.isFinite(ci?.upper)?
    'Exploratory 95% Wilson interval '+p(ci.lower)+'–'+p(ci.upper)+
    ' · '+evaluation.officiallyScored+' official outcomes scored. Not calibrated.':
    'Not enough scored official results to estimate accuracy.');
  const base=evaluation?.comparison;
  set('settlementMarketBaseline',base?.comparableScored>0?
   'On '+base.comparableScored+' comparable settled rounds: CASH '+p(base.cashHitRateOnComparable)+
    ' vs naive market-favored public ASK '+p(base.marketFavoredHitRate)+
    '. This is not evidence of trade profitability or true forecast skill.':
   'No verified comparable settled rounds yet to compare against the market-favored quote baseline.');
  chart(r,frozen);
 }
 function unavailable(){
  set('settlementCallStatus','SETTLEMENT MODEL DATA UNAVAILABLE');
  set('settlementLiveSide','WAIT · NOT VERIFIED');
  set('simpleCall','NO VERIFIED SETTLEMENT CALL');
  set('simpleWhy','Early settlement data is missing or invalid. No real-money prediction is verified.');
  set('settlementLiveReason','Live Kalshi strike, rule or public BTC proxy data not verifiable. CASH cannot issue a settlement prediction.');
  set('settlementFrozenSide','—');
  set('settlementAccuracy','—');
  set('settlementEvidenceRange','Accuracy interval unavailable.');
  set('settlementMarketBaseline','Market baseline unavailable.');
  el('settlementYesAskLine')?.setAttribute('points','');
  el('settlementCallMark')?.setAttribute('visibility','hidden');
 }
 async function refresh(){
  const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),8500);
  try{
   const res=await fetch('/api/prospective',{cache:'no-store',signal:ctrl.signal});
   if(!res.ok)throw Error('No current settlement snapshot');
   render(await res.json());
  }catch{unavailable()}finally{clearTimeout(timeout)}
 }
 refresh();
 if(typeof setInterval==='function')setInterval(refresh,10000);
 if(typeof document.addEventListener==='function')
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
})();