'use strict';
/*
 * Descriptive, leakage-safe evaluation for one immutable KXBTC15M V3
 * forecast per market. Frozen forecast side is chosen without asks.
 * Market-quote baseline is a *comparison*, not a trading strategy, P&L or
 * independently validated prediction. Only officially resolved outcomes
 * (HIT/MISS with winner YES/NO) are counted.
 */
function wilson95(hits,n){
 if(!Number.isInteger(hits)||!Number.isInteger(n)||n<=0||hits<0||hits>n)
  return {lower:null,upper:null};
 const z=1.959963984540054,phat=hits/n,z2=z*z;
 const center=(phat+z2/(2*n))/(1+z2/n);
 const margin=z*Math.sqrt((phat*(1-phat)+z2/(4*n))/n)/(1+z2/n);
 return {lower:Math.max(0,center-margin),upper:Math.min(1,center+margin)};
}
const BUCKETS=[
 {name:'8+ minutes before expiry',min:480000,max:Infinity},
 {name:'4–8 minutes before expiry',min:240000,max:480000},
 {name:'under 4 minutes before expiry',min:0,max:240000}
];
const summary=(records=[])=>{
 const selected=records.filter(r=>r&&(['YES','NO',null].includes(r.side)));
 const directional=selected.filter(r=>r.side==='YES'||r.side==='NO');
 const scored=directional.filter(r=>['HIT','MISS'].includes(r.status)&&
   ['YES','NO'].includes(r.winner)&&
   r.status===(r.side===r.winner?'HIT':'MISS'));
 const hits=scored.filter(r=>r.status==='HIT').length;
 const baselineRows=scored.map(r=>{
  const yes=r.observedAsks?.YES,no=r.observedAsks?.NO;
  const valid=Number.isFinite(yes)&&Number.isFinite(no)&&yes>0&&yes<1&&no>0&&no<1&&yes!==no;
  return valid?{r,baseline:yes>no?'YES':'NO'}:null;
 }).filter(Boolean);
 const baselineHits=baselineRows.filter(x=>x.baseline===x.r.winner).length;
 const matchedHits=baselineRows.filter(x=>x.r.side===x.r.winner).length;
 const disputes=baselineRows.filter(x=>x.baseline!==x.r.side);
 const disagreementModelWins=disputes.filter(x=>x.r.side===x.r.winner).length;
 const disagreementMarketWins=disputes.filter(x=>x.baseline===x.r.winner).length;
 const byLead=BUCKETS.map(bucket=>{
  const group=directional.filter(r=>Number.isFinite(r.leadMs)&&
   r.leadMs>=bucket.min&&r.leadMs<bucket.max);
  const resolved=group.filter(r=>scored.includes(r));
  const won=resolved.filter(r=>r.status==='HIT').length;
  return {window:bucket.name,directionalFrozen:group.length,
   officiallyScored:resolved.length,hits:won,misses:resolved.length-won,
   hitRate:resolved.length?won/resolved.length:null};
 });
 return {
  version:'CASH_SETTLEMENT_EVALUATION_V1',
  directionalFrozen:directional.length,waitsFrozen:selected.length-directional.length,
  pendingDirectional:directional.filter(r=>r.status==='PENDING').length,
  voidDirectional:directional.filter(r=>r.status==='VOID').length,
  officiallyScored:scored.length,hits,misses:scored.length-hits,
  exploratoryAccuracy:scored.length?hits/scored.length:null,
  wilson95: wilson95(hits,scored.length),
  coverage: selected.length?directional.length/selected.length:null,
  comparison:{
   kind:'OBSERVED_PUBLIC_YES_NO_ASK_QUOTE_BASELINE',
   comparableScored:baselineRows.length,
   marketFavoredHits:baselineHits,
   marketFavoredHitRate:baselineRows.length?baselineHits/baselineRows.length:null,
   cashHitsOnComparable:matchedHits,
   cashHitRateOnComparable:baselineRows.length?matchedHits/baselineRows.length:null,
   accuracyDifference:baselineRows.length?
    (matchedHits-baselineHits)/baselineRows.length:null,
   disagreementsScored:disputes.length,
   cashWinsInDisagreements:disagreementModelWins,
   marketWinsInDisagreements:disagreementMarketWins,
   note:'Naive market-favored quote side chosen from higher public observed ASK at freeze. Not executable, fee-aware, probability calibrated or proven to beat the market.'
  },
  byLead,
  independentlyValidated:false,
  profitVerified:false,
  accuracyGuaranteed:false,
  note:'Retrospective descriptive statistics for prospectively frozen V3 contracts after verified official results. Self-hosted event hashes are not independent timestamps. Small samples and selection bias can be misleading.'
 };
};
module.exports={wilson95,summarizeSettlementEvaluation:summary};
