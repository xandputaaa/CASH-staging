'use strict';
/*
 * Descriptive scorecard for frozen prospective KXBTC15M research only.
 * A public market settlement paired to our own clock is NOT independent
 * time attestation, calibration, executable odds or a validated trading edge.
 */
const CI_Z=1.96;
function wilson95(hits,n){
 if(!Number.isInteger(hits)||!Number.isInteger(n)||n<=0||hits<0||hits>n)return null;
 const p=hits/n,z2=CI_Z*CI_Z,den=1+z2/n;
 const center=(p+z2/(2*n))/den;
 const margin=(CI_Z/den)*Math.sqrt(p*(1-p)/n+z2/(4*n*n));
 return {lower:Math.max(0,center-margin),upper:Math.min(1,center+margin)};
}
function group(records){
 const data={captured:0,directional:0,waits:0,pendingDirectional:0,
  pendingWaits:0,scoredDirectional:0,hits:0,misses:0,
  waitResolved:0,voids:0,unresolvedState:0};
 for(const r of records){
  data.captured++;
  const isDirectional=r.side==='YES'||r.side==='NO',isWait=r.side===null;
  if(isDirectional)data.directional++;
  if(isWait)data.waits++;
  switch(r.status){
   case 'PENDING':
    if(isDirectional)data.pendingDirectional++;
    if(isWait)data.pendingWaits++;
    break;
   case 'HIT':data.hits++;data.scoredDirectional++;break;
   case 'MISS':data.misses++;data.scoredDirectional++;break;
   case 'WAIT_RESOLVED':data.waitResolved++;break;
   case 'VOID':data.voids++;break;
   default:data.unresolvedState++;break;
  }
 }
 return {...data,exploratoryDirectionalHitRate:data.scoredDirectional?data.hits/data.scoredDirectional:null,
  descriptiveWilson95:wilson95(data.hits,data.scoredDirectional),
  directionalShareOfCaptured:data.captured?data.directional/data.captured:null,
  independentValidationCount:0};
}
function prospectiveScorecard(records){
 if(!Array.isArray(records))throw Error('Forecasts must be an array');
 const ids=new Set(),official=[],proxy=[];
 for(const r of records){
  if(!r||typeof r.marketId!=='string'||ids.has(r.marketId)||
   !['YES','NO',null].includes(r.side)||
   !['PENDING','HIT','MISS','WAIT_RESOLVED','VOID'].includes(r.status)||
   (['HIT','MISS'].includes(r.status)&&r.side===null)||
   (r.status==='WAIT_RESOLVED'&&r.side!==null)||
   ![undefined,null,'SINGLE_EXCHANGE_PROXY','OFFICIAL_BRTI_LIVE'].includes(r.indexSourceType))
   throw Error('Forecast journal contains invalid, conflicting or duplicate market');
  ids.add(r.marketId);
  if(r.indexSourceType==='OFFICIAL_BRTI_LIVE')official.push(r);
  else proxy.push(r);
 }
 return {version:'CASH_PROSPECTIVE_DESCRIPTIVE_SCORECARD_V1',
  overall:group(records),bySource:{publicSpotProxy:group(proxy),officialBrtiLive:group(official)},
  independentlyTimeAttested:false,qualifiedCount:0,requiredQualified:100,
  note:'Wilson range describes only scored directional records and is not a calibrated predictive probability. WAITs, voids, pending results, missing contracts and feed gaps are not wins. Source groups are never pooled to claim independent validation.'};
}
module.exports={prospectiveScorecard,wilson95};
