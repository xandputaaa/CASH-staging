'use strict';
/*
 * Cached, unauthenticated Kalshi KXBTC15M series metadata and fee preview.
 * No trades, secrets, user account data, model probabilities or edge claims.
 * Fee preview covers a hypothetical one-contract taker fill using series
 * settings; event overrides, member-specific rounding and slippage unknown.
 */
const SERIES='KXBTC15M';
const ENDPOINT='https://external-api.kalshi.com/trade-api/v2/series/'+SERIES;
const CACHE_MS=300000;
function validFee(raw){
 const s=raw?.series;
 const type=s?.fee_type,m=s?.fee_multiplier;
 if(s?.ticker!==SERIES||!['quadratic','quadratic_with_maker_fees'].includes(type)
   ||typeof m!=='number'||!Number.isFinite(m)||m<0||m>5)
  return null;
 return {type,multiplier:m};
}
function takerPreview(price,multiplier,contracts=1){
 if(!Number.isFinite(price)||price<=0||price>=1||
  !Number.isFinite(multiplier)||multiplier<0||multiplier>5||
  !Number.isSafeInteger(contracts)||contracts<1||contracts>10000)return null;
 const cost=contracts*price;
 const raw=0.07*multiplier*contracts*price*(1-price);
 // Kalshi's published direct-member centicent ($0.0001) rounding:
 // an illustrative upper-rounded fee, not a broker-specific exact fill.
 const fee=raw<=0?0:Math.ceil((raw-1e-12)*10000)/10000;
 return {contracts,price,fee,feeBeforeRounding:raw,
  // Never round the hypothetical maximum loss downward near the $10 guardrail.
  hypotheticalCost:Math.ceil(((cost+fee)-1e-12)*10000)/10000,
  grossBreakEven:price,
  estimatedAfterFeeBreakEven:(cost+fee)/contracts,
  maxGrossPayout:contracts,
  rounding:'CEIL_TO_CENTICENT_ASSUMPTION'};
}
function createKalshiFeeFeed({fetchImpl=fetch,clock=()=>Date.now()}={}){
 let saved=null,lastCheck=null,inflight=null,failed=false,sourceError=null;
 function view(){
  const now=clock(),ageMs=lastCheck===null?null:Math.max(0,now-lastCheck);
  const state=!saved?'UNAVAILABLE':failed||ageMs>CACHE_MS?'STALE':'SERIES_METADATA_LIVE';
  return {state,source:'KALSHI_PUBLIC_SERIES_API',ticker:SERIES,
   feeType:state==='SERIES_METADATA_LIVE'?saved.type:null,
   feeMultiplier:state==='SERIES_METADATA_LIVE'?saved.multiplier:null,
   refreshedAt:lastCheck===null?null:new Date(lastCheck).toISOString(),
   ageMs,feeModel:'QUADRATIC_TAKER_BASE',
   eventOverridesVerified:false,memberRoundingVerified:false,
   feesExecutable:false,realOrdersEnabled:false,
   reason:state==='UNAVAILABLE'?'No verified public series fee metadata':
    state==='STALE'?'Series fee metadata is stale or refresh failed':
    'Series-level fee metadata only; event overrides and fill costs are not verified'};
 }
 async function query(){
  if(inflight)return inflight;
  if(lastCheck!==null&&clock()-lastCheck<CACHE_MS)return view();
  inflight=(async()=>{
   try{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),3000);
    let payload;
    try{
     const response=await fetchImpl(ENDPOINT,{
      headers:{Accept:'application/json','User-Agent':'CASH-paper-only-Kalshi15/1.0'},
      signal:controller.signal
     });
     if(!response.ok)throw Error('Kalshi fee metadata unavailable');
     payload=await response.json();
    }finally{clearTimeout(timeout)}
    const validated=validFee(payload);
    if(!validated)throw Error('Unsupported Kalshi series fee structure');
    saved=validated;failed=false;sourceError=null;
   }catch{
    failed=true;sourceError='Series fee verification failed';
   }
   lastCheck=clock();
   return view();
  })().finally(()=>{inflight=null});
  return inflight;
 }
 return {query,view};
}
module.exports={createKalshiFeeFeed,takerPreview,validFee,SERIES};
