'use strict';
/*
 * Offline deterministic shadow candidate, NOT a calibrated model.
 * Spot momentum cannot directly establish Kalshi BRTI settlement probability.
 * No market access, execution, or model promotion.
 */
const {extractSpotFeatures}=require('./cash-model-lab-features');
const ID='CASH_SHADOW_SPOT_MOMENTUM_V1';
function shadowMomentumForecast({samples,asOfMs,marketId,strikePrice,leadSeconds}={}){
 if(typeof marketId!=='string'||!/^KXBTC15M-[A-Za-z0-9-]{6,70}$/.test(marketId)||
  !Number.isFinite(strikePrice)||strikePrice<=0||
  !Number.isFinite(leadSeconds)||leadSeconds<90||leadSeconds>780)
  throw Error('Invalid contract, strike, or horizon');
 const features=extractSpotFeatures(samples,{asOfMs});
 // Explicit abstention when sample coverage is inadequate.
 let side='WAIT',reason='INSUFFICIENT_HISTORY';
 if(features.sampleCount>=14&&features.historySeconds>=180){
  const gapBps=10000*Math.log(features.spotPrice/strikePrice);
  // Frozen heuristic; not trained or calibrated, and not a BRTI basis estimate.
  if(Math.abs(gapBps)>=12&&Math.abs(features.recentMomentumBps)>=3&&
    Math.sign(gapBps)===Math.sign(features.recentMomentumBps)){
   side=gapBps>0?'YES':'NO';
   reason='PROVISIONAL_SPOT_MOMENTUM_AGREEMENT';
  }else reason='INSUFFICIENT_SHADOW_EDGE';
 }
 return Object.freeze({modelId:ID,marketId,asOfMs,side,reason,
  strikePrice,leadSeconds,features,
  probability:null,executionAllowed:false,calibrated:false,
  source:'OFFLINE_SPOT_PROXY_ONLY',settlementVerified:false,
  note:'Uncalibrated spot proxy heuristic; not an exchange-verified settlement prediction or live trade instruction.'});
}
module.exports={shadowMomentumForecast,ID};
