'use strict';
/*
 * CASH Spot Momentum Candidate V1
 * Experimental, no calibrated probability or guarantee. Uses public single
 * exchange BTC/USD spot samples ONLY. Does NOT read market quotes, odds,
 * settlement prices, venue targets, or any data after the capture time.
 * Markets settle on different indexes, so these may disagree with spot.
 */
const SOURCES=new Set(['Kraken BTC/USD','Coinbase Exchange BTC-USD']);
const NAME='SPOT_MOMENTUM_90S_V1';
function proposeSpotMomentum(snapshot,now=Date.now()){
  if(!snapshot||snapshot.status!=='live'||!SOURCES.has(snapshot.source)
    ||!Array.isArray(snapshot.history)||!Number.isFinite(now))return null;
  const history=snapshot.history.slice(-72);
  if(history.length<4)return null;
  const samples=[];
  for(const item of history){
    const t=Date.parse(item?.time),p=item?.price;
    if(!Number.isFinite(t)||!Number.isFinite(p)||p<1000||p>10000000
      ||!SOURCES.has(item.source))return null;
    if(samples.length&&t<=samples[samples.length-1].t)return null;
    samples.push({t,price:p,source:item.source});
  }
  const latest=samples[samples.length-1];
  if(latest.source!==snapshot.source||latest.t>now+2000||now-latest.t>12000)return null;
  const eligible=samples.filter(x=>latest.t-x.t>=65000&&latest.t-x.t<=110000);
  if(!eligible.length)return null;
  eligible.sort((a,b)=>Math.abs((latest.t-a.t)-90000)-Math.abs((latest.t-b.t)-90000));
  const previous=eligible[0];
  const window=samples.filter(x=>x.t>=previous.t);
  if(window.length<4||window.some(x=>x.source!==snapshot.source))return null;
  const delta=latest.price-previous.price;
  const threshold=Math.max(3,latest.price*0.00003);
  if(Math.abs(delta)<threshold)return null;
  return {
    name:NAME,predictedDirection:delta>0?'UP':'DOWN',
    source:latest.source,referencePrice:previous.price,latestPrice:latest.price,
    referenceAt:new Date(previous.t).toISOString(),latestAt:new Date(latest.t).toISOString(),
    lookbackSeconds:(latest.t-previous.t)/1000,deltaUsd:delta,
    thresholdUsd:threshold,calibratedProbability:null,
    caveat:'Single-exchange short-horizon momentum. Not the venue settlement index, an executable signal, or a calibrated forecast.'
  };
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
    ||value.thresholdUsd<=0||value.lookbackSeconds<65||value.lookbackSeconds>110
    ||Math.abs(value.latestPrice-value.referencePrice-value.deltaUsd)>0.000001
    ||Math.abs(value.deltaUsd)<value.thresholdUsd
    ||(value.deltaUsd>0?'UP':'DOWN')!==value.predictedDirection)return false;
  const ref=Date.parse(value.referenceAt),last=Date.parse(value.latestAt);
  return Number.isFinite(ref)&&Number.isFinite(last)
    &&Math.abs((last-ref)/1000-value.lookbackSeconds)<0.00001
    &&last<=capturedMs+2000&&capturedMs-last<=12000;
}
module.exports={proposeSpotMomentum,toContractSide,isValidSpotCandidate,NAME};
