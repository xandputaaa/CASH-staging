'use strict';
/*
 * Inspect ONLY externally archived GitHub-runner pre-expiry observations.
 * Repeated observations of the same unchanged commitment are ONE contract.
 * Neither forecast source-time nor an observed WAIT is a scored prediction.
 *
 * This reads the separate witness branch, never writes a forecast, outcome,
 * model threshold or trade. Missing/unsafe archive files fail closed.
 */
const fs=require('node:fs'),path=require('node:path');
const VERSION='CASH_SHADOW_WITNESS_COVERAGE_V1';
const SOURCE='https://cash-simulation-web-staging.up.railway.app/api/model-lab/shadow/export';
const RUN=/^[0-9]{8,16}$/,SHA=/^[a-f0-9]{64}$/,COMMIT=/^[a-f0-9]{40}$/;
const MARKET=/^KXBTC15M-[A-Za-z0-9-]{6,70}$/;
const MODEL='CASH_SHADOW_SPOT_MOMENTUM_V1';
const EXACT_TOP=[
 'version','provenance','sourceUrl','sourceSha256','githubRunId',
 'githubRepository','githubCommitSha','observedAtRunner','status',
 'observedForecasts','observedBeforeExpiryCount','independentlyQualifiedCount',
 'realMoneyOrdersAllowed','note'
];
const EXACT_ENTRY=[
 'modelId','marketId','side','frozenEventHash','observedAtRunnerMs',
 'forecastAsOfMs','contractClosesAtMs','source','independentQualification'
];
function exactKeys(value,expected){
 if(!value||typeof value!=='object'||Array.isArray(value)||
   Object.keys(value).length!==expected.length||
   expected.some(key=>!Object.hasOwn(value,key)))
  throw Error('Unsafe shadow witness schema');
}
function verifyRecord(doc,run){
 exactKeys(doc,EXACT_TOP);
 if(doc.version!=='CASH_SHADOW_GITHUB_PUBLIC_OBSERVATION_V1'||
   doc.provenance!=='GITHUB_RUNNER_FETCH_AFTER_NETWORK_RESPONSE'||
   doc.sourceUrl!==SOURCE||!SHA.test(doc.sourceSha256)||
   !RUN.test(doc.githubRunId)||doc.githubRunId!==run||
   doc.githubRepository!=='xandputaaa/CASH-staging'||
   !COMMIT.test(doc.githubCommitSha)||
   !Number.isFinite(Date.parse(doc.observedAtRunner))||
   new Date(doc.observedAtRunner).toISOString()!==doc.observedAtRunner||
   doc.status!=='OBSERVED_PREEXPIRY'||
   !Array.isArray(doc.observedForecasts)||
   doc.observedForecasts.length<1||doc.observedForecasts.length>1500||
   doc.observedBeforeExpiryCount!==doc.observedForecasts.length||
   doc.independentlyQualifiedCount!==0||doc.realMoneyOrdersAllowed!==false||
   typeof doc.note!=='string'||doc.note.length>600)
  throw Error('Invalid public GitHub witness envelope');
 const time=Date.parse(doc.observedAtRunner),ids=new Set();
 for(const item of doc.observedForecasts){
  exactKeys(item,EXACT_ENTRY);
  if(item.modelId!==MODEL||!MARKET.test(item.marketId)||
    ids.has(item.marketId)||!['YES','NO','WAIT'].includes(item.side)||
    !SHA.test(item.frozenEventHash)||
    !Number.isSafeInteger(item.observedAtRunnerMs)||
    item.observedAtRunnerMs!==time||
    !Number.isSafeInteger(item.forecastAsOfMs)||
    !Number.isSafeInteger(item.contractClosesAtMs)||
    item.forecastAsOfMs>time||
    item.contractClosesAtMs-item.forecastAsOfMs<90000||
    item.contractClosesAtMs-item.forecastAsOfMs>780000||
    item.contractClosesAtMs-time<=15000||
    item.source!=='UNVERIFIED_PUBLIC_SHADOW_JOURNAL'||
    item.independentQualification!==false)
   throw Error('Invalid or late pre-expiry shadow witness');
  ids.add(item.marketId);
 }
 return true;
}
function inspectShadowWitnessArchive(root,{maxFiles=20000,includeContracts=false}={}){
 if(typeof includeContracts!=='boolean')throw Error('Invalid contract output flag');
 const dir=path.join(path.resolve(root),'public-shadow-witness');
 if(!Number.isInteger(maxFiles)||maxFiles<1||maxFiles>20000)
  throw Error('Invalid witness archive bound');
 if(!fs.existsSync(dir))return Object.freeze({
  version:VERSION,status:'EMPTY_WITNESS_ARCHIVE',
  archivedRunFiles:0,totalObservedEntries:0,uniqueContracts:0,
  uniqueDirectional:0,uniqueAbstentions:0,repeatedObservations:0,
  YES:0,NO:0,WAIT:0,independentlyQualifiedCount:0,
  scoredDirectionalOutcomes:0,realMoneyOrdersAllowed:false,
  latestUnique:[],...(includeContracts?{contracts:[]}: {})
 });
 const ds=fs.lstatSync(dir);
 if(!ds.isDirectory()||ds.isSymbolicLink())throw Error('Unsafe witness directory');
 const files=fs.readdirSync(dir).sort();
 if(files.length>maxFiles)throw Error('Witness archive inspection capacity exceeded');
 const markets=new Map();
 let total=0;
 for(const filename of files){
  if(!/^[0-9]{8,16}[.]json$/.test(filename))
   throw Error('Unexpected file in witness archive');
  const file=path.join(dir,filename),st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||st.size<100||st.size>2500000)
   throw Error('Unsafe witness file');
  const doc=JSON.parse(fs.readFileSync(file,'utf8'));
  const run=filename.slice(0,-5);
  verifyRecord(doc,run);
  for(const entry of doc.observedForecasts){
   total++;
   const prior=markets.get(entry.marketId);
   if(prior){
    if(prior.frozenEventHash!==entry.frozenEventHash||
      prior.side!==entry.side||prior.modelId!==entry.modelId||
      prior.forecastAsOfMs!==entry.forecastAsOfMs||
      prior.contractClosesAtMs!==entry.contractClosesAtMs)
     throw Error('Conflicting immutable forecast across independently archived runs');
    if(entry.observedAtRunnerMs<prior.firstObservedAtRunnerMs){
     prior.firstObservedAtRunnerMs=entry.observedAtRunnerMs;
     prior.firstWitnessRunId=run;
    }
    prior.observationCount++;
   }else markets.set(entry.marketId,{
    modelId:entry.modelId,marketId:entry.marketId,side:entry.side,
    frozenEventHash:entry.frozenEventHash,
    forecastAsOfMs:entry.forecastAsOfMs,
    contractClosesAtMs:entry.contractClosesAtMs,
    firstObservedAtRunnerMs:entry.observedAtRunnerMs,
    firstWitnessRunId:run,observationCount:1
   });
  }
 }
 const items=[...markets.values()].sort((a,b)=>
  a.firstObservedAtRunnerMs-b.firstObservedAtRunnerMs);
 const counts={YES:0,NO:0,WAIT:0};
 for(const item of items)counts[item.side]++;
 return Object.freeze({
  version:VERSION,status:items.length?'WITNESSED_SOURCE_CLAIMS':'EMPTY_WITNESS_ARCHIVE',
  archivedRunFiles:files.length,totalObservedEntries:total,
  uniqueContracts:items.length,
  uniqueDirectional:counts.YES+counts.NO,
  uniqueAbstentions:counts.WAIT,
  repeatedObservations:total-items.length,
  ...counts,
  independentlyQualifiedCount:0,scoredDirectionalOutcomes:0,
  realMoneyOrdersAllowed:false,
  latestUnique:items.slice(-10).reverse(),
  ...(includeContracts?{contracts:items}: {}),
  warning:'Independent GitHub observation of public source claims only. Duplicate runs are not new markets. WAIT is not a directional forecast. No official BRTI settlement verification, calibrated predictive accuracy, or trading authorization.'
 });
}
if(require.main===module){
 const root=process.argv[2];
 if(!root)throw Error('Usage: node cash-shadow-witness-coverage.js WITNESS_ARCHIVE_ROOT');
 const x=inspectShadowWitnessArchive(root);
 console.log('CASH_SHADOW_WITNESS_ARCHIVE_STATUS='+x.status);
 console.log('CASH_SHADOW_WITNESS_UNIQUE_CONTRACTS='+x.uniqueContracts);
 console.log('CASH_SHADOW_WITNESS_DIRECTIONAL='+x.uniqueDirectional);
 console.log('CASH_SHADOW_WITNESS_WAITS='+x.uniqueAbstentions);
 console.log('CASH_SHADOW_WITNESS_REPEATED_OBSERVATIONS='+x.repeatedObservations);
 console.log('CASH_SHADOW_WITNESS_INDEPENDENTLY_QUALIFIED=0');
 console.log('CASH_SHADOW_WITNESS_SCORABLE_DIRECTIONAL=0');
 console.log('CASH_SHADOW_WITNESS_ORDERS_ALLOWED=false');
}
module.exports={inspectShadowWitnessArchive,verifyRecord,VERSION};
