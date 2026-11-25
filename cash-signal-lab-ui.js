(function(){
 'use strict';
 const host=document.getElementById('v3MarketChart');
 if(!host)return;
 const card=document.createElement('article');
 card.id='v3SignalLab';
 card.className='v3-card v3-signal-lab';
 card.setAttribute('aria-label','CASH Signal Lab research-only indicator');
 card.innerHTML=`<div class="v3-row"><span class="v3-micro">CASH / SIGNAL LAB</span><span class="v3-badge" id="slState">AWAITING VERIFIED CANDLES</span></div>
 <div class="sl-header"><div><h2>Market structure.</h2><p>Historical BUY / SELL crossover markers from recorded Kraken BTC candles.</p></div>
 <button type="button" class="sl-toggle" id="slToggle" aria-pressed="true">MARKERS ON</button></div>
 <div class="sl-bias" id="slBias" data-bias="none">NO CONFIRMATION</div>
 <div class="sl-meta" id="slMeta">Awaiting 30 consecutive closed 1-minute candles.</div>
 <div class="sl-graph"><svg id="slCandles" viewBox="0 0 720 260" role="img" aria-label="Observed Kraken BTC one minute candlesticks with historical EMA/RSI crossover markers"></svg></div>
 <div class="sl-legend"><span><i class="sl-up"></i> Historical BUY marker</span><span><i class="sl-down"></i> Historical SELL marker</span><span>Not an order instruction</span></div>
 <div class="sl-metrics"><div><small>EMA 9</small><strong id="slFast">—</strong></div><div><small>EMA 21</small><strong id="slSlow">—</strong></div><div><small>RSI 14</small><strong id="slRsi">—</strong></div><div><small>Source candles</small><strong id="slCount">—</strong></div></div>
 <p id="slNote" class="sl-notice">Kraken spot technical analysis is separate from Kalshi's BRTI settlement. No verified predictive edge, no private order flow, and no execution.</p>`;
 host.after(card);
 const id=x=>document.getElementById(x);
 const SVG='http://www.w3.org/2000/svg';
 const money=n=>Number.isFinite(n)?'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
 const attr=(node,values)=>{Object.entries(values).forEach(([k,v])=>node.setAttribute(k,String(v)));return node};
 function node(name,attrs,text){
  const n=attr(document.createElementNS(SVG,name),attrs);
  if(text!=null)n.textContent=String(text);
  return n;
 }
 let last=null,markersEnabled=true;
 function clear(message,status='UNAVAILABLE'){
  const badges={
   INSUFFICIENT_DATA:'AWAITING 30 CANDLES',
   STALE:'STALE / NO SIGNAL',
   PAUSED:'PAUSED / HIDDEN',
   UNAVAILABLE:'SOURCE UNAVAILABLE'
  };
  id('slState').textContent=badges[status]||badges.UNAVAILABLE;
  id('slBias').textContent='NO CONFIRMATION';id('slBias').dataset.bias='none';
  id('slMeta').textContent=message||'CASH refuses to reuse stale study readings.';
  id('slCandles').replaceChildren();
  ['slFast','slSlow','slRsi','slCount'].forEach(k=>id(k).textContent='—');
  id('slNote').textContent='Closed Kraken source candles required. Kalshi signals and execution remain separate and unchanged.';
 }
 function draw(candles,markers){
  const svg=id('slCandles');
  svg.replaceChildren();
  const bars=candles.slice(-42);
  if(!bars.length)return;
  const min=Math.min(...bars.map(b=>b.low)),max=Math.max(...bars.map(b=>b.high));
  const span=Math.max(max-min,1),y=v=>224-((v-min)/span)*184;
  const left=31,right=702,spacing=(right-left)/bars.length;
  for(let g=0;g<=4;g++){
   const yy=28+g*49;
   svg.appendChild(node('line',{x1:24,y1:yy,x2:707,y2:yy,class:'sl-gridline'}));
  }
  const lastMarkers=new Map(markers.filter(m=>m?.kind==='HISTORICAL_CLOSED_CANDLE_CROSSOVER'&&
   ['BUY','SELL'].includes(m.side)).slice(-6).map(m=>[m.t,m]));
  bars.forEach((bar,i)=>{
   const cx=left+(i+.5)*spacing,up=bar.close>=bar.open;
   const color=up?'sl-candle-up':'sl-candle-down';
   svg.appendChild(node('line',{x1:cx,y1:y(bar.high),x2:cx,y2:y(bar.low),class:color+' sl-wick'}));
   const top=y(Math.max(bar.open,bar.close)),bottom=y(Math.min(bar.open,bar.close));
   svg.appendChild(node('rect',{x:cx-Math.min(5,spacing*.32),y:top,width:Math.min(10,spacing*.64),
    height:Math.max(1.8,bottom-top),rx:1.4,class:color}));
   const marker=markersEnabled?lastMarkers.get(bar.t):null;
   if(marker){
    const buy=marker.side==='BUY';
    const at=Math.max(15,Math.min(245,buy?y(bar.low)+20:y(bar.high)-14));
    const tag=node('text',{x:cx,y:at,'text-anchor':'middle',class:'sl-marker '+(buy?'sl-marker-up':'sl-marker-down')},marker.side);
    svg.appendChild(tag);
   }
  });
  const first=bars[0],lastBar=bars.at(-1);
  svg.appendChild(node('text',{x:34,y:251,class:'sl-time'},new Date(first.t).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})));
  svg.appendChild(node('text',{x:700,y:251,'text-anchor':'end',class:'sl-time'},new Date(lastBar.t).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})));
 }
 function update(payload){
  const btc=payload?.chart?.btc,lab=btc?.signalLab;
  const valid=payload?.version==='CASH_MOBILE_V3_MARKET_V1'&&
   payload.ordersEnabled===false&&payload.executionAuthorized===false&&
   payload.chart?.version==='CASH_V3_CHART_V1'&&btc?.source==='Kraken BTC/USD'&&
   lab?.version==='CASH_SIGNAL_LAB_V1'&&lab.executionAuthorized===false&&
   lab.independentlyValidated===false&&Array.isArray(btc.candles)&&Array.isArray(lab.markers)&&
   lab.status==='HISTORICAL_STUDY'&&btc.status!=='OHLC_UNAVAILABLE';
  if(!valid){
   last=null;
   clear(lab?.reason||'Source history unavailable or insufficient.',
    lab?.status==='INSUFFICIENT_DATA'?'INSUFFICIENT_DATA':
    lab?.status==='STALE'?'STALE':'UNAVAILABLE');
   return;
  }
  const now=Date.now(),lastTime=Date.parse(lab.lastClosedAt);
  if(!Number.isFinite(lastTime)||lastTime>now+2000||now-lastTime>120000){
   last=null;clear('Latest verified closed candle expired.','STALE');return;
  }
  const candles=btc.candles.filter(b=>b?.kind==='CLOSED_1M'&&
   Number.isFinite(b.t)&&[b.open,b.high,b.low,b.close].every(Number.isFinite));
  if(candles.length<30){last=null;clear('Insufficient closed source candles.','INSUFFICIENT_DATA');return}
  last={candles,markers:lab.markers};
  id('slState').textContent='● CLOSED CANDLES / RESEARCH';
  const bias=lab.bias==='BULLISH BIAS'?'BULLISH BIAS':lab.bias==='BEARISH BIAS'?'BEARISH BIAS':'NO CONFIRMATION';
  id('slBias').textContent=bias;
  id('slBias').dataset.bias=bias==='BULLISH BIAS'?'up':bias==='BEARISH BIAS'?'down':'none';
  id('slMeta').textContent='EMA 9/21 crossover + RSI 14 · last closed '+new Date(lastTime).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
  id('slFast').textContent=money(lab.latest?.emaFast);
  id('slSlow').textContent=money(lab.latest?.emaSlow);
  id('slRsi').textContent=Number.isFinite(lab.latest?.rsi14)?lab.latest.rsi14.toFixed(1):'—';
  id('slCount').textContent=String(lab.sampleCount);
  id('slNote').textContent='Historic chart annotations only. '+lab.reason+
   ' Source: Kraken BTC/USD closed 1-minute OHLC. No insider data, calibrated accuracy, or automatic orders.';
  draw(candles,lab.markers);
 }
 id('slToggle').addEventListener('click',()=>{
  markersEnabled=!markersEnabled;
  id('slToggle').textContent=markersEnabled?'MARKERS ON':'MARKERS OFF';
  id('slToggle').setAttribute('aria-pressed',String(markersEnabled));
  if(last)draw(last.candles,last.markers);
 });
 window.addEventListener('cash:v3:market',event=>update(event.detail));
 clear('Awaiting verified closed Kraken source candles.');
})();