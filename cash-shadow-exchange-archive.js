'use strict';
/*
 * Interpret paired, externally archived pre-expiry public market corroboration
 * WITHOUT modifying or qualifying the frozen forecast or its final grade.
 * Legacy witness runs without a paired exchange check remain valid but
 * explicitly uncorroborated; retrospective exchange reads NEVER backfill them.
 */
const fs=require('node:fs'),path=require('node:path');
const {inspectShadowWitnessArchive,verifyRecord}=require('./cash-shadow-witness-coverage');
const {validateExchangeCheck,VERSION:EXCHANGE_VERSION}=require('./cash-shadow-exchange-corroboration');
const MATCH='MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET';
const VERSION='CASH_SHADOW_EXCHANGE_WITNESS_JOIN_V1';
const RUN=/^[0-9]{8,16}[.]json$/,SHA=/^[0-9a-f]{64}$/;
const TOP=[
 'version','githubRunId','originalWitnessSourceSha256',
 'originalWitnessObservedAtRunner','sourceJournalSecondFetchSha256',
 'status','marketChecksAttempted','preExpiryPublicExchangeMatches',
 'comparisonRecords','independentQualificationCount',
 'sourceClockIndependentlyAttested','publishedKalshiBRTIIndependentlyReplicated',
 'fillsVerified','ordersEnabled','note'
];
const ENTRY=[
 'marketId','side','frozenEventHash','contractClosesAtMs','checkedAtRunner',
 'state','publicFieldsSha256','publicStrikeCents','rule',
 'independentQualification'
];
function exact(o,keys){
 if(!o||typeof o!=='object'||Array.isArray(o)||
    Object.keys(o).length!==keys.length||
    keys.some(k=>!Object.hasOwn(o,k)))
  throw Error('Invalid public market corroboration schema');
}
function safeJsonFile(file){
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.size<200||st.size>2500000)
  throw Error('Unsafe public market check archive file');
 return JSON.parse(fs.readFileSync(file,'utf8'));
}
function inspectShadowExchangeArchive(root,{maxFiles=20000}={}){
 if(typeof root!=='string'||!root||!Number.isInteger(maxFiles)||
    maxFiles<1||maxFiles>20000)
  throw Error('Invalid public exchange archive input');
 const coverage=inspectShadowWitnessArchive(root,{includeContracts:true});
 const dir=path.join(path.resolve(root),'public-shadow-exchange-checks');
 const map=new Map(coverage.contracts.map(c=>[c.marketId,{
  marketId:c.marketId,side:c.side,frozenEventHash:c.frozenEventHash,
  contractClosesAtMs:c.contractClosesAtMs,
  publishedPublicStrikeCents:null,matchingRuns:0,failedChecks:0,
  firstMatchedAt:null
 }]));
 if(!fs.existsSync(dir))return buildReport(map,coverage,0);
 const ds=fs.lstatSync(dir);
 if(!ds.isDirectory()||ds.isSymbolicLink())
  throw Error('Unsafe exchange archive directory');
 const files=fs.readdirSync(dir).sort();
 if(files.length>maxFiles)throw Error('Exchange archive inspection file cap exceeded');
 const seen=new Set();
 for(const name of files){
  if(!RUN.test(name))throw Error('Unexpected exchange corroboration archive filename');
  const run=name.slice(0,-5);
  if(seen.has(run))throw Error('Duplicate exchange runner ID');
  seen.add(run);
  const witnessFile=path.join(path.resolve(root),'public-shadow-witness',name);
  if(!fs.existsSync(witnessFile))
   throw Error('Exchange market check lacks original pre-expiry witness');
  const witness=safeJsonFile(witnessFile);
  verifyRecord(witness,run);
  const checked=safeJsonFile(path.join(dir,name));
  exact(checked,TOP);
  if(checked.version!==EXCHANGE_VERSION||
     typeof checked.note!=='string'||checked.note.length>1000||
     !['PUBLIC_MARKETS_CHECKED','SOURCE_JOURNAL_UNAVAILABLE',
       'NO_ELIGIBLE_PREEXPIRY_RECORDS'].includes(checked.status))
   throw Error('Unsupported public market corroboration state');
  for(const e of checked.comparisonRecords||[])exact(e,ENTRY);
  validateExchangeCheck(checked,witness);
  if(checked.preExpiryPublicExchangeMatches>0&&
     (checked.status!=='PUBLIC_MARKETS_CHECKED'||
      !SHA.test(checked.sourceJournalSecondFetchSha256||'')))
   throw Error('Public exchange match requires a complete second journal read');
  for(const check of checked.comparisonRecords){
   const row=map.get(check.marketId);
   if(!row||row.side!==check.side||
      row.frozenEventHash!==check.frozenEventHash||
      row.contractClosesAtMs!==check.contractClosesAtMs)
    throw Error('Exchange corroboration mismatches unique frozen source commitment');
   if(check.state===MATCH){
    if(!Number.isSafeInteger(check.publicStrikeCents)||
       check.publicStrikeCents<100000)
     throw Error('Invalid matched public strike');
    if(row.publishedPublicStrikeCents!==null&&
       row.publishedPublicStrikeCents!==check.publicStrikeCents)
     throw Error('Inconsistent direct Kalshi pre-expiry public strikes');
    row.publishedPublicStrikeCents=check.publicStrikeCents;
    row.matchingRuns++;
    const stamp=Date.parse(check.checkedAtRunner);
    if(row.firstMatchedAt===null||stamp<Date.parse(row.firstMatchedAt))
     row.firstMatchedAt=check.checkedAtRunner;
   }else row.failedChecks++;
  }
 }
 return buildReport(map,coverage,files.length);
}
function buildReport(map,coverage,files){
 const contracts=[...map.values()].map(c=>({
  marketId:c.marketId,side:c.side,
  frozenEventHash:c.frozenEventHash,
  contractClosesAtMs:c.contractClosesAtMs,
  state:c.matchingRuns>0?'PREEXPIRY_PUBLIC_MARKET_MATCHED':
   c.failedChecks>0?'PREEXPIRY_PUBLIC_MARKET_NOT_CORROBORATED':
   'NO_PREEXPIRY_PUBLIC_MARKET_CHECK',
  matchedPublicStrikeCents:c.publishedPublicStrikeCents,
  firstMatchedAt:c.firstMatchedAt,
  matchingRunObservations:c.matchingRuns,
  uncorroboratedRunObservations:c.failedChecks,
  independentlyQualified:false
 }));
 const matched=contracts.filter(x=>x.state==='PREEXPIRY_PUBLIC_MARKET_MATCHED');
 return {
  version:VERSION,
  corroborationRunFiles:files,
  witnessedUniqueContracts:coverage.uniqueContracts,
  matchedUniqueContracts:matched.length,
  matchedDirectionalContracts:matched.filter(x=>x.side!=='WAIT').length,
  matchedWaits:matched.filter(x=>x.side==='WAIT').length,
  uncorroboratedUniqueContracts:contracts.length-matched.length,
  independentlyQualifiedCount:0,
  realMoneyOrdersAllowed:false,contracts,
  limitation:'The additional Kalshi public GET happened after the source forecast and before expiry; it checks only public ticker/strike/close/rule, not a certified BRTI settlement, authentic model inference time, calibrated probabilities or actual trade fills.'
 };
}
function joinExchangeEvidenceToSettlement(report,exchange,{sourceSnapshot=null}={}){
 if(!report||!Array.isArray(report.rows)||!exchange||
    exchange.version!==VERSION||!Array.isArray(exchange.contracts)||
    report.witnessedContracts!==exchange.witnessedUniqueContracts)
  throw Error('Public final and pre-expiry exchange archive cannot be joined');
 const rows=new Map(exchange.contracts.map(x=>[x.marketId,x]));
 const frozen=new Map(sourceSnapshot?.events?.map(e=>[e.hash,e])||[]);
 const merged=report.rows.map(r=>{
  const c=rows.get(r.marketId);
  if(!c||c.frozenEventHash!==r.frozenEventHash||
     c.side!==r.side||c.contractClosesAtMs!==r.contractClosesAtMs)
   throw Error('Pre-expiry evidence conflicts with frozen public final row');
  const f=frozen.get(r.frozenEventHash);
  if(f&&c.matchedPublicStrikeCents!==null&&
     Math.round(f.strikePrice*100)!==c.matchedPublicStrikeCents)
   throw Error('Pre-expiry direct exchange strike conflicts with verified source commitment');
  return {...r,
   preExpiryPublicMarketEvidence:c.state,
   preExpiryPublicMarketFirstMatchedAt:c.firstMatchedAt,
   preExpiryPublicMarketCheckRuns:c.matchingRunObservations+
    c.uncorroboratedRunObservations,
   independentPublicIndexProof:false
  };
 });
 const postFinal=merged.filter(r=>r.state==='TWO_READ_PUBLIC_NUMERIC_MATCH');
 const corroboratedFinal=postFinal.filter(r=>
  r.preExpiryPublicMarketEvidence==='PREEXPIRY_PUBLIC_MARKET_MATCHED');
 return {...report,rows:merged,
  preExpiryPublicExchangeCorroboration:{
   source:'PAIRED_GITHUB_PREEXPIRY_PUBLIC_KALSHI_READ_ONLY',
   runFiles:exchange.corroborationRunFiles,
   matchedUniqueContracts:exchange.matchedUniqueContracts,
   matchedDirectionalContracts:exchange.matchedDirectionalContracts,
   matchedWaits:exchange.matchedWaits,
   uncorroboratedUniqueContracts:exchange.uncorroboratedUniqueContracts,
   provisionalDirectionalWithPreExpiryMarketMatch:corroboratedFinal.length,
   provisionalHitsWithPreExpiryMarketMatch:corroboratedFinal.filter(x=>
    x.provisionalOutcome==='HIT').length,
   provisionalMissesWithPreExpiryMarketMatch:corroboratedFinal.filter(x=>
    x.provisionalOutcome==='MISS').length,
   independentlyQualifiedCount:0,realMoneyOrdersAllowed:false,
   warning:'Public exchange field corroboration before expiry and two-read published settlement remain distinct operational checks. Neither independently certifies CF BRTI or profitable prediction accuracy.'
  }
 };
}
module.exports={inspectShadowExchangeArchive,
 joinExchangeEvidenceToSettlement,VERSION};
