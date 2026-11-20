'use strict';
/*
 * GitHub-runner public snapshot fetch. Timestamp is captured AFTER receiving
 * the public body; source-side timestamps are not used as observation proof.
 * Always writes a diagnostic artifact. Cannot qualify outcomes or trade.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {observeShadowSnapshot}=require('./cash-shadow-observer');
const {githubRunnerReadHeaders}=require('./cash-runner-read-auth');
const URL='https://cash-simulation-web-staging.up.railway.app/api/model-lab/shadow/export';
const SHA=x=>crypto.createHash('sha256').update(x).digest('hex');
async function getPublicSnapshot(url,{fetchImpl=fetch}={}){
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),15000);
 try{
  const auth=await githubRunnerReadHeaders();
  const res=await fetchImpl(url,{signal:ctl.signal,redirect:'error',headers:{
   Accept:'application/json','User-Agent':'CASH-shadow-GitHub-observer/1.0',...auth
  }});
  if(!res.ok)throw Error('SHADOW_SOURCE_HTTP_'+res.status);
  const body=await res.text();
  if(Buffer.byteLength(body)>2500000)throw Error('SHADOW_SOURCE_TOO_LARGE');
  return {snapshot:JSON.parse(body),sha256:SHA(body)};
 }finally{clearTimeout(timer)}
}
async function runPublicShadowObserver({fetchImpl=fetch,clock=()=>Date.now(),
 outDirectory='witness',env=process.env}={}){
 const result={
  version:'CASH_SHADOW_GITHUB_PUBLIC_OBSERVATION_V1',
  provenance:'GITHUB_RUNNER_FETCH_AFTER_NETWORK_RESPONSE',
  sourceUrl:URL,sourceSha256:null,
  githubRunId:String(env.GITHUB_RUN_ID||'LOCAL_TEST'),
  githubRepository:String(env.GITHUB_REPOSITORY||'UNKNOWN'),
  githubCommitSha:String(env.GITHUB_SHA||'UNKNOWN'),
  observedAtRunner:null,status:'UNAVAILABLE',
  observedForecasts:[],observedBeforeExpiryCount:0,
  independentlyQualifiedCount:0,realMoneyOrdersAllowed:false,
  note:'Pre-expiry GitHub observation of public source claims, not independent BRTI settlement attestation, calibrated accuracy, or permission to trade.'
 };
 try{
  const {snapshot,sha256}=await getPublicSnapshot(URL,{fetchImpl});
  // This clock is intentionally read AFTER the complete network fetch.
  const observedAtMs=clock();
  if(!Number.isFinite(observedAtMs))throw Error('RUNNER_CLOCK_UNAVAILABLE');
  result.observedAtRunner=new Date(observedAtMs).toISOString();
  const evidence=observeShadowSnapshot(snapshot,{
   observedAtMs,runId:result.githubRunId
  });
  result.sourceSha256=sha256;
  result.observedForecasts=evidence.observedForecasts;
  result.observedBeforeExpiryCount=evidence.observedBeforeExpiryCount;
  result.status=evidence.observedBeforeExpiryCount?'OBSERVED_PREEXPIRY':'NO_ELIGIBLE_PREEXPIRY_RECORDS';
 }catch(error){
  result.status='PUBLIC_SOURCE_UNAVAILABLE_OR_INVALID';
  result.errorCode='CANNOT_WITNESS_SOURCE';
  result.observedAtRunner=new Date(clock()).toISOString();
 }
 fs.mkdirSync(outDirectory,{recursive:true});
 fs.writeFileSync(path.join(outDirectory,'shadow-public-observation.json'),
  JSON.stringify(result,null,2)+'\n',{mode:0o600});
 console.log('CASH_SHADOW_OBSERVER_STATUS='+result.status);
 console.log('CASH_SHADOW_OBSERVED_PREEXPIRY='+result.observedBeforeExpiryCount);
 console.log('CASH_SHADOW_INDEPENDENTLY_QUALIFIED=0');
 console.log('CASH_SHADOW_ORDERS_ALLOWED=false');
 return result;
}
if(require.main===module)
 runPublicShadowObserver().catch(()=>{
  console.error('CASH shadow observer internal failure; no qualification');
  process.exitCode=1;
 });
module.exports={getPublicSnapshot,runPublicShadowObserver,URL};
