'use strict';
/*
 * Model Lab deterministic BTC spot features.
 * Historical, offline-only samples. No Kalshi labels or settlement leakage.
 * These features are research inputs, NOT a live trade signal.
 */
function extractSpotFeatures(samples,{asOfMs,maxAgeMs=12000}={}){
 if(!Array.isArray(samples)||samples.length<4||samples.length>10000||
  !Number.isFinite(asOfMs)||!Number.isFinite(maxAgeMs)||maxAgeMs<0)
  throw Error('Invalid bounded spot history or as-of timestamp');
 let previous=-Infinity;
 for(const s of samples){
  if(!s||!Number.isFinite(s.ts)||!Number.isFinite(s.price)||s.price<=0||
   s.ts<=previous||s.ts>asOfMs)throw Error('Invalid, unordered, or future spot sample');
  previous=s.ts;
 }
 const last=samples.at(-1),first=samples[0];
 if(asOfMs-last.ts>maxAgeMs)throw Error('Stale spot samples');
 const logReturns=[];
 for(let i=1;i<samples.length;i++)
  logReturns.push(Math.log(samples[i].price/samples[i-1].price));
 const mean=logReturns.reduce((a,b)=>a+b,0)/logReturns.length;
 const variance=logReturns.reduce((a,b)=>a+(b-mean)**2,0)/logReturns.length;
 const recent=samples.slice(-4);
 return Object.freeze({
  version:'CASH_SPOT_FEATURES_V1',
  asOfMs,lastSpotTs:last.ts,sampleCount:samples.length,
  historySeconds:(last.ts-first.ts)/1000,
  spotPrice:last.price,
  momentumBps:10000*Math.log(last.price/first.price),
  recentMomentumBps:10000*Math.log(last.price/recent[0].price),
  realizedReturnVolBps:10000*Math.sqrt(variance),
  maxAbsReturnBps:10000*Math.max(...logReturns.map(Math.abs)),
  lastSampleAgeMs:asOfMs-last.ts,
  labelFree:true,tradeSignal:false
 });
}
module.exports={extractSpotFeatures};
