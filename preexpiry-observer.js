'use strict';
/*
 * Provisional off-server observer of prospectively frozen, still-open Kalshi
 * KXBTC15M research. GitHub Actions runner fetches the public journals and
 * publishes a narrow event hash plus its OWN observed time. This does not
 * establish trust in the server, model edge, fill prices or trusted timestamps.
 * Do not increment any independent-validation score.
 */
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {augmentObservationWithExchange}=require('./exchange-preexpiry-check');
const {githubRunnerReadHeaders}=require('./cash-runner-read-auth');
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
/*
 * Diagnostic-only, reason-partitioned view of the same VERIFIED public
 * source journal the observer already uses. This never changes what
 * observeJournal accepts, signs or publishes. Counts are aggregated only:
 * no market IDs, prediction sides, prices, timestamps, keys or outcomes.
 */
const ELIGIBILITY_REASONS=Object.freeze([
 'INVALID_FORECAST_CLOCK','OUTSIDE_FROZEN_LEAD_WINDOW',
 'NOT_YET_FROZEN_AT_RUNNER','EXPIRED_OR_WITHIN_15S_CLOSE_GUARD',
 'FROZEN_RECORD_CLOCK_SKEW','NON_PUBLIC_SINGLE_EXCHANGE_SOURCE',
 'ELIGIBLE_PUBLIC_PROXY_PREEXPIRY'
]);
function diagnosePublicEligibility(snapshot,kind,observedMs){
 if(!SPECS[kind]||!Number.isFinite(observedMs))
  throw Error('Invalid eligibility diagnostic model or runner clock');
 const empty=Object.fromEntries(ELIGIBILITY_REASONS.map(k=>[k,0]));
 const unavailable={
  model:SPECS[kind].model,status:'SOURCE_UNAVAILABLE_OR_UNFETCHED',
  forecastCount:null,reasons:null,eligibleBeforeThreeRecordCap:null,
  recordCap:3,independentQualifiedCount:0,ordersEnabled:false
 };
 if(!snapshot)return unavailable;
 let verified;
 try{verified=verifiedJournal(snapshot,kind)}
 catch{return {...unavailable,status:'SOURCE_JOURNAL_INVALID'}}
 const reasons={...empty};
 const [minLead,maxLead]=SPECS[kind].leads;
 for(const {e,p} of verified){
  const frozen=Date.parse(p.at),recorded=Date.parse(e.recordedAt),
   expiry=Date.parse(p.endTime);
  let why;
  if(!Number.isFinite(frozen)||!Number.isFinite(recorded)||
     !Number.isFinite(expiry))
   why='INVALID_FORECAST_CLOCK';
  else if(expiry-frozen<minLead||expiry-frozen>maxLead)
   why='OUTSIDE_FROZEN_LEAD_WINDOW';
  else if(frozen>observedMs||recorded>observedMs)
   why='NOT_YET_FROZEN_AT_RUNNER';
  else if(expiry-observedMs<=15000)
   why='EXPIRED_OR_WITHIN_15S_CLOSE_GUARD';
  else if(Math.abs(frozen-recorded)>5000)
   why='FROZEN_RECORD_CLOCK_SKEW';
  else if(p.indexSourceType!=='SINGLE_EXCHANGE_PROXY')
   why='NON_PUBLIC_SINGLE_EXCHANGE_SOURCE';
  else why='ELIGIBLE_PUBLIC_PROXY_PREEXPIRY';
  reasons[why]++;
 }
 const eligible=reasons.ELIGIBLE_PUBLIC_PROXY_PREEXPIRY;
 return {
  model:SPECS[kind].model,status:'VALID_SELF_HASHED_SOURCE_JOURNAL',
  forecastCount:verified.length,reasons,
  eligibleBeforeThreeRecordCap:eligible,
  retainedEligibleAfterThreeRecordCap:Math.min(3,eligible),
  publicProxyCommitmentsBeyondThreeRecordCap:Math.max(0,eligible-3),
  recordCap:3,independentQualifiedCount:0,ordersEnabled:false
 };
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
  const auth=await githubRunnerReadHeaders();
  const resp=await fetchImpl(url,{signal:ctrl.signal,redirect:'error',headers:{
   Accept:'application/json','User-Agent':'CASH-public-preexpiry-observer/1.0',...auth}});
  if(!resp.ok){
   const kind=resp.status===401?'HTTP_UNAUTHORIZED':
    resp.status===403?'HTTP_FORBIDDEN':
    resp.status===404?'HTTP_NOT_FOUND':'HTTP_OTHER';
   const error=Error('Public journal unavailable');
   error.publicFetchClass=kind;
   throw error;
  }
  const body=await resp.text();
  if(Buffer.byteLength(body)>2500000){
   const error=Error('Public journal too large');
   error.publicFetchClass='BODY_TOO_LARGE';throw error;
  }
  try{return JSON.parse(body)}
  catch{
   const error=Error('Public journal malformed');
   error.publicFetchClass='INVALID_JSON';throw error;
  }
 }finally{clearTimeout(timer)}
}
async function runObserver({
 fetchImpl=fetch,clock=()=>Date.now(),outDirectory='witness',
 env=process.env,onEligibility=null
}={}){
 // Fixed diagnostic categories only: no URL, response body or credential.
 const sourceFailures={};
 async function load(kind,endpoint){
  try{return await fetchPublic(BASE+endpoint,fetchImpl)}
  catch(error){
   sourceFailures[kind]=[
    'HTTP_UNAUTHORIZED','HTTP_FORBIDDEN','HTTP_NOT_FOUND','HTTP_OTHER',
    'BODY_TOO_LARGE','INVALID_JSON'
   ].includes(error?.publicFetchClass)?error.publicFetchClass:
    error?.name==='AbortError'?'TIMEOUT':'TRANSPORT_ERROR';
   return null;
  }
 }
 const [early,late]=await Promise.all([
  load('early','/api/prospective/export'),
  load('late','/api/late-checkpoint/export')
 ]);
 const observedAt=new Date(clock()).toISOString();
 const initial=buildObservation({early,late,observedAt,
  runId:env.GITHUB_RUN_ID,repository:env.GITHUB_REPOSITORY,commitSha:env.GITHUB_SHA});
 // These diagnostics cannot manufacture a witness; the observer envelope,
 // model verdicts, contract selection and journal checks are unchanged.
 const eligibility={};
 for(const [kind,snapshot] of Object.entries({early,late})){
  const aggregate=diagnosePublicEligibility(snapshot,kind,Date.parse(observedAt));
  if(sourceFailures[kind])aggregate.fetchFailureClass=sourceFailures[kind];
  eligibility[kind]=aggregate;
  console.log('CASH_OBSERVER_PUBLIC_ELIGIBILITY_'+kind.toUpperCase()+'='+
   JSON.stringify(aggregate));
 }
 // A local-only callback collects aggregate source-status metrics for the
 // scheduled watcher. Never place this data in a frozen forecast envelope.
 if(onEligibility!==null){
  if(typeof onEligibility!=='function')throw Error('Invalid observer diagnostic collector');
  onEligibility(eligibility);
 }
 // A second, independent read-only network request made DIRECTLY by
 // GitHub to Kalshi. Failure must be reported, not silently considered
 // a verified public strike or proof that a trade could execute.
 const result=await augmentObservationWithExchange(initial,{early,late},{fetchImpl,clock});
 console.log('CASH_OBSERVER_SEEN_PREEXPIRY='+result.frozenEvidence.length);
 console.log('CASH_OBSERVER_DIRECT_EXCHANGE_MATCHES='+result.directExchangeMatches);
 console.log('CASH_OBSERVER_DIRECT_EXCHANGE_UNCONFIRMED='+result.directExchangeMismatchesOrUnavailable);
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
module.exports={verifiedJournal,observeJournal,buildObservation,runObserver,
 diagnosePublicEligibility,ELIGIBILITY_REASONS};
