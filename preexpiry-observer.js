'use strict';
/*
 * Provisional off-server observer of prospectively frozen, still-open Kalshi
 * KXBTC15M research. GitHub Actions runner fetches the public journals and
 * publishes a narrow event hash plus its OWN observed time. This does not
 * establish trust in the server, model edge, fill prices or trusted timestamps.
 * Do not increment any independent-validation score.
 */
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const BASE='https://cash-simulation-web-staging.up.railway.app';
const SHA=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const VALID_ID=/^KXBTC15M-[A-Za-z0-9-]{6,70}$/;
const SPECS={
 early:{version:'CASH_PROSPECTIVE_KALSHI_V1',
  format:'CASH_PROSPECTIVE_HASHED_SESSION_V1',
  model:'KXBTC15M_SETTLEMENT_EARLY_V3',maxEvents:640,leads:[90000,780000]},
 late:{version:'CASH_LATE_CHECKPOINT_SHADOW_V1',
  format:'CASH_LATE_CHECKPOINT_UNVERIFIED_HASH_CHAIN_V1',
  model:'KXBTC15M_LATE_CHECKPOINT_SHADOW_V1',maxEvents:320,leads:[150000,210000]}
};
function verifiedJournal(obj,kind){
 const spec=SPECS[kind];
 if(!spec||!obj||obj.version!==spec.version||obj.format!==spec.format||
   !Array.isArray(obj.events)||obj.events.length>spec.maxEvents||
   obj.headHash===undefined||
   obj.events.some(e=>!e||typeof e!=='object')||
   (kind==='early'&&(obj.qualifiedCount!==0||
     obj.independentlyTimeAttested!==false||
     obj.tradingAuthorized!==false||obj.automatedOrdersEnabled!==false))||
   (kind==='late'&&(obj.independentQualification!==0||
     obj.independentlyTimeAttested!==false||
     obj.realMoneyAuthorized!==false||obj.canExecuteOrders!==false)))
  throw Error('Untrusted or inconsistent '+kind+' public journal');
 let prev='GENESIS',forecasts=0,outcomes=0;
 const seen=new Set(),accepted=[];
 for(const [i,e] of obj.events.entries()){
  if(e.sequence!==i+1||e.previousHash!==prev||
   !['FORECAST','OUTCOME'].includes(e.type)||
   typeof e.hash!=='string'||!/^[a-f0-9]{64}$/.test(e.hash))
   throw Error('Malformed journal chain');
  const {hash,...body}=e;
  if(SHA(body)!==hash)throw Error('Journal checksum mismatch');
  if(e.type==='FORECAST'){
   forecasts++;
   const p=e.payload;
   if(!p||p.model!==spec.model||!VALID_ID.test(p.marketId)||
    !['YES','NO',null].includes(p.side)||seen.has(p.marketId)||
    typeof p.at!=='string'||typeof p.endTime!=='string')
    throw Error('Malformed forecast commitment');
   seen.add(p.marketId);
   accepted.push({e,p});
  }else{
   outcomes++;
   if(!seen.has(e.payload?.marketId))throw Error('Orphaned settlement event');
  }
  prev=e.hash;
 }
 if(prev!==obj.headHash||forecasts!==obj.records||
   outcomes+obj.pending!==obj.records)
  throw Error('Journal summary count mismatch');
 return accepted;
}
function observeJournal(obj,kind,observedMs){
 const eligible=verifiedJournal(obj,kind);
 const spec=SPECS[kind];
 const observed=[];
 for(const {e,p} of eligible){
  const when=Date.parse(p.at),expiry=Date.parse(p.endTime),written=Date.parse(e.recordedAt);
  if(!Number.isFinite(when)||!Number.isFinite(written)||!Number.isFinite(expiry))continue;
  const lead=expiry-when;
  if(lead<spec.leads[0]||lead>spec.leads[1])continue;
  // The independent RUNNER's UTC clock must observe the event *before*
  // contract expiry. Allow 15s of grace against slow runner/network fetches.
  if(when>observedMs||written>observedMs||
   expiry-observedMs<=15000||
   Math.abs(when-written)>5000)continue;
  const source=kind==='early'?p.indexSourceType:p.indexSourceType;
  // Licensed BRTI payload is not publicly independently auditable; skip.
  if(source!=='SINGLE_EXCHANGE_PROXY')continue;
  observed.push({
   model:spec.model,marketId:p.marketId,
   frozenSide:p.side===null?'WAIT':p.side,
   frozenAt:p.at,contractClosesAt:p.endTime,
   journalSequence:e.sequence,
   frozenEventHash:e.hash,
   headHashSeen:obj.headHash,
   publicProxyOnly:true
  });
 }
 return observed.slice(-3);
}
function buildObservation({early,late,observedAt,runId,repository,commitSha}){
 const observedMs=Date.parse(observedAt);
 if(!Number.isFinite(observedMs))throw Error('Observer clock unavailable');
 const evidence=[];
 const unavailable=[];
 for(const [kind,snapshot] of Object.entries({early,late})){
  try{
   if(!snapshot){unavailable.push(kind);continue}
   evidence.push(...observeJournal(snapshot,kind,observedMs));
  }catch{
   unavailable.push(kind);
  }
 }
 return {
  version:'CASH_OFFSERVER_OBSERVATION_V1',
  observationClass:'GITHUB_RUNNER_UTC_CLOCK_PROVISIONAL',
  observedAtRunner:observedAt,
  githubRunId:String(runId||'UNKNOWN'),
  githubRepo:repository||'UNKNOWN',
  githubCommitSha:commitSha||'UNKNOWN',
  frozenEvidence:evidence,
  sourcesUnavailableOrInvalid:unavailable,
  claimedIndependentlyQualifiedCount:0,
  realOrdersEnabled:false,calibrated:false,
  evidenceWitnessedBeforeExpiry:evidence.length,
  note:'External read-only observation at the GitHub runner clock. The workflow run and published artifact can later be checked against GitHub-controlled job timestamps. A hash/runner clock is not a cryptographic independent timestamp, proof against fabricated server histories, a calibrated edge, proof of execution, or an independently qualified accuracy score.'
 };
}
async function fetchPublic(url,fetchImpl=fetch){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
 try{
  const resp=await fetchImpl(url,{signal:ctrl.signal,headers:{
   Accept:'application/json','User-Agent':'CASH-public-preexpiry-observer/1.0'}});
  if(!resp.ok)throw Error('Public journal unavailable');
  const body=await resp.text();
  if(Buffer.byteLength(body)>2500000)throw Error('Public journal too large');
  return JSON.parse(body);
 }finally{clearTimeout(timer)}
}
async function runObserver({
 fetchImpl=fetch,clock=()=>Date.now(),outDirectory='witness',
 env=process.env
}={}){
 const [early,late]=await Promise.all([
  fetchPublic(BASE+'/api/prospective/export',fetchImpl).catch(()=>null),
  fetchPublic(BASE+'/api/late-checkpoint/export',fetchImpl).catch(()=>null)
 ]);
 const observedAt=new Date(clock()).toISOString();
 const result=buildObservation({early,late,observedAt,
  runId:env.GITHUB_RUN_ID,repository:env.GITHUB_REPOSITORY,commitSha:env.GITHUB_SHA});
 console.log('CASH_OBSERVER_SEEN_PREEXPIRY='+result.frozenEvidence.length);
 console.log('CASH_OBSERVER_SOURCE_ERRORS='+result.sourcesUnavailableOrInvalid.length);
 console.log('CASH_OBSERVER_INDEPENDENTLY_QUALIFIED=0');
 if(result.frozenEvidence.length){
  fs.mkdirSync(outDirectory,{recursive:true});
  fs.writeFileSync(path.join(outDirectory,'public-preexpiry-observation.json'),
   JSON.stringify(result,null,2)+'\n',{mode:0o600});
 }
 return result;
}
if(require.main===module)
 runObserver().catch(()=>{
  console.error('CASH observer: no verifiable public pre-expiry evidence; no order or certification');
  process.exitCode=1;
 });
module.exports={verifiedJournal,observeJournal,buildObservation,runObserver};
