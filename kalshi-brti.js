'use strict';
/*
 * Optional, strictly READ-ONLY authenticated CF Benchmarks BRTI passthrough.
 * No credentials exposed in responses, logs, or exported forecast records.
 * Runs only when the owner explicitly configures Railway secrets and Kalshi
 * confirms index entitlement; no write or trading API is implemented.
 */
const crypto=require('node:crypto');
const API='https://external-api.kalshi.com';
const PATH='/trade-api/v2/cfbenchmarks/values';
const SOURCE='CF Benchmarks BRTI via Kalshi read-only';
const REQUEST_URL=API+PATH+'?id=BRTI&maxResolution=PER_SECOND';
const MAX_AGE_MS=12000,CACHE_MS=15000;
function readConfig(keyId,privateKeyPem){
 if(!keyId&&!privateKeyPem)return {state:'NOT_CONFIGURED'};
 if(typeof keyId!=='string'||!/^[-a-zA-Z0-9]{12,100}$/.test(keyId)||
  typeof privateKeyPem!=='string'||privateKeyPem.length<80)
  return {state:'INVALID_CONFIG'};
 try{
  const key=crypto.createPrivateKey(privateKeyPem.replace(/\\n/g,'\n'));
  if(!['rsa','ed25519'].includes(key.asymmetricKeyType))
   return {state:'INVALID_CONFIG'};
  return {state:'CONFIGURED',keyId,key};
 }catch{return {state:'INVALID_CONFIG'}}
}
function signedHeaders(config,nowMs){
 if(config?.state!=='CONFIGURED'||!Number.isFinite(nowMs))
  throw Error('Read-only Kalshi credentials unavailable');
 const timestamp=String(Math.floor(nowMs));
 const preSign=timestamp+'GET'+PATH;
 let sig;
 if(config.key.asymmetricKeyType==='ed25519'){
  sig=crypto.sign(null,Buffer.from(preSign),config.key);
 }else{
  const s=crypto.createSign('RSA-SHA256');s.update(preSign);s.end();
  sig=s.sign({key:config.key,padding:crypto.constants.RSA_PKCS1_PSS_PADDING,
   saltLength:crypto.constants.RSA_PSS_SALTLEN_DIGEST});
 }
 return {'KALSHI-ACCESS-KEY':config.keyId,
  'KALSHI-ACCESS-SIGNATURE':sig.toString('base64'),
  'KALSHI-ACCESS-TIMESTAMP':timestamp,Accept:'application/json'};
}
function parseBrtiResult(body,now){
 const data=body?.data;
 if(!data||data.error||!Array.isArray(data.payload))
  throw Error('INVALID_DATA');
 const list=[],unique=new Set();
 for(const row of data.payload){
  const t=Number(row?.time),price=Number(row?.value);
  if(!Number.isSafeInteger(t)||!Number.isFinite(price)||price<1000||price>10000000||
    t>now+2000||t<now-360000||row?.amendTime||row?.repeatOfPreviousValue===true)
   continue;
  if(unique.has(t))continue;
  unique.add(t);list.push({time:new Date(t).toISOString(),price,source:SOURCE});
 }
 list.sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
 if(!list.length)throw Error('NO_FRESH_INDEX_POINTS');
 const latest=list.at(-1),ageMs=now-Date.parse(latest.time);
 if(ageMs>MAX_AGE_MS)throw Error('STALE_INDEX');
 // Keep a bounded sample history but do not publish licensed values directly.
 return {latest,history:list.slice(-300),ageMs};
}
function createKalshiBrtiFeed({fetchImpl=fetch,clock=()=>Date.now(),
 keyId=process.env.CASH_KALSHI_READ_KEY_ID,
 privateKeyPem=process.env.CASH_KALSHI_READ_KEY_PEM,
 useForForecasts=process.env.CASH_USE_AUTHORIZED_BRTI_FOR_FORECASTS==='true'}={}){
 const auth=readConfig(keyId,privateKeyPem);
 const forecastingEnabled=()=>auth.state==='CONFIGURED'&&useForForecasts===true;
 let latest=null,lastAttempt=0,lastError=null,inflight=null;
 function health(){
  const now=clock();
  const ageMs=latest?now-Date.parse(latest.latest.time):null;
  const state=auth.state!=='CONFIGURED'?auth.state:
    lastError?lastError:!latest?'NOT_CONNECTED':
    ageMs<=MAX_AGE_MS?'LIVE':'STALE';
  return {source:'KALSHI_CF_BENCHMARKS_REST',
   indexId:'BRTI',state,
   authorizedConnectionConfigured:auth.state==='CONFIGURED',
   latestValueAt:latest?.latest.time||null,
   ageMs:ageMs===null?null:Math.max(0,ageMs),
   rawValueExposed:false,rawHistoryExposed:false,
   tradingPermission:false,usedForForecasts:forecastingEnabled()&&state==='LIVE',
   forecastOptIn:forecastingEnabled(),
   note:forecastingEnabled()?
    'Private official index enabled for experimental forecasts; not calibrated, not settlement 60-second average, and never an order permission.':
    'Authenticated BRTI connection status only; raw licensed prices are not publicly redistributed.'};
 }
 function internal(){
  if(!latest||health().state!=='LIVE')return null;
  // Reduce up to 1Hz upstream values into a reproducible 15-second past-only
  // trail for the frozen volatility model; keep full raw data private.
  const sampled=new Map();
  for(const point of latest.history)
   sampled.set(Math.floor(Date.parse(point.time)/15000),point);
  const history=[...sampled.values()].sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
  return {status:'live',source:SOURCE,price:history.at(-1)?.price??latest.latest.price,
   fetchedAt:history.at(-1)?.time??latest.latest.time,history};
 }
 async function update(){
  if(auth.state!=='CONFIGURED')return health();
  if(inflight)return inflight;
  if(lastAttempt&&clock()-lastAttempt<CACHE_MS)return health();
  lastAttempt=clock();
  inflight=(async()=>{
   try{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);
    let response;
    try{
     response=await fetchImpl(REQUEST_URL,{method:'GET',
      headers:signedHeaders(auth,clock()),signal:controller.signal});
    }finally{clearTimeout(timer)}
    if(!response.ok)throw Error(response.status===401||response.status===403?'NOT_ENTITLED':'SOURCE_UNAVAILABLE');
    latest=parseBrtiResult(await response.json(),clock());
    lastError=null;
   }catch(e){
    lastError=e?.message==='NOT_ENTITLED'?'NOT_ENTITLED':'SOURCE_UNAVAILABLE';
   }
   return health();
  })().finally(()=>{inflight=null});
  return inflight;
 }
 return {health,internal,update,forecastingEnabled};
}
module.exports={createKalshiBrtiFeed,readConfig,signedHeaders,parseBrtiResult,SOURCE};
