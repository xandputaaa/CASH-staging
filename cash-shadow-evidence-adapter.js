'use strict';
/*
 * Offline adapter: archived pre-expiry shadow forecasts + independently
 * corroborated evidence rows. Does not generate backdated predictions.
 */
const {evaluateShadowCandidate}=require('./cash-model-lab');
const MARKET=/^KXBTC15M-[A-Za-z0-9-]{6,70}$/;
function compareShadowEvidence({baseline,candidate,candidateId}={}){
 if(!Array.isArray(baseline)||!Array.isArray(candidate)||
  baseline.length!==candidate.length||baseline.length>100000)
  throw Error('Shadow evidence cohorts must be bounded and paired');
 for(let i=0;i<baseline.length;i++){
  const a=baseline[i],b=candidate[i];
  if(!a||!b||!MARKET.test(a.marketId||'')||a.marketId!==b.marketId)
   throw Error('Shadow forecasts require identical market IDs');
  if(b.side!=='MISSING'&&(
   !Number.isFinite(b.forecastAtMs)||!Number.isFinite(b.marketCloseMs)||
   b.forecastAtMs>=b.marketCloseMs||b.marketCloseMs-b.forecastAtMs<90000||
   b.marketCloseMs-b.forecastAtMs>780000))
   throw Error('Shadow candidate must be frozen in eligible pre-expiry window');
  if(b.side!=='MISSING'&&b.modelId!==candidateId)
   throw Error('Shadow model identity mismatch');
  if(b.side!=='MISSING'&&b.archivedBeforeExpiry!==true)
   throw Error('Unarchived shadow predictions cannot be benchmarked');
 }
 return {...evaluateShadowCandidate({baseline,candidate,candidateId}),
  shadowArchiveTimestampChecked:true,
  shadowPreExpiryProvenanceIndependentlyVerified:false,
  note:'Offline paired benchmark only; source-side timestamps and archive flags are not independent proof of pre-expiry GitHub witnessing or complete chronological market eligibility.'};
}
module.exports={compareShadowEvidence};
