'use strict';
// Offline research-only driftless lognormal benchmark, NOT a CASH forecast.
// Coinbase/Kraken spot is not Kalshi's licensed BRTI settlement index.
// Inputs must be from a timestamped snapshot already available at observation time.
function erf(x){
 const sign=x<0?-1:1; x=Math.abs(x);
 const t=1/(1+0.3275911*x);
 const y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x);
 return sign*y;
}
function normalCdf(z){return (1+erf(z/Math.SQRT2))/2;}
function benchmark({spot,strike,volatilityPerSqrtSecond,secondsRemaining,observedAt,inputLatestAt}={}){
 const errors=[];
 for(const [name,value] of Object.entries({spot,strike,volatilityPerSqrtSecond,secondsRemaining,observedAt,inputLatestAt}))
  if(typeof value!=='number'||!Number.isFinite(value))errors.push('INVALID_'+name.toUpperCase());
 if(errors.length)return {status:'BLOCKED',errors,probabilityYes:null};
 if(spot<=0||strike<=0||volatilityPerSqrtSecond<=0||volatilityPerSqrtSecond>0.1||secondsRemaining<60||secondsRemaining>900)
  errors.push('INVALID_MARKET_OR_VOLATILITY_RANGE');
 if(inputLatestAt>observedAt||observedAt-inputLatestAt>60000)errors.push('LOOKAHEAD_OR_STALE_INPUT');
 if(errors.length)return {status:'BLOCKED',errors,probabilityYes:null};
 const horizonVol=volatilityPerSqrtSecond*Math.sqrt(secondsRemaining);
 const d2=(Math.log(spot/strike)-0.5*horizonVol*horizonVol)/horizonVol;
 return {status:'RESEARCH_BASELINE_ONLY',probabilityYes:normalCdf(d2),probabilityNo:1-normalCdf(d2),
  model:'DRIFTLESS_LOGNORMAL_BENCHMARK_V1',usesLicensedBrti:false,calibrated:false,
  independentlyQualified:false,tradeSignal:false,realOrdersEnabled:false};
}
module.exports={benchmark,normalCdf};
