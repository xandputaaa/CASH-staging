'use strict';
// Live source-backed CASH dashboard: no synthetic prices, no orders.
(function(){
 'use strict';
 const shell=document.getElementById('cashV3');
 if(!shell||!document.body)return;
 const el=id=>document.getElementById(id);
 const price=n=>Number.isFinite(n)?'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
 const cents=n=>Number.isFinite(n)?(n*100).toFixed(1)+'¢':'—';
 const set=(id,value)=>{const node=el(id);if(node)node.textContent=value};
 let page='market',chartType='btc',range='15m',data=null,lastSuccess=0,latestMarketEnd=0,
  receivedAt=0,seriesShown=[],geometry=null,requestId=0;
 // Retain existing tools and event handlers, but move them into collapsible
 // secondary screens so the initial viewport never becomes a 20-panel wall.
 const primary=el('cashManualCalls'),target=el('v3AssistMain');
 if(primary&&target)target.appendChild(primary);
 function movePanel(id,destination,title){
  const node=el(id),container=el(destination);
  if(!node||!container)return;
  const wrapper=document.createElement('details');
  wrapper.className='v3-accordion';
  const heading=document.createElement('summary');
  heading.textContent=title;
  const slot=document.createElement('div');
  slot.className='v3-legacy-slot';slot.appendChild(node);
  wrapper.append(heading,slot);container.appendChild(wrapper);
 }
 [['cashManualAssist','Manual risk calculator'],['cashOrderVerify','Verified order lookup']]
  .forEach(row=>movePanel(row[0],'v3AssistExtra',row[1]));
 [['cashProspective','Forward forecast journal'],['cashLateCheckpoint','Late checkpoint'],
  ['cashEvaluation','Evidence evaluation'],['cashSettlementCall','Settlement research'],
  ['shadowMonitor','Shadow baseline'],['kalshi15Terminal','Technical terminal'],
  ['livePaperLab','Practice simulation']]
  .forEach(row=>movePanel(row[0],'v3LabModules',row[1]));
 [['cashDiagnostics','Connectivity diagnostics'],['cashCognition','Model self-check']]
  .forEach(row=>movePanel(row[0],'v3SystemModules',row[1]));
 document.body.classList.add('cash-v3');
 // Preserve all legacy modules but never leave the obsolete full dashboard
 // visible underneath the OS shell, even if an external stylesheet fails.
 const legacyMain=document.querySelector('body > main');
 if(legacyMain)legacyMain.hidden=true;
 function navigate(next){
  if(!['market','assist','lab','system'].includes(next))return;
  page=next;
  for(const name of ['market','assist','lab','system']){
   el('v3'+name[0].toUpperCase()+name.slice(1)).dataset.visible=String(name===page);
  }
  shell.querySelectorAll('[data-v3-nav]').forEach(btn=>
   btn.setAttribute('aria-selected',String(btn.dataset.v3Nav===page)));
  window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  if(page==='market')renderChart();
 }
 shell.querySelectorAll('[data-v3-nav]').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.v3Nav)));
 el('v3AssistJump').addEventListener('click',()=>navigate('assist'));
 shell.querySelectorAll('[data-v3-series]').forEach(btn=>btn.addEventListener('click',()=>{
  chartType=btn.dataset.v3Series;
  shell.querySelectorAll('[data-v3-series]').forEach(x=>x.setAttribute('aria-pressed',String(x===btn)));
  renderChart();
 }));
 shell.querySelectorAll('[data-v3-range]').forEach(btn=>btn.addEventListener('click',()=>{
  range=btn.dataset.v3Range;
  shell.querySelectorAll('[data-v3-range]').forEach(x=>x.setAttribute('aria-pressed',String(x===btn)));
  renderChart();
 }));
 const reason=x=>String(x||'').replaceAll('_',' ').toLowerCase();
 function unavailable(message){
  el('v3Connection').classList.remove('live');
  set('v3Connection','● STALE / OFFLINE');
  set('v3Call','WAIT');el('v3Call').dataset.kind='wait';
  set('v3CallWhy',message||'Unable to verify current market.');
  set('v3Entry','Outdated quotes and signals are never reused.');
  set('v3Integrity','Live research feeds unavailable; no simulated or substituted prices.');
  set('v3Price','—');set('v3Ticker','No confirmed market');
  set('v3Yes','—');set('v3No','—');set('v3Strike','—');set('v3Countdown','—');
  latestMarketEnd=0;
 }
 function renderCall(){
  const manual=data?.manual,q=data?.quote;
  if(!manual||data?.ordersEnabled!==false||data?.executionAuthorized!==false||
   manual.automaticTradingEnabled!==false||manual.ordersPlaced!==0||
   manual.tradingAuthorization!==false||manual.calibratedWinProbability!==null||
   manual.expectedValue!==null||q?.status!=='LIVE'){
   set('v3Call','WAIT');el('v3Call').dataset.kind='wait';
   set('v3CallWhy','Fresh contract and model safety fields could not be verified.');
   set('v3Entry','No entry guidance until new source observations arrive.');
   return;
  }
  const decision=manual.call;
  if(!['WAIT','ENTER_YES','ENTER_NO'].includes(decision)){
   unavailable('Unexpected call response; no entry.');return;
  }
  const side=decision==='ENTER_YES'?'YES':decision==='ENTER_NO'?'NO':null;
  el('v3Call').dataset.kind=side?side.toLowerCase():'wait';
  set('v3Call',side?'ENTER '+side:'WAIT');
  set('v3CallWhy',side?
   'Experimental '+side+' direction. Market terms, current quotes and model filters passed; profitability is unproven.':
   (Array.isArray(manual.blockers)&&manual.blockers.length?
    manual.blockers.slice(0,2).map(reason).join(' · '):
    'No qualifying model signal at this moment.'));
  const e=manual.entry;
  set('v3Entry',side&&e&&e.maxHypotheticalLossUsd===10&&Number.isFinite(e.maxIndicativeAsk)?
   side+' ask '+cents(e.maxIndicativeAsk)+' · up to '+e.maxContractsAt10Usd+
    ' hypothetical contracts for '+price(e.estimatedTotalCostAtMax)+
    ' estimated all-in cost. Open Kalshi separately to act manually.':
   'No entry band while CASH says WAIT.');
 }
 function renderTimer(){
  if(!Number.isFinite(latestMarketEnd)||!latestMarketEnd||!receivedAt)return;
  const stale=Date.now()-receivedAt>22000,ms=latestMarketEnd-Date.now();
  if(stale||ms<=0){
   set('v3Countdown','—');set('v3Yes','—');set('v3No','—');
   set('v3Call','WAIT');el('v3Call').dataset.kind='wait';
   set('v3CallWhy','Market has expired or quotes are stale. Await current contract.');
   return;
  }
  set('v3Countdown',Math.floor(ms/60000)+':'+String(Math.floor(ms%60000/1000)).padStart(2,'0'));
 }
 function market(){
  if(data?.version!=='CASH_MOBILE_V3_MARKET_V1'||
    data.ordersEnabled!==false||data.executionAuthorized!==false){
   unavailable('Market response failed checks.');return;
  }
  const q=data.quote||{},spot=data.spot||{};
  const age=Date.now()-Date.parse(q.fetchedAt);
  const live=q.status==='LIVE'&&spot.status==='live'&&Number.isFinite(age)&&age<=15000;
  el('v3Connection').classList.toggle('live',live);
  set('v3Connection',live?'● LIVE / READ ONLY':'● PARTIAL / RECHECK');
  set('v3Ticker',q.marketId||'No active Kalshi market');
  latestMarketEnd=Date.parse(q.endTime);receivedAt=Date.now();
  set('v3Strike',q.targetVerified?price(q.targetPrice):'—');
  set('v3Yes',q.status==='LIVE'?cents(q.yesAsk):'—');
  set('v3No',q.status==='LIVE'?cents(q.noAsk):'—');
  set('v3Integrity','Price chart uses only recorded source samples. Quote status: '+
   (q.status||'UNKNOWN')+'. Spot: '+(spot.source||'unavailable')+
   '. Independently qualified: 0 / 100. Orders disabled.');
  renderCall();renderTimer();renderChart();
 }
 function renderChart(){
  const graph=data?.chart,entry=graph?.[chartType];
  const span={'5m':300000,'15m':900000,'1h':3600000}[range];
  const end=Date.now(),start=end-span,isBTC=chartType==='btc';
  const clock=t=>new Date(t).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
  set('v3TimeStart',clock(start));set('v3TimeEnd',clock(end));
  set('v3ChartHeading',isBTC?'BTC / USD · KRAKEN':chartType.toUpperCase()+' / KALSHI CONTRACT');
  const raw=Array.isArray(entry?.points)?entry.points:[];
  const points=raw.filter(p=>Number.isFinite(p?.t)&&Number.isFinite(p?.v)&&
    p.t>=start&&p.t<=end&&p.v>0).sort((a,b)=>a.t-b.t);
  seriesShown=points;geometry=null;
  const line=el('v3Line'),area=el('v3Area'),dot=el('v3Dot'),state=el('v3GraphState');
  line.setAttribute('d','');area.setAttribute('d','');
  dot.setAttribute('r','0');el('v3Cross').setAttribute('d','');
  const livePrice=isBTC?data?.spot?.price:
    chartType==='yes'?data?.quote?.yesAsk:data?.quote?.noAsk;
  const sourceFresh=isBTC?data?.spot?.status==='live':data?.quote?.status==='LIVE';
  set('v3Price',sourceFresh?(isBTC?price(livePrice):cents(livePrice)):'—');
  if(points.length<2){
   state.hidden=false;
   state.textContent=entry?.status==='OHLC_UNAVAILABLE'||entry?.status==='CANDLES_UNAVAILABLE'?
    'Price history source unavailable. No fake candles.':
    'Awaiting at least two time-stamped market observations.';
   set('v3ChartBadge','AWAITING DATA');
   set('v3Delta','Not enough verified chart points');
   set('v3Source',entry?.note||'No price series available.');
   return;
  }
  state.hidden=true;
  const vals=points.map(p=>p.v);
  let low=Math.min(...vals),high=Math.max(...vals);
  const pad=Math.max(isBTC?3:.005,(high-low)*.16);
  low-=pad;high+=pad;
  const x=p=>40+(p.t-start)/span*820;
  const y=p=>269-(p.v-low)/(high-low)*236;
  const xy=p=>x(p).toFixed(2)+' '+y(p).toFixed(2);
  const segments=[],threshold=isBTC?115000:150000;
  let part=[];
  for(let i=0;i<points.length;i++){
   if(i&&points[i].t-points[i-1].t>threshold){
    if(part.length)segments.push(part);
    part=[];
   }
   part.push(points[i]);
  }
  if(part.length)segments.push(part);
  line.setAttribute('d',segments.map(seg=>seg.map((p,i)=>(i?'L':'M')+xy(p)).join('')).join(' '));
  area.setAttribute('d',segments.map(seg=>seg.length<2?'':'M'+x(seg[0]).toFixed(2)+
   ' 272 L'+seg.map(xy).join(' L')+' L'+x(seg.at(-1)).toFixed(2)+' 272 Z').join(' '));
  const latest=points.at(-1);
  dot.setAttribute('cx',x(latest));dot.setAttribute('cy',y(latest));dot.setAttribute('r','6');
  geometry={x,y};const delta=latest.v-points[0].v;
  const tone=Math.abs(delta)<(isBTC?.1:.002)?'neutral':delta>0?'up':'down';
  shell.dataset.tone=tone;
  set('v3Delta',(delta>0?'+':'')+(isBTC?delta.toFixed(2):(delta*100).toFixed(2))+
   (isBTC?' USD':'¢')+' · '+range.toUpperCase()+' recorded change');
  set('v3YTop',isBTC?price(high):cents(high));
  set('v3YBottom',isBTC?price(low):cents(low));
  const live=entry?.status==='LIVE'||entry?.status==='OBSERVED';
  set('v3ChartBadge',live?'● OBSERVED / LIVE':'● HISTORICAL / CHECK');
  set('v3Source',(entry?.source||'Source unavailable')+' · '+(entry?.note||'')+
   ' · Latest '+clock(latest.t)+'. No synthetic ticks or forecast path.');
  set('v3Hover',points.length+' recorded points');
 }
 const chartElement=el('v3Chart');
 chartElement.addEventListener('pointermove',event=>{
  if(!geometry||!seriesShown.length)return;
  const rect=chartElement.getBoundingClientRect();
  if(!rect.width)return;
  const mx=(event.clientX-rect.left)/rect.width*900;
  const near=seriesShown.reduce((best,p)=>Math.abs(geometry.x(p)-mx)<
   Math.abs(geometry.x(best)-mx)?p:best,seriesShown[0]);
  set('v3Hover',(chartType==='btc'?price(near.v):cents(near.v))+' · '+
   new Date(near.t).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',second:'2-digit'}));
  el('v3Cross').setAttribute('d','M'+geometry.x(near)+' 21V271');
 });
 chartElement.addEventListener('pointerleave',()=>{
  el('v3Cross').setAttribute('d','');
  set('v3Hover',seriesShown.length+' recorded points');
 });
 async function refresh(){
  const id=++requestId,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),11000);
  try{
   const response=await fetch('/api/cash-v3/market',{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error('Market response unavailable');
   const payload=await response.json();
   if(id!==requestId)return;
   data=payload;lastSuccess=Date.now();market();
  }catch{
   if(id===requestId){
    data=null;lastSuccess=0;
    unavailable('Could not verify current quote and call sources.');
    renderChart();
   }
  }finally{clearTimeout(timer)}
 }
 refresh();
 setInterval(()=>{if(!document.hidden)refresh()},6000);
 setInterval(()=>{
  renderTimer();
  if(lastSuccess&&Date.now()-lastSuccess>22000){
   data=null;lastSuccess=0;
   unavailable('Previously observed data expired. Awaiting refresh.');
   renderChart();
  }
 },1000);
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden){requestId++;set('v3Connection','● PAUSED / HIDDEN');}
  else refresh();
 });
})();
