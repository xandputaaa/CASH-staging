'use strict';
/*
 * FROZEN FORECAST RESEARCH MODEL -- KXBTC15M_STRIKE_VOL_V1
 *
 * YES/NO/WAIT forecast uses public Kraken or Coinbase BTC spot history,
 * official Kalshi strike and market time remaining. It NEVER uses Kalshi asks,
 * bids, outcome, settlement labels or later spot samples to choose its side.
 * Proxy spot is NOT the official 60-second BRTI settlement average.
 * Side classifications are NOT calibrated probabilities or real-money advice.
 */
const {createHash}=require('node:crypto');
const NAME='KXBTC15M_STRIKE_VOL_V1';
const MODEL=Object.freeze({
 minHistoryMs:180000,
 minSamples:14,
 maxGapMs:45000,
 minLeadMs:90000,
 maxLeadMs:240000,
 maxSpotAgeMs:12000,
 maxQuoteAgeMs:12000,
 minBasisGapBps:8,
 sigmaLeadMultiplier:1.6,
 minVariancePerSecond:1e-10
});
const officialSource='CF Benchmarks BRTI via Kalshi read-only';
const sourceSet=new Set(['Kraken BTC/USD','Coinbase Exchange BTC-USD',officialSource]);
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validAsks=q=>Number.isFinite(q?.yesAsk)&&q.yesAsk>0&&q.yesAsk<1&&
 Number.isFinite(q?.noAsk)&&q.noAsk>0&&q.noAsk<1;
