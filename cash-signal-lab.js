'use strict';
// CASH Signal Lab: deterministic technical-study annotations, NOT a trading signal.
// Input must be real, fully closed, consecutive Kraken 1-minute OHLC bars.
const INTERVAL_MS=60_000;
const PERIOD=14,FAST=9,SLOW=21;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
function cleanSegment(candles,now){
 if(!Array.isArray(candles))return [];
 let run=[],previous=-Infinity;
 for(const bar of candles){
  const okay=bar&&bar.kind==='CLOSED_1M'&&Number.isSafeInteger(bar.t)&&
   bar.t%INTERVAL_MS===0&&bar.t<=now&&bar.t>=now-90*INTERVAL_MS&&
   ['open','high','low','close'].every(k=>finite(bar[k])&&bar[k]>1000)&&
   bar.high>=Math.max(bar.open,bar.close,bar.low)&&
   bar.low<=Math.min(bar.open,bar.close,bar.high);
  if(!okay||bar.t<=previous){run=[];previous=-Infinity;continue}
  if(previous!==-Infinity&&bar.t-previous!==INTERVAL_MS)run=[];
  run.push(bar);previous=bar.t;
 }
 return run.slice(-70);
}
function ema(values,n){
 const alpha=2/(n+1),out=[];let v=null;
 for(let i=0;i<values.length;i++){
  if(i===n-1)v=values.slice(0,n).reduce((a,b)=>a+b,0)/n;
  else if(i>n-1)v=values[i]*alpha+v*(1-alpha);
  out.push(v);
 }
 return out;
}
function rsi(values,n=PERIOD){
 const scores=Array(values.length).fill(null);
 for(let i=n;i<values.length;i++){
  let gains=0,losses=0;
  for(let j=i-n+1;j<=i;j++){
   const change=values[j]-values[j-1];
   if(change>0)gains+=change;
   else losses-=change;
  }
  scores[i]=losses===0?(gains===0?50:100):100-100/(1+gains/losses);
 }
 return scores;
}
function evaluateSignalLab(candles,{now=Date.now(),sourceAvailable=true}={}){
 const empty={version:'CASH_SIGNAL_LAB_V1',market:'KRAKEN_BTC_USD_SPOT',
  timeframe:'CLOSED_1M',study:'EMA9_EMA21_RSI14',
  executionAuthorized:false,independentlyValidated:false,
  status:'UNAVAILABLE',bias:'NO CONFIRMATION',latest:null,markers:[],
  sampleCount:0,lastClosedAt:null,reason:'Verified candle history unavailable.'};
 if(!sourceAvailable||!finite(now))return empty;
 const bars=cleanSegment(candles,now),count=bars.length;
 if(count<30)return {...empty,status:'INSUFFICIENT_DATA',sampleCount:count,
   reason:'Need 30 consecutive, fully closed 1-minute Kraken candles.'};
 const last=bars.at(-1);
 if(now-last.t>120000)return {...empty,status:'STALE',sampleCount:count,
   lastClosedAt:new Date(last.t).toISOString(),
   reason:'Latest completed Kraken candle is stale. No current signal.'};
 const close=bars.map(c=>c.close),short=ema(close,FAST),long=ema(close,SLOW),
  strength=rsi(close),markers=[];
 for(let i=30;i<bars.length;i++){
  const priorFast=short[i-1],priorSlow=long[i-1],a=short[i],b=long[i],r=strength[i];
  if(![priorFast,priorSlow,a,b,r].every(finite))continue;
  let side=null;
  if(priorFast<=priorSlow&&a>b&&r>=53&&r<=75&&close[i]>b)side='BUY';
  if(priorFast>=priorSlow&&a<b&&r<=47&&r>=25&&close[i]<b)side='SELL';
  if(side)markers.push({t:bars[i].t,v:close[i],side,kind:'HISTORICAL_CLOSED_CANDLE_CROSSOVER'});
 }
 const i=bars.length-1,r=strength[i];
 let bias='NO CONFIRMATION';
 if(finite(r)&&short[i]>long[i]&&r>=53)bias='BULLISH BIAS';
 if(finite(r)&&short[i]<long[i]&&r<=47)bias='BEARISH BIAS';
 const latest={closedAt:new Date(last.t).toISOString(),
  close:last.close,emaFast:Number(short[i].toFixed(2)),
  emaSlow:Number(long[i].toFixed(2)),rsi14:Number(r.toFixed(1))};
 return {version:'CASH_SIGNAL_LAB_V1',market:'KRAKEN_BTC_USD_SPOT',
  timeframe:'CLOSED_1M',study:'EMA9_EMA21_RSI14',
  executionAuthorized:false,independentlyValidated:false,
  status:'HISTORICAL_STUDY',bias,latest,markers:markers.slice(-12),
  sampleCount:count,lastClosedAt:latest.closedAt,
  reason:'Spot-only technical study; not a Kalshi/BRTI forecast, order instruction or verified edge.'};
}
module.exports={evaluateSignalLab,cleanSegment};
