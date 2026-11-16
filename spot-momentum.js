'use strict';
/*
 * CASH Spot Momentum Candidate V1
 * Experimental, no calibrated probability or guarantee. Uses public single
 * exchange BTC/USD spot samples ONLY. Does NOT read market quotes, odds,
 * settlement prices, venue targets, or any data after the capture time.
 * Markets settle on different indexes, so these may disagree with spot.
 *
 * Newly generated candidates preserve the exact sample window that created
 * them so a later replay can reproduce their direction. Those samples are
 * still self-reported public-feed observations, NOT authenticated exchange
 * evidence or independently attested prediction timestamps.
 */
const SOURCES=new Set(['Kraken BTC/USD','Coinbase Exchange BTC-USD']);
const NAME='SPOT_MOMENTUM_90S_V1';
const REASONS=Object.freeze({
 READY:'CANDIDATE',MISSING:'SPOT_UNAVAILABLE',SHORT:'HISTORY_TOO_SHORT',
 INVALID:'INVALID_SAMPLE',ORDER:'NON_CHRONOLOGICAL',STALE:'STALE_SPOT',
 LOOKBACK:'NO_90S_LOOKBACK',MIXED:'MIXED_SOURCE_WINDOW',FLAT:'MOVEMENT_TOO_SMALL'
});
const denied=reason=>({candidate:null,reason});
function assessSpotMomentum(snapshot,now=Date.now()){
 if(!snapshot||snapshot.status!=='live'||!SOURCES.has(snapshot.source)
  ||!Array.isArray(snapshot.history)||!Number.isFinite(now))
  return denied(REASONS.MISSING);
 const history=snapshot.history.slice(-72);
 if(history.length<4)return denied(REASONS.SHORT);
 const samples=[];
 for(const item of history){
  const t=Date.parse(item?.time),p=item?.price;
  if(!Number.isFinite(t)||!Number.isFinite(p)||p<1000||p>10000000||
    !SOURCES.has(item.source))return denied(REASONS.INVALID);
  if(samples.length&&t<=samples[samples.length-1].t)return denied(REASONS.ORDER);
  samples.push({t,price:p,source:item.source});
 }
 const latest=samples[samples.length-1],fetchAt=Date.parse(snapshot.fetchedAt);
 if(latest.source!==snapshot.source||latest.t>now+2000||now-latest.t>12000||
  (Number.isFinite(fetchAt)&&Math.abs(fetchAt-latest.t)>2000))
  return denied(REASONS.STALE);
 const eligible=samples.filter(x=>latest.t-x.t>=65000&&latest.t-x.t<=110000);
 if(!eligible.length)return denied(REASONS.LOOKBACK);
 eligible.sort((a,b)=>Math.abs((latest.t-a.t)-90000)-Math.abs((latest.t-b.t)-90000));
 const previous=eligible[0],window=samples.filter(x=>x.t>=previous.t);
 if(window.length<4)return denied(REASONS.SHORT);
 if(window.some(x=>x.source!==snapshot.source))return denied(REASONS.MIXED);
 const delta=latest.price-previous.price,threshold=Math.max(3,latest.price*0.00003);
 if(Math.abs(delta)<threshold)return denied(REASONS.FLAT);
 return {reason:REASONS.READY,candidate:{
  name:NAME,predictedDirection:delta>0?'UP':'DOWN',
  source:latest.source,referencePrice:previous.price,latestPrice:latest.price,
  referenceAt:new Date(previous.t).toISOString(),latestAt:new Date(latest.t).toISOString(),
  lookbackSeconds:(latest.t-previous.t)/1000,deltaUsd:delta,
  thresholdUsd:threshold,calibratedProbability:null,
  sampleWindow:window.map(x=>({time:new Date(x.t).toISOString(),price:x.price,source:x.source})),
  caveat:'Single-exchange short-horizon momentum. Not the venue settlement index, an executable signal, or a calibrated forecast.'
 }};
}
function proposeSpotMomentum(snapshot,now=Date.now()){
 return assessSpotMomentum(snapshot,now).candidate;
}
function toContractSide(venue,direction){
 if(!['UP','DOWN'].includes(direction))return null;
 if(venue==='Kalshi')return direction==='UP'?'YES':'NO';
 if(venue==='Polymarket')return direction;
 return null;
}
function isValidSpotCandidate(value,venue,capturedMs){
 if(!value||value.name!==NAME||!SOURCES.has(value.source)
  ||!['UP','DOWN'].includes(value.predictedDirection)
  ||toContractSide(venue,value.predictedDirection)!==value.predictedContractSide
  ||value.calibratedProbability!==null
  ||!Number.isFinite(value.referencePrice)||!Number.isFinite(value.latestPrice)
  ||!Number.isFinite(value.deltaUsd)||!Number.isFinite(value.thresholdUsd)
  ||value.referencePrice<1000||value.latestPrice<1000
  ||value.latestPrice>10000000||value.referencePrice>10000000
  ||Math.abs(value.thresholdUsd-Math.max(3,value.latestPrice*0.00003))>0.000001
  ||value.lookbackSeconds<65||value.lookbackSeconds>110
  ||Math.abs(value.latestPrice-value.referencePrice-value.deltaUsd)>0.000001
  ||Math.abs(value.deltaUsd)<value.thresholdUsd
  ||(value.deltaUsd>0?'UP':'DOWN')!==value.predictedDirection)return false;
 const ref=Date.parse(value.referenceAt),last=Date.parse(value.latestAt);
 if(!Number.isFinite(ref)||!Number.isFinite(last)||!Number.isFinite(capturedMs)
  ||Math.abs((last-ref)/1000-value.lookbackSeconds)>=0.00001
  ||last>capturedMs+2000||capturedMs-last>12000)return false;
 // Existing pre-upgrade journals may lack sampleWindow. They remain legacy,
 // never qualifying, and are counted separately from reproducible candidates.
 if(value.sampleWindow===undefined)return true;
 if(!Array.isArray(value.sampleWindow)||value.sampleWindow.length<4||value.sampleWindow.length>72)
  return false;
 const recomputed=proposeSpotMomentum({
  status:'live',source:value.source,history:value.sampleWindow,
  fetchedAt:value.latestAt
 },capturedMs);
 if(!recomputed||recomputed.predictedDirection!==value.predictedDirection
  ||recomputed.referenceAt!==value.referenceAt||recomputed.latestAt!==value.latestAt
  ||Math.abs(recomputed.referencePrice-value.referencePrice)>0.000001
  ||Math.abs(recomputed.latestPrice-value.latestPrice)>0.000001
  ||Math.abs(recomputed.deltaUsd-value.deltaUsd)>0.000001
  ||Math.abs(recomputed.thresholdUsd-value.thresholdUsd)>0.000001
  ||recomputed.sampleWindow.length!==value.sampleWindow.length)return false;
 for(let i=0;i<recomputed.sampleWindow.length;i++){
  const a=recomputed.sampleWindow[i],b=value.sampleWindow[i];
  if(!b||a.time!==b.time||a.source!==b.source||a.price!==b.price)return false;
 }
 return true;
}
module.exports={proposeSpotMomentum,assessSpotMomentum,toContractSide,isValidSpotCandidate,NAME,REASONS};
