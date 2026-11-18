'use strict';
/*
 * Read-only structural audit of the dedicated CASH PUBLIC witness ledger.
 * A validator of archive SCHEMA and monotonic provenance, NOT evidence
 * that the source model was honest or that contracts were tradeable.
 *
 * Run before and after the privileged GitHub ledger archiver, using only
 * trusted default-branch code. Refuse symlinks, unknown/secret fields,
 * inconsistent timestamps, changed frozen identities and payout claims.
 */
const fs=require('node:fs'),path=require('node:path');
const MARKETS=/^KXBTC15M-[A-Za-z0-9-]{6,70}$/;
const RUN=/^\d{8,16}$/,HASH=/^[a-f0-9]{64}$/,COMMIT=/^[a-f0-9]{40}$/;
const MODEL={
 'KXBTC15M_SETTLEMENT_EARLY_V3':'early-v3',
 'KXBTC15M_LATE_CHECKPOINT_SHADOW_V1':'late-v1'
};
const SIDES=new Set(['YES','NO','WAIT']);
const FINALS=new Set([
 'DIRECT_FINAL_TWO_READ_JOURNAL_HASH_MATCH',
 'DIRECT_FINAL_TWO_READ_NUMERIC_MATCH_FIELDS_DIFFER'
]);
function exactKeys(obj,expected,label){
 if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error(label+' object missing');
 const seen=Object.keys(obj).sort(),wanted=expected.slice().sort();
 if(JSON.stringify(seen)!==JSON.stringify(wanted))
  throw Error('Unexpected or missing '+label+' fields');
}
function isoMs(x){
 if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(x))return NaN;
 const n=Date.parse(x);
 return Number.isFinite(n)&&new Date(n).toISOString()===x?n:NaN;
}
function inspectEntry(obj,{date,market,kind}){
 exactKeys(obj,['version','prediction','observations','firstReconciliation',
  'directlyRecheckedFinal','conditionalPaper','independentQualification',
  'ordersEnabled','provenanceLimitations'],'entry');
 if(obj.version!=='CASH_PUBLIC_GITHUB_WITNESS_LEDGER_V1'||
    obj.independentQualification!==0||obj.ordersEnabled!==false)
  throw Error('Ledger attempted to enable trading or certification');
 if(typeof obj.provenanceLimitations!=='string'||
   obj.provenanceLimitations.length<70||obj.provenanceLimitations.length>1300||
   !obj.provenanceLimitations.includes('not exchange-signed'))
  throw Error('No explicit provenance limitations');
 const p=obj.prediction;
 exactKeys(p,['model','marketId','side','contractClosesAt','frozenEventSha256'],'prediction');
 const closes=isoMs(p.contractClosesAt);
 if(!MODEL[p.model]||MODEL[p.model]!==kind||
    !MARKETS.test(p.marketId||'')||p.marketId!==market||
    !SIDES.has(p.side)||!HASH.test(p.frozenEventSha256||'')||
    !Number.isFinite(closes)||
    new Date(closes).toISOString().slice(0,10)!==date)
  throw Error('Frozen forecast identity, close time or file path mismatch');
 if(!Array.isArray(obj.observations)||!obj.observations.length||
   obj.observations.length>64)
  throw Error('No bounded original GitHub observations');
 let previous=-Infinity;const seen=new Set();
 for(const x of obj.observations){
  exactKeys(x,['githubObserverRunId','githubObserverHeadSha',
   'observedAtRunner','githubRunCreatedAt','githubRunEvent',
   'directKalshiActiveMarketCorroborated'],'observation');
  const observed=isoMs(x.observedAtRunner),started=isoMs(x.githubRunCreatedAt);
  if(!RUN.test(x.githubObserverRunId||'')||
     !COMMIT.test(x.githubObserverHeadSha||'')||
     x.githubRunEvent!=='schedule'||
     typeof x.directKalshiActiveMarketCorroborated!=='boolean'||
     !Number.isFinite(observed)||!Number.isFinite(started)||
     started>observed+5000||closes-observed<=15000||
     observed<previous||seen.has(x.githubObserverRunId))
    throw Error('Invalid scheduled pre-expiry observation');
  seen.add(x.githubObserverRunId);previous=observed;
 }
 const origin=obj.firstReconciliation;
 exactKeys(origin,['githubRunId','headSha','reportSha256'],'first reconciliation');
 if(!RUN.test(origin.githubRunId||'')||
    !COMMIT.test(origin.headSha||'')||
    !HASH.test(origin.reportSha256||''))
  throw Error('Missing original source reconciliation commitment');
 const final=obj.directlyRecheckedFinal;
 if(final!==null){
  exactKeys(final,['winner','directKalshiTwoReadStatus',
   'officialPublicFieldsSha256','cashJournalPublicFieldsSha256',
   'directReadSeparationMs','provenanceReconciliationGitHubRunId'],
  'direct public final');
  if(p.side==='WAIT'||!SIDES.has(final.winner)||final.winner==='WAIT'||
    !FINALS.has(final.directKalshiTwoReadStatus)||
    !HASH.test(final.officialPublicFieldsSha256||'')||
    !HASH.test(final.cashJournalPublicFieldsSha256||'')||
    !Number.isFinite(final.directReadSeparationMs)||
    final.directReadSeparationMs<20000||
    !RUN.test(final.provenanceReconciliationGitHubRunId||''))
   throw Error('Unsupported direct Kalshi final result');
 }
 const paper=obj.conditionalPaper;
 if(paper!==null){
  exactKeys(paper,['observedPublicAskAtOriginalFreeze',
   'assumedNetOneContractUSDRoundedCentiCentFee',
   'assumedNetOneContractUSDConservativeCentFee',
   'actualFillConfirmed','actualProfitVerified'],'hypothetical purchase');
  if(final===null||p.side==='WAIT'||
   paper.actualFillConfirmed!==false||paper.actualProfitVerified!==false||
   !Number.isFinite(paper.observedPublicAskAtOriginalFreeze)||
   paper.observedPublicAskAtOriginalFreeze<0||paper.observedPublicAskAtOriginalFreeze>1||
   !Number.isFinite(paper.assumedNetOneContractUSDRoundedCentiCentFee)||
   !Number.isFinite(paper.assumedNetOneContractUSDConservativeCentFee)||
   paper.assumedNetOneContractUSDConservativeCentFee>
    paper.assumedNetOneContractUSDRoundedCentiCentFee)
   throw Error('Invalid conditional unfilled paper economics');
 }
 return {model:kind,side:p.side,
  finalChecked:final!==null,paperPriced:paper!==null,
  winner:final?.winner||null,
  conservativeNet:paper?.assumedNetOneContractUSDConservativeCentFee??null};
}
function scanPublicLedger(root,{maxFiles=10000}={}){
 if(!Number.isInteger(maxFiles)||maxFiles<1||maxFiles>20000)
  throw Error('Invalid maximum ledger scan');
 const start=path.resolve(root),folder=path.join(start,'public-evidence');
 const result={
  version:'CASH_PUBLIC_GIT_LEDGER_STRUCTURE_CHECK_V1',
  fileCount:0,scheduledWitnesses:0,earlyCount:0,lateCount:0,
  waitCount:0,directionalCount:0,directFinalCount:0,
  directionalFinalHits:0,directionalFinalMisses:0,
  conditionalPaperPriced:0,
  correctButNonpositiveConservativePaper:0,
  independentlyQualifiedCount:0,ordersEnabled:false,
  archiveCompletenessGuaranteed:false,
  note:'Structural checks only. Git branch may be rewritten by authorized writers; source forecast and public benchmark inputs are not independently audited. Empty branch means no successful scheduled evidence archival, not zero model forecasts.'
 };
 if(!fs.existsSync(folder))return result;
 const visit=(dir,segments)=>{
  if(fs.lstatSync(dir).isSymbolicLink())throw Error('Untrusted ledger symlink');
  if(!fs.lstatSync(dir).isDirectory())throw Error('Ledger path is not a directory');
  for(const name of fs.readdirSync(dir).sort()){
   if(!/^[A-Za-z0-9._-]{1,90}$/.test(name)||name==='..'||name==='.')
    throw Error('Unsafe ledger path component');
   const next=path.join(dir,name),meta=fs.lstatSync(next);
   if(meta.isSymbolicLink())throw Error('Untrusted ledger symlink');
   if(meta.isDirectory()){
    if(segments.length>=3)throw Error('Unexpected nested ledger directory');
    visit(next,[...segments,name]);continue;
   }
   if(!meta.isFile()||segments.length!==3||
      !/^(early-v3|late-v1)\.json$/.test(name)||
      !/^\d{4}-\d{2}-\d{2}$/.test(segments[0])||
      !MARKETS.test(segments[1])||
      meta.size>32768||meta.size<50)
    throw Error('Unexpected public ledger file or size');
   if(++result.fileCount>maxFiles)throw Error('Ledger scan file safety limit');
   const item=inspectEntry(JSON.parse(fs.readFileSync(next,'utf8')),{
    date:segments[0],market:segments[1],kind:name.slice(0,-5)
   });
   result.scheduledWitnesses++;
   if(item.model==='early-v3')result.earlyCount++;else result.lateCount++;
   if(item.side==='WAIT')result.waitCount++;else result.directionalCount++;
   if(item.finalChecked){
    result.directFinalCount++;
    if(item.winner===item.side)result.directionalFinalHits++;
    else result.directionalFinalMisses++;
   }
   if(item.paperPriced){
    result.conditionalPaperPriced++;
    if(item.winner===item.side&&item.conservativeNet<=0)
     result.correctButNonpositiveConservativePaper++;
   }
  }
 };
 visit(folder,[]);
 if(result.waitCount+result.directionalCount!==result.fileCount||
    result.directionalFinalHits+result.directionalFinalMisses!==result.directFinalCount)
  throw Error('Public ledger integrity counters inconsistent');
 return result;
}
if(require.main===module){
 const root=process.argv[2];
 if(!root)throw Error('Usage: node public-ledger-inspection.js LEDGER_ROOT');
 const result=scanPublicLedger(root);
 console.log('CASH_LEDGER_INSPECT_FILES='+result.fileCount);
 console.log('CASH_LEDGER_INSPECT_FINAL_DIRECTIONAL='+result.directFinalCount);
 console.log('CASH_LEDGER_INSPECT_DIRECTIONAL_HITS='+result.directionalFinalHits);
 console.log('CASH_LEDGER_INSPECT_DIRECTIONAL_MISSES='+result.directionalFinalMisses);
 console.log('CASH_LEDGER_INSPECT_NONPOSITIVE_PAPER_WINS='+
  result.correctButNonpositiveConservativePaper);
 console.log('CASH_LEDGER_INSPECT_INDEPENDENTLY_QUALIFIED=0');
}
module.exports={inspectEntry,scanPublicLedger};