function evaluateProspective({quote,spot,now=Date.now()}={}){
 const why=reason=>({model:NAME,state:'WAIT',reason,
  side:null,signalZ:null,calibratedProbability:null,expectedValue:null,
  validation:'UNVALIDATED_PROXY_MODEL',realMoneyAuthorized:false});
 if(!Number.isFinite(now)||!quote||quote.venue!=='Kalshi'||
   typeof quote.marketId!=='string'||!/^KXBTC15M-[A-Za-z0-9-]{6,70}$/.test(quote.marketId))
  return why('NO_KALSHI_MARKET');
 const qt=Date.parse(quote.fetchedAt),expiry=Date.parse(quote.endTime),start=Date.parse(quote.openTime);
 const leadMs=expiry-now;
 if(!Number.isFinite(qt)||qt>now+2000||now-qt>MODEL.maxQuoteAgeMs||
  quote.status!=='live'||quote.refreshFailed===true||!validAsks(quote))
  return why('STALE_OR_INCOMPLETE_KALSHI_QUOTE');
 if(!Number.isFinite(expiry)||leadMs<MODEL.minLeadMs||leadMs>MODEL.maxLeadMs||
    Number.isFinite(start)&&start>now)
  return why('OUTSIDE_FROZEN_PREDICTION_WINDOW');
 if(!Number.isFinite(quote.targetPrice)||quote.targetPrice<=1000||quote.targetPrice>=10000000||
  quote.targetSource!=='KALSHI_FLOOR_STRIKE'||quote.strikeType!=='greater_or_equal'||
  quote.tieGoesToYes!==true||quote.contractRuleStatus!=='BRTI_60S_RULE_TEXT_PRESENT')
  return why('OFFICIAL_STRIKE_OR_RULE_NOT_VERIFIED');
 if(!spot||spot.status!=='live'||!sourceSet.has(spot.source)||
  !Number.isFinite(spot.price)||spot.price<=1000||!Array.isArray(spot.history))
  return why('SPOT_PROXY_UNAVAILABLE');
 const latestAt=Date.parse(spot.fetchedAt);
 if(!Number.isFinite(latestAt)||latestAt>now+2000||now-latestAt>MODEL.maxSpotAgeMs)
  return why('SPOT_PROXY_STALE');
 // Fail closed when the last observation window switches exchange sources.
 // A cross-exchange splice could mimic signal momentum that never occurred.
 const recent=spot.history.filter(x=>{
  const t=Date.parse(x?.time);
  return Number.isFinite(t)&&t<=now&&t>=now-360000;
 });
 if(recent.some(x=>x.source!==spot.source))return why('MIXED_SOURCE_SPOT_WINDOW');
 // Strictly select chronological past-only samples from one exchange.
 const samples=recent.filter(x=>{
  const t=Date.parse(x?.time);
  return Number.isFinite(t)&&t<=now&&t>=now-360000 &&
   x?.source===spot.source&&Number.isFinite(x.price)&&x.price>1000&&x.price<10000000;
 }).map(x=>({time:x.time,price:x.price,source:x.source}));
 if(samples.length<MODEL.minSamples)return why('INSUFFICIENT_SPOT_HISTORY');
 const tail=samples.slice(-24);
 const first=Date.parse(tail[0].time),last=Date.parse(tail[tail.length-1].time);
 if(last-first<MODEL.minHistoryMs||last>now+2000||now-last>MODEL.maxSpotAgeMs||
   Math.abs(spot.price-tail[tail.length-1].price)>0.01)
  return why('NONCONTINUOUS_SPOT_WINDOW');
 let sumSquares=0,sumSeconds=0;
 for(let i=1;i<tail.length;i++){
  const dt=(Date.parse(tail[i].time)-Date.parse(tail[i-1].time))/1000;
  if(!(dt>0&&dt*1000<=MODEL.maxGapMs))return why('IRREGULAR_SPOT_HISTORY');
  const change=Math.log(tail[i].price/tail[i-1].price);
  sumSquares+=change*change;
  sumSeconds+=dt;
 }
 if(sumSeconds<MODEL.minHistoryMs/1000)return why('HISTORY_TOO_SHORT');
 const sigma=Math.sqrt(Math.max(MODEL.minVariancePerSecond,sumSquares/sumSeconds));
 const gapLog=Math.log(spot.price/quote.targetPrice);
 const gapBps=gapLog*10000;
 // Explicitly cushion venue proxy basis mismatch and expected future price motion.
 const volatilityBarrier=MODEL.sigmaLeadMultiplier*sigma*Math.sqrt(leadMs/1000);
 const proxyBasisBarrier=MODEL.minBasisGapBps/10000;
 const cutoff=Math.max(volatilityBarrier,proxyBasisBarrier);
 const side=gapLog>cutoff?'YES':gapLog< -cutoff?'NO':null;
 const sampleWindowSha256=digest(tail);
 const officialIndexInput=spot.source===officialSource;
 return {
  model:NAME,state:side?'PROVISIONAL_DIRECTION':'WAIT',
  reason:side?'STRIKE_GAP_EXCEEDS_VOLATILITY_AND_PROXY_BUFFER':'EDGE_UNCLEAR_VS_VOLATILITY',
  side,signalZ:Math.round(gapLog/(sigma*Math.sqrt(leadMs/1000))*1000)/1000,
  calibratedProbability:null,expectedValue:null,
  validation:officialIndexInput?'UNVALIDATED_BRTI_MODEL':'UNVALIDATED_PROXY_MODEL',
  realMoneyAuthorized:false,indexSourceType:officialIndexInput?'OFFICIAL_BRTI_LIVE':'SINGLE_EXCHANGE_PROXY',
  modelParams:MODEL,marketId:quote.marketId,
  at:new Date(now).toISOString(),endTime:quote.endTime,leadMs,
  targetPrice:quote.targetPrice,quoteFetchedAt:quote.fetchedAt,
  observedAsks:{YES:quote.yesAsk,NO:quote.noAsk},
  spotSource:spot.source,spotPrice:spot.price,spotFetchedAt:spot.fetchedAt,
  gapBps:Math.round(gapBps*1000)/1000,
  sigmaPerSqrtSecond:sigma,barrierBps:cutoff*10000,
  sampleWindow:tail,sampleWindowSha256,
  inputSha256:digest({marketId:quote.marketId,at:new Date(now).toISOString(),
   target:quote.targetPrice,spotPrice:spot.price,side,gapBps:Math.round(gapBps*1000)/1000,
   sampleWindowSha256}),
  warning:officialIndexInput?
   'Based on live BRTI values, not the closing 60-second settlement average. Uncalibrated; no verified edge, legal redistribution rights, or trading authorization implied.':
   'Independent of Kalshi odds, but uses single-exchange proxy instead of official BRTI. No proven edge or calibration.'
 };
}
module.exports={evaluateProspective,MODEL,NAME,digest};
