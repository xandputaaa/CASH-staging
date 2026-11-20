'use strict';
/**
 * CASH v3 market graph: observed data ONLY.
 * Kraken: 1-minute BTC/USD OHLC (last partial minute excluded), plus
 * timestamped same-source live spot observations from the existing feed.
 * Kalshi: observed 1-minute YES ask / YES bid candles; NO historical line
 * is the displayed mathematical complement of YES bid, not an executable ask.
 * Newest NO/YES points are actual quotes recorded by CASH.
 * No price interpolation, fake ticks, or calibrated trading claims.
 */
const KRAKEN='https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1';
const KALSHI='https://external-api.kalshi.com/trade-api/v2/series/KXBTC15M/markets/';
const ID=/^KXBTC15M-[A-Za-z0-9-]{6,70}$/;
const CACHE_MS=45000,MAX_POINTS=250;
const good=(x,low=0,high=1e7)=>Number.isFinite(x)&&x>low&&x<high;
async function getJSON(url,fetchImpl){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4500);
 try{
  const response=await fetchImpl(url,{signal:controller.signal,headers:{
   Accept:'application/json','User-Agent':'CASH-private-read-only-market-chart/1.0'}});
  if(!response.ok)throw Error('Upstream price history unavailable');
  return await response.json();
 }finally{clearTimeout(timer)}
}
function parseKrakenOHLC(body,now=Date.now()){
 if(!body||!Array.isArray(body.error)||body.error.length||
  !body.result||typeof body.result!=='object')throw Error('Kraken OHLC response invalid');
 const keys=Object.keys(body.result).filter(x=>x!=='last');
 if(keys.length!==1||!Array.isArray(body.result[keys[0]]))throw Error('Kraken OHLC pair ambiguous');
 const raw=body.result[keys[0]];
 const entries=[];let prev=0;
 for(const row of raw.slice(-90)){
  if(!Array.isArray(row)||row.length<5)continue;
  const start=Number(row[0])*1000,open=Number(row[1]),
   high=Number(row[2]),low=Number(row[3]),close=Number(row[4]);
  if(!Number.isSafeInteger(start)||start<=prev||
     !good(open,1000)||!good(close,1000)||!good(low,1000)||!good(high,1000)||
     high<Math.max(open,close,low)||low>Math.min(open,close,high))continue;
  prev=start;
  // Ignore Kraken's final uncommitted minute: raw tick observations,
  // never fabricated candle closes, move the chart in real time instead.
  if(start+60000>now||start<now-75*60000)continue;
  entries.push(Object.freeze({t:start+60000,open,high,low,close,kind:'CLOSED_1M'}));
 }
 if(!entries.length)throw Error('No Kraken closed minute candles available');
 return entries.slice(-70);
}
function parseKalshiCandles(body,marketId,now=Date.now()){
 if(body?.ticker!==marketId||!Array.isArray(body?.candlesticks))
  throw Error('Kalshi candle ticker mismatch');
 const yes=[],no=[];let previous=0;
 for(const row of body.candlesticks.slice(-30)){
  const t=Number(row?.end_period_ts)*1000;
  if(!Number.isSafeInteger(t)||t<=previous||t>now+60000||t<now-25*60000)continue;
  previous=t;
  const ask=Number(row?.yes_ask?.close_dollars);
  const bid=Number(row?.yes_bid?.close_dollars);
  if(good(ask,0,1))yes.push(Object.freeze({t,v:ask,kind:'KALSHI_YES_ASK_CANDLE'}));
  if(good(bid,0,1))no.push(Object.freeze({t,v:Math.round((1-bid)*10000)/10000,
   kind:'DERIVED_FROM_KALSHI_YES_BID'}));
 }
 return {yes,no};
}
function createCashV3ChartFeed({fetchImpl=fetch,clock=()=>Date.now()}={}){
 let kraken={at:0,data:[],error:true,inflight:null};
 let kalshi={ticker:null,at:0,data:{yes:[],no:[]},error:true,inflight:null};
 let observed={ticker:null,yes:[],no:[]},lastSpot=null;
 async function refreshKraken(){
  const now=clock();
  if(kraken.inflight)return kraken.inflight;
  if(kraken.at&&now-kraken.at<CACHE_MS)return;
  kraken.inflight=(async()=>{
   try{kraken.data=parseKrakenOHLC(await getJSON(KRAKEN,fetchImpl),now);kraken.error=false}
   catch{kraken.error=true}
   kraken.at=now;
  })().finally(()=>{kraken.inflight=null});
  return kraken.inflight;
 }
 async function refreshKalshi(marketId,openTime){
  if(!ID.test(marketId||''))return;
  const now=clock();
  if(kalshi.ticker!==marketId)kalshi={ticker:marketId,at:0,
   data:{yes:[],no:[]},error:true,inflight:null};
  if(kalshi.inflight)return kalshi.inflight;
  if(kalshi.at&&now-kalshi.at<CACHE_MS)return;
  kalshi.inflight=(async()=>{
   try{
    const open=Date.parse(openTime);
    const start=Math.floor((Number.isFinite(open)?Math.max(open-60000,now-20*60000):
      now-20*60000)/1000);
    const end=Math.ceil(now/1000);
    const url=KALSHI+encodeURIComponent(marketId)+'/candlesticks?start_ts='+
     start+'&end_ts='+end+'&period_interval=1';
    kalshi.data=parseKalshiCandles(await getJSON(url,fetchImpl),marketId,now);
    kalshi.error=false;
   }catch{kalshi.error=true}
   kalshi.at=clock();
  })().finally(()=>{kalshi.inflight=null});
  return kalshi.inflight;
 }
 function record(quote,spot){
  const now=clock(),marketId=quote?.marketId;
  if(marketId!==observed.ticker){
   observed={ticker:ID.test(marketId||'')?marketId:null,yes:[],no:[]};
  }
  const qTime=Date.parse(quote?.fetchedAt);
  if(quote?.status==='live'&&!quote.refreshFailed&&
    Number.isFinite(qTime)&&qTime<=now+2000&&now-qTime<=12000){
   for(const [side,field] of [['yes','yesAsk'],['no','noAsk']]){
    const price=quote[field],list=observed[side];
    if(good(price,0,1)&&(!list.length||qTime>list.at(-1).t)){
     list.push({t:qTime,v:price,kind:'OBSERVED_KALSHI_QUOTE'});
     if(list.length>MAX_POINTS)list.splice(0,list.length-MAX_POINTS);
    }
   }
  }
  const t=Date.parse(spot?.fetchedAt);
  if(spot?.source==='Kraken BTC/USD'&&spot.status==='live'&&
    Number.isFinite(t)&&t<=now+2000&&now-t<=12000&&good(spot.price,1000))
   lastSpot={t,v:spot.price,source:spot.source};
 }
 function marketPoints(candles,live,cutoff){
  const historic=candles.filter(x=>x.t>=cutoff).map(x=>({t:x.t,v:x.v,kind:x.kind}));
  const after=historic.length?historic.at(-1).t:0;
  const seen=new Set(historic.map(x=>x.t));
  for(const point of live){
   if(point.t>=cutoff&&point.t>=after&&!seen.has(point.t)){
    historic.push({...point});seen.add(point.t);
   }
  }
  return historic.sort((a,b)=>a.t-b.t).slice(-MAX_POINTS);
 }
 async function query({quote={},spot={}}={}){
  const now=clock();
  record(quote,spot);
  await Promise.all([refreshKraken(),refreshKalshi(quote.marketId,quote.openTime)]);
  const lastClosed=kraken.data.length?kraken.data.at(-1).t:0;
  const pricePoints=kraken.data.map(x=>({t:x.t,v:x.close,kind:x.kind}));
  // Append only observed Kraken timestamps AFTER last closed candle.
  if(spot?.source==='Kraken BTC/USD'&&Array.isArray(spot.history)){
   for(const row of spot.history){
    const t=Date.parse(row?.time);
    if(Number.isFinite(t)&&t>lastClosed&&t<=now+2000&&
      row.source==='Kraken BTC/USD'&&good(row.price,1000))
     pricePoints.push({t,v:row.price,kind:'KRAKEN_OBSERVED_TICK'});
   }
  }
  if(lastSpot&&lastSpot.t>lastClosed&&!pricePoints.some(x=>x.t===lastSpot.t))
   pricePoints.push({t:lastSpot.t,v:lastSpot.v,kind:'KRAKEN_OBSERVED_TICK'});
  pricePoints.sort((a,b)=>a.t-b.t);
  const btc=pricePoints.filter((p,i,a)=>i===0||p.t!==a[i-1].t).slice(-MAX_POINTS);
  const validSpot=spot?.source==='Kraken BTC/USD'&&spot.status==='live'&&
   Number.isFinite(Date.parse(spot.fetchedAt))&&now-Date.parse(spot.fetchedAt)<=12000;
  const yes=marketPoints(kalshi.data.yes,observed.yes,now-60*60000);
  const no=marketPoints(kalshi.data.no,observed.no,now-60*60000);
  return Object.freeze({
   version:'CASH_V3_CHART_V1',
   generatedAt:new Date(now).toISOString(),
   marketId:ID.test(quote.marketId||'')?quote.marketId:null,
   btc:{source:'Kraken BTC/USD',status:kraken.error?'OHLC_UNAVAILABLE':
    validSpot?'LIVE':'HISTORY_ONLY',sampleAgeMs:
     validSpot?now-Date.parse(spot.fetchedAt):null,
    points:btc,priceCurrency:'USD',timeBasis:'REAL_OBSERVATION',
    note:'Kraken 1-minute closed candles plus same-source timestamped spot observations; never BRTI.'},
   yes:{source:'Kalshi public YES ask',status:kalshi.error?'CANDLES_UNAVAILABLE':
    observed.yes.length?'OBSERVED':'HISTORY_ONLY',points:yes,
    priceCurrency:'USD_PER_CONTRACT',note:'Kalshi 1-minute YES ask candle closes and newly observed YES asks.'},
   no:{source:'Kalshi public NO ask (observed) / complement of YES bid (historical)',
    status:kalshi.error?'CANDLES_UNAVAILABLE':observed.no.length?'OBSERVED':'HISTORY_ONLY',
    points:no,priceCurrency:'USD_PER_CONTRACT',
    note:'Historical NO line is derived as 1 - official YES bid, NOT a recorded NO ask or executable fill. Latest points are actual observed NO asks.'},
   paperOnly:true,realOrdersEnabled:false,
   inventedTicks:0,syntheticForecastPath:false
  });
 }
 return {query,record};
}
module.exports={createCashV3ChartFeed,parseKrakenOHLC,parseKalshiCandles};
