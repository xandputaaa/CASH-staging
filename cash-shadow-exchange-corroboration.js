'use strict';
/*
 * GitHub-runner-only direct Kalshi public market cross-check AFTER a trusted
 * observer has already obtained a source commitment BEFORE contract expiry.
 *
 * This corroborates published market identity, close, rule and strike with
 * a distinct public Kalshi GET, time-stamped AFTER receipt on GitHub runner.
 * It does NOT prove source-side inference time, the CF BRTI calculation,
 * calibration, independent settlement qualification, executable quotes,
 * Kalshi private account state, orders, or trading profit.
 */
const fs=require('node:fs');
const path=require('node:path');
const {verifyRecord}=require('./cash-shadow-witness-coverage');
const {verifyShadowJournal}=require('./cash-shadow-journal');
const {getPublicSnapshot,URL}=require('./cash-shadow-public-observer-runner');
const {fetchExchangeMarket,checkExchangeMarket}=require('./exchange-preexpiry-check');
const VERSION='CASH_SHADOW_GITHUB_PUBLIC_EXCHANGE_CHECK_V1';
const MAX_PUBLIC_MARKETS=12;
const SHA=/^[a-f0-9]{64}$/;
const STATES=new Set([
 'MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET',
 'EXCHANGE_NOT_CORROBORATED','INVALID_PUBLIC_FORECAST_FIELDS',
 'EXCHANGE_MARKET_UNAVAILABLE','EXCHANGE_MARKET_ID_OR_EXPIRY_MISMATCH',
 'EXCHANGE_READ_TOO_LATE','EXCHANGE_NOT_UNSETTLED_ACTIVE_MARKET',
 'EXCHANGE_STRIKE_OR_RULE_MISMATCH',
 'SOURCE_COMMITMENT_NOT_FOUND','SOURCE_JOURNAL_UNAVAILABLE',
 'MAX_PUBLIC_MARKETS_NOT_CHECKED'
]);
const readTime=v=>Date.parse(v);
function baseResult(obs){
 return {
  version:VERSION,githubRunId:obs.githubRunId,
  originalWitnessSourceSha256:obs.sourceSha256,
  originalWitnessObservedAtRunner:obs.observedAtRunner,
  sourceJournalSecondFetchSha256:null,
  status:'NO_ELIGIBLE_PREEXPIRY_RECORDS',
  marketChecksAttempted:0,
  preExpiryPublicExchangeMatches:0,
  comparisonRecords:[],
  independentQualificationCount:0,
  sourceClockIndependentlyAttested:false,
  publishedKalshiBRTIIndependentlyReplicated:false,
  fillsVerified:false,ordersEnabled:false,
  note:'Two distinct public systems (CASH source + Kalshi public GET) are compared by GitHub after the source claim is observed. The exchange GET is after the source forecast was frozen, not a verified observation at forecast time. This is neither a certified independent BRTI settlement oracle nor calibrated predictive evidence.'
 };
}
function validateExchangeCheck(result,observation){
 if(!result||result.version!==VERSION||!observation||
  result.githubRunId!==observation.githubRunId||
  result.originalWitnessSourceSha256!==observation.sourceSha256||
  result.originalWitnessObservedAtRunner!==observation.observedAtRunner||
  !Array.isArray(result.comparisonRecords)||
  result.comparisonRecords.length!==observation.observedForecasts.length||
  result.independentQualificationCount!==0||
  result.sourceClockIndependentlyAttested!==false||
  result.publishedKalshiBRTIIndependentlyReplicated!==false||
  result.fillsVerified!==false||result.ordersEnabled!==false||
  !Number.isInteger(result.marketChecksAttempted)||
  !Number.isInteger(result.preExpiryPublicExchangeMatches)||
  result.preExpiryPublicExchangeMatches>result.marketChecksAttempted||
  result.marketChecksAttempted>MAX_PUBLIC_MARKETS||
  result.marketChecksAttempted>result.comparisonRecords.length||
  (result.sourceJournalSecondFetchSha256!==null&&
   !SHA.test(result.sourceJournalSecondFetchSha256)))
  throw Error('Invalid independent-exchange shadow audit envelope');
 for(let i=0;i<observation.observedForecasts.length;i++){
  const e=observation.observedForecasts[i],r=result.comparisonRecords[i];
  if(!r||r.marketId!==e.marketId||r.side!==e.side||
   r.frozenEventHash!==e.frozenEventHash||
   r.contractClosesAtMs!==e.contractClosesAtMs||
   !STATES.has(r.state)||r.independentQualification!==false||
   typeof r.checkedAtRunner!=='object'&&r.checkedAtRunner!==null&&
    typeof r.checkedAtRunner!=='string'||
   r.state==='MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET'&&
    (!SHA.test(r.publicFieldsSha256||'')||
     !Number.isSafeInteger(r.publicStrikeCents)||
     r.publicStrikeCents<100000||
     r.rule!=='greater_or_equal'||
     !Number.isFinite(readTime(r.checkedAtRunner))||
     readTime(r.checkedAtRunner)<=readTime(observation.observedAtRunner)||
     r.contractClosesAtMs-readTime(r.checkedAtRunner)<=15000))
   throw Error('Invalid or non-prospective exchange observation');
 }
 const matches=result.comparisonRecords.filter(r=>
  r.state==='MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET').length;
 if(result.preExpiryPublicExchangeMatches!==matches)
  throw Error('Exchange matches tally invalid');
 return true;
}
async function checkObservedMarkets(observation,snapshot,{
 fetchImpl=fetch,clock=()=>Date.now(),maxMarkets=MAX_PUBLIC_MARKETS
}={}){
 if(!Number.isInteger(maxMarkets)||maxMarkets<1||
   maxMarkets>MAX_PUBLIC_MARKETS)throw Error('Exchange market check bound invalid');
 const result=baseResult(observation);
 if(observation.status!=='OBSERVED_PREEXPIRY'){
  if(observation.observedBeforeExpiryCount!==0||
     observation.observedForecasts.length!==0)
   throw Error('Inconsistent zero-witness public observation');
  return result;
 }
 verifyRecord(observation,observation.githubRunId);
 if(snapshot){
  verifyShadowJournal(snapshot);
  const frozen=new Map(snapshot.events.map(e=>[e.hash,e]));
  for(const e of observation.observedForecasts){
   const src=frozen.get(e.frozenEventHash);
   if(!src||src.marketId!==e.marketId||src.side!==e.side||
      src.asOfMs!==e.forecastAsOfMs||
      src.closesAtMs!==e.contractClosesAtMs)
    throw Error('Witness commitment missing from second validated journal');
  }
 }
 result.status=snapshot?'PUBLIC_MARKETS_CHECKED':'SOURCE_JOURNAL_UNAVAILABLE';
 const checked=observation.observedForecasts.slice(0,maxMarkets);
 const frozen=snapshot?new Map(snapshot.events.map(e=>[e.hash,e])):new Map();
 for(const [i,e] of observation.observedForecasts.entries()){
  const base={
   marketId:e.marketId,side:e.side,frozenEventHash:e.frozenEventHash,
   contractClosesAtMs:e.contractClosesAtMs,
   checkedAtRunner:null,state:'SOURCE_JOURNAL_UNAVAILABLE',
   publicFieldsSha256:null,publicStrikeCents:null,rule:null,
   independentQualification:false
  };
  if(!snapshot){result.comparisonRecords.push(base);continue}
  if(i>=maxMarkets){
   result.comparisonRecords.push({...base,state:'MAX_PUBLIC_MARKETS_NOT_CHECKED'});
   continue;
  }
  const frozenEvent=frozen.get(e.frozenEventHash);
  let response={market:null,receivedMs:clock()};
  try{response=await fetchExchangeMarket(e.marketId,{fetchImpl,clock})}
  catch{response.receivedMs=clock()}
  result.marketChecksAttempted++;
  const direct=checkExchangeMarket({
   marketId:e.marketId,freezeStrike:frozenEvent.strikePrice,
   closeTime:new Date(e.contractClosesAtMs).toISOString(),
   market:response.market,receivedMs:response.receivedMs
  });
  // Safeguard against negative/retrograde test clock or response timestamp.
  const later=Number.isSafeInteger(response.receivedMs)&&
   response.receivedMs>readTime(observation.observedAtRunner);
  const state=later?direct.state:'EXCHANGE_NOT_CORROBORATED';
  const confirmed=state==='MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET';
  if(confirmed)result.preExpiryPublicExchangeMatches++;
  result.comparisonRecords.push({
   ...base,state,
   checkedAtRunner:Number.isSafeInteger(response.receivedMs)?
    new Date(response.receivedMs).toISOString():null,
   publicFieldsSha256:direct.exchangePublicFieldsSha256||null,
   publicStrikeCents:confirmed?
    Math.round(direct.publicStrikeAtObserver*100):null,
   rule:confirmed?direct.publicStrikeType:null
  });
 }
 validateExchangeCheck(result,observation);
 return result;
}
async function runExchangeObservation({
 observationFile='witness/shadow-public-observation.json',
 outFile='witness/shadow-exchange-check.json',
 fetchImpl=fetch,clock=()=>Date.now()
}={}){
 const observation=JSON.parse(fs.readFileSync(observationFile,'utf8'));
 let snapshot=null,sha=null;
 if(observation.status==='OBSERVED_PREEXPIRY'){
  try{
   const source=await getPublicSnapshot(URL,{fetchImpl});
   snapshot=source.snapshot;sha=source.sha256;
  }catch{/* No source means NO corroboration, not an invented match. */}
 }
 const report=await checkObservedMarkets(observation,snapshot,{fetchImpl,clock});
 report.sourceJournalSecondFetchSha256=sha;
 validateExchangeCheck(report,observation);
 const dest=path.resolve(outFile);
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.writeFileSync(dest,JSON.stringify(report,null,2)+'\n',{
  mode:0o600,flag:'wx'
 });
 console.log('CASH_SHADOW_KALSHI_PREEXPIRY_STATUS='+report.status);
 console.log('CASH_SHADOW_KALSHI_PREEXPIRY_CHECKS='+report.marketChecksAttempted);
 console.log('CASH_SHADOW_KALSHI_PREEXPIRY_MATCHES='+report.preExpiryPublicExchangeMatches);
 console.log('CASH_SHADOW_KALSHI_INDEPENDENT_QUALIFICATION=0');
 console.log('CASH_SHADOW_KALSHI_ORDERS_ENABLED=false');
 return report;
}
if(require.main===module)runExchangeObservation().catch(error=>{
 console.error('CASH shadow public exchange cross-check failed closed: '+
  String(error.message).replace(/[^a-zA-Z0-9:_ -]/g,''));
 process.exitCode=1;
});
module.exports={VERSION,MAX_PUBLIC_MARKETS,validateExchangeCheck,
 checkObservedMarkets,runExchangeObservation};
