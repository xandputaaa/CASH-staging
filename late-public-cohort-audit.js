'use strict';
/*
 * Distinct public-Kalshi contracts across two append-only GitHub evidence
 * branches: original runner-time pre-expiry observations and the separately
 * settled scheduled-only research ledger. Observations and settlements are
 * different evidence; never count two models/runs as separate contracts.
 *
 * Read-only audit. No source-server fetch, new forecasts, trading, private
 * Kalshi feed, licensed BRTI replication or retroactive validation.
 */
const fs=require('node:fs'),path=require('node:path');
const {inspectArchive}=require('./late-observer-archive');
const {scanPublicLedger}=require('./public-ledger-inspection');
const {validObservation}=require('./observed-settlement-reconciler');
const VERSION='CASH_DURABLE_VS_SETTLED_PUBLIC_WITNESS_COHORT_V1';
const REPO='xandputaaa/CASH-staging',ROOT='late-preexpiry-run';
const MODELS=new Set([
 'KXBTC15M_SETTLEMENT_EARLY_V3','KXBTC15M_LATE_CHECKPOINT_SHADOW_V1'
]);
const RUN=/^\d{8,16}$/;
const KEY=/^KXBTC15M-[A-Za-z0-9-]{6,70}$/;
const SHA=/^[a-f0-9]{64}$/;
// Source API close stamps sometimes omit the mathematically zero .000.
// Compare UTC instants, never their serialization; reject non-UTC or
// noncanonical free-form dates to avoid weakening identity checks.
function canonicalCloseUtc(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value))
  throw Error('Invalid UTC contract close timestamp');
 const ms=Date.parse(value);
 if(!Number.isFinite(ms))throw Error('Invalid UTC contract close timestamp');
 const utc=new Date(ms).toISOString();
 if(value!==utc&&value!==utc.replace('.000Z','Z'))
  throw Error('Noncanonical UTC contract close timestamp');
 return utc;
}
function readSafe(p,cap=200000){
 const stat=fs.lstatSync(p);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<10||stat.size>cap)
  throw Error('Unsafe public audit source file');
 return JSON.parse(fs.readFileSync(p,'utf8'));
}
function normalize(row,source){
 const canonicalClose=canonicalCloseUtc(row?.close);
 if(!row||!MODELS.has(row.model)||!KEY.test(row.marketId||'')||
    !['YES','NO','WAIT'].includes(row.side)||
    !SHA.test(row.hash||'')||
    !Number.isFinite(Date.parse(row.close))||
    source!==row.source||
    (source==='durable'&&
      (!Number.isFinite(Date.parse(row.observedAt))||
       !RUN.test(row.githubRunId||'')||
       Date.parse(row.observedAt)>=Date.parse(row.close)||
       (row.frozenAt!==undefined&&
        (typeof row.frozenAt!=='string'||
         !/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$/.test(row.frozenAt)||
         !Number.isFinite(Date.parse(row.frozenAt))||
         (row.frozenAt!==new Date(Date.parse(row.frozenAt)).toISOString()&&
          row.frozenAt!==new Date(Date.parse(row.frozenAt)).toISOString().replace('.000Z','Z'))||
         Date.parse(row.frozenAt)>Date.parse(row.observedAt)||
         Date.parse(row.frozenAt)>=Date.parse(row.close)))))||
    (source==='ledger'&&
      (typeof row.directFinal!=='boolean'||typeof row.paperPriced!=='boolean'||
       (row.side==='WAIT'&&(row.directFinal||row.paperPriced))||
       row.paperPriced&&!row.directFinal||
       (row.directFinal?!['YES','NO'].includes(row.winner):
        row.winner!==null)||
       (row.paperPriced?
        (!Number.isFinite(row.netConservativeUSD)||
         row.netConservativeUSD< -2||row.netConservativeUSD>1):
        row.netConservativeUSD!==null))))
  throw Error('Invalid immutable public cohort identity or evidence class');
 return {...row,close:canonicalClose};
}
function readDurableRows(root){
 const inventory=inspectArchive(root);
 const folder=path.join(path.resolve(root),ROOT),rows=[];
 if(!fs.existsSync(folder))return {inventory,rows};
 for(const id of fs.readdirSync(folder).sort()){
  if(!RUN.test(id))throw Error('Unsafe original-run archive name');
  const dir=path.join(folder,id),manifest=readSafe(path.join(dir,'manifest.json'),12000);
  if(manifest.sourceRunId!==id||
     !Array.isArray(manifest.sourceArtifactFiles))
   throw Error('Mismatched original GitHub run manifest');
  for(const original of manifest.sourceArtifactFiles){
   if(!original.file||
     !(original.file==='public-preexpiry-observation.json'||
       /^probes\/0(?:0[1-9]|1[0-9]|20)\.json$/.test(original.file)))
    continue;
   const obs=readSafe(path.join(dir,original.file));
   validObservation(obs);
   if(obs.githubRunId!==id||obs.githubRepo!==REPO||
      obs.githubCommitSha!==manifest.sourceHeadSha)
    throw Error('Archived pre-expiry probe conflicts with immutable run identity');
   for(const f of obs.frozenEvidence){
    rows.push(normalize({
     source:'durable',model:f.model,marketId:f.marketId,
     hash:f.frozenEventHash,side:f.frozenSide,close:f.contractClosesAt,
     frozenAt:f.frozenAt,
     observedAt:obs.observedAtRunner,githubRunId:id,
     directPublicKalshiMatched:
      f.exchangeAtWitness?.state==='MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET'
    },'durable'));
   }
  }
 }
 return {inventory,rows};
}
function readLegacyRows(root){
 const inventory=scanPublicLedger(root);
 const folder=path.join(path.resolve(root),'public-evidence'),rows=[];
 if(!fs.existsSync(folder))return {inventory,rows};
 for(const date of fs.readdirSync(folder).sort()){
  const sub=path.join(folder,date);
  for(const market of fs.readdirSync(sub).sort()){
   for(const [file,model] of [
    ['early-v3.json','KXBTC15M_SETTLEMENT_EARLY_V3'],
    ['late-v1.json','KXBTC15M_LATE_CHECKPOINT_SHADOW_V1']
   ]){
    const filePath=path.join(sub,market,file);
    if(!fs.existsSync(filePath))continue;
    const r=readSafe(filePath,32768),p=r.prediction;
    if(p.model!==model||p.marketId!==market)
     throw Error('Legacy public ledger market/model name mismatch');
    rows.push(normalize({
     source:'ledger',model,marketId:market,side:p.side,
     hash:p.frozenEventSha256,close:p.contractClosesAt,
     directFinal:r.directlyRecheckedFinal!==null,
     paperPriced:r.conditionalPaper!==null,
     winner:r.directlyRecheckedFinal?.winner||null,
     netConservativeUSD:
      r.conditionalPaper?.assumedNetOneContractUSDConservativeCentFee??null
    },'ledger'));
   }
  }
 }
 if(rows.length!==inventory.fileCount)
  throw Error('Verified legacy public ledger count changed during audit');
 return {inventory,rows};
}
function distinct(rows,source){
 const byModelMarket=new Map();
 for(const raw of rows){
  const x=normalize(raw,source),k=x.model+'::'+x.marketId;
  const before=byModelMarket.get(k);
  if(before){
   if(before.hash!==x.hash||before.side!==x.side||
      before.close!==x.close||
      (source==='durable'&&before.frozenAt!==x.frozenAt))
    throw Error('Conflicting frozen forecast identity within '+source);
   if(source==='durable'){
    if(Date.parse(x.observedAt)<Date.parse(before.observedAt))
     before.observedAt=x.observedAt;
    before.directPublicKalshiMatched=
     before.directPublicKalshiMatched||x.directPublicKalshiMatched;
    before.runIds.add(x.githubRunId);
   }else{
    throw Error('Duplicate model/market entries in legacy settled ledger');
   }
  }else{
   byModelMarket.set(k,{...x,
    ...(source==='durable'?{runIds:new Set([x.githubRunId])}:{})});
  }
 }
 return byModelMarket;
}
function summary(byModelMarket){
 const list=[...byModelMarket.values()];
 const rows={totalModelMarketDecisions:list.length,
  uniqueKalshiContracts:new Set(list.map(x=>x.marketId)).size,
  earlyWait:0,earlyDirectional:0,lateWait:0,lateDirectional:0};
 for(const x of list){
  const kind=x.model==='KXBTC15M_LATE_CHECKPOINT_SHADOW_V1'?'late':'early';
  rows[kind+(x.side==='WAIT'?'Wait':'Directional')]++;
 }
 return rows;
}

/*
 * First captured GitHub-runner witness lead for each DISTINCT model/market,
 * using the earliest original observedAtRunner. Never choose a better/earlier
 * lead from settlement outcomes, duplicate polls, or later corroborations.
 * Model decisions are NOT independent underlying contracts.
 */
function firstWitnessLeadTiming(originalDecisions){
 const bins=()=>({modelMarketDecisions:0,atMost30s:0,
  over30To60s:0,over60To120s:0,over120s:0,
  minimumLeadSeconds:null,medianLeadSeconds:null,
  maximumLeadSeconds:null});
 const out={early:bins(),late:bins()};
 const vals={early:[],late:[]};
 for(const x of originalDecisions.values()){
  const kind=x.model==='KXBTC15M_LATE_CHECKPOINT_SHADOW_V1'?'late':'early';
  const leadMs=Date.parse(x.close)-Date.parse(x.observedAt);
  if(!Number.isSafeInteger(leadMs)||leadMs<=0)
   throw Error('Invalid chronological first-witness pre-expiry lead');
  vals[kind].push(leadMs);
  const b=out[kind];b.modelMarketDecisions++;
  if(leadMs<=30000)b.atMost30s++;
  else if(leadMs<=60000)b.over30To60s++;
  else if(leadMs<=120000)b.over60To120s++;
  else b.over120s++;
 }
 for(const kind of ['early','late']){
  const ms=vals[kind].sort((a,b)=>a-b);
  if(!ms.length)continue;
  const mid=Math.floor(ms.length/2);
  const median=ms.length%2?ms[mid]:(ms[mid-1]+ms[mid])/2;
  out[kind].minimumLeadSeconds=Number((ms[0]/1000).toFixed(3));
  out[kind].medianLeadSeconds=Number((median/1000).toFixed(3));
  out[kind].maximumLeadSeconds=Number((ms.at(-1)/1000).toFixed(3));
  if(out[kind].atMost30s+out[kind].over30To60s+
     out[kind].over60To120s+out[kind].over120s!==ms.length)
   throw Error('Invalid first-witness timing bins');
 }
 return out;
}


/*
 * The source's frozenAt clock is self-reported. Subtract it from the
 * earliest original GitHub observedAtRunner only for a READ-ONLY delay
 * diagnostic; this is NOT independently proven source publication delay.
 * Missing original freeze fields remain unknown (legacy/synthetic inputs).
 */
function claimedFreezeToFirstWitnessDelay(originalDecisions){
 const blank=()=>({
  witnessedModelMarketDecisions:0,withClaimedFreezeTimestamp:0,
  missingClaimedFreezeTimestamp:0,
  atMost5s:0,over5To30s:0,over30To120s:0,over120s:0,
  minimumSeconds:null,medianSeconds:null,maximumSeconds:null
 });
 const out={early:blank(),late:blank()};
 const values={early:[],late:[]};
 for(const x of originalDecisions.values()){
  const kind=x.model==='KXBTC15M_LATE_CHECKPOINT_SHADOW_V1'?'late':'early';
  const b=out[kind];b.witnessedModelMarketDecisions++;
  if(x.frozenAt===undefined){
   b.missingClaimedFreezeTimestamp++;
   continue;
  }
  const ms=Date.parse(x.observedAt)-Date.parse(x.frozenAt);
  if(!Number.isSafeInteger(ms)||ms<0)
   throw Error('Invalid source-claimed freeze-to-first-witness interval');
  b.withClaimedFreezeTimestamp++;
  values[kind].push(ms);
  if(ms<=5000)b.atMost5s++;
  else if(ms<=30000)b.over5To30s++;
  else if(ms<=120000)b.over30To120s++;
  else b.over120s++;
 }
 for(const kind of ['early','late']){
  const b=out[kind],ms=values[kind].sort((a,c)=>a-c);
  if(b.withClaimedFreezeTimestamp+b.missingClaimedFreezeTimestamp!==
      b.witnessedModelMarketDecisions||
     b.atMost5s+b.over5To30s+b.over30To120s+b.over120s!==
      b.withClaimedFreezeTimestamp)
   throw Error('Invalid frozen-to-witness diagnostic denominators');
  if(!ms.length)continue;
  const mid=Math.floor(ms.length/2);
  const med=ms.length%2?ms[mid]:(ms[mid-1]+ms[mid])/2;
  b.minimumSeconds=Number((ms[0]/1000).toFixed(3));
  b.medianSeconds=Number((med/1000).toFixed(3));
  b.maximumSeconds=Number((ms.at(-1)/1000).toFixed(3));
 }
 return out;
}

function compareCohorts({durableRows=[],legacyRows=[],durableRunCount=0,
 legacyFiles=0}={}){
 if(!Number.isSafeInteger(durableRunCount)||durableRunCount<0||
    !Number.isSafeInteger(legacyFiles)||legacyFiles<0)
  throw Error('Invalid original archive or legacy ledger inventory');
 const d=distinct(durableRows,'durable'),l=distinct(legacyRows,'ledger');
 if(legacyFiles!==l.size)
  throw Error('Legacy scheduled ledger count must include every entry');
 const merged=new Map([...d]),overlap={
  identicalFrozenCommitments:0,
  durableOnlyModelMarketDecisions:0,
  scheduledLedgerOnlyModelMarketDecisions:0,
  durableDirectionalWithSeparateScheduledTwoReadFinal:0,
  durableDirectionalAwaitingSeparateFinal:0,
  precloseMarketMatchedAndSeparateFinal:0
 };
 for(const [k,x] of l){
  const other=d.get(k);
  if(other){
   if(other.side!==x.side||other.hash!==x.hash||
      other.close!==x.close)
    throw Error('Pre-expiry GitHub witness conflicts with scheduled settled ledger');
   overlap.identicalFrozenCommitments++;
   if(x.side!=='WAIT'){
    if(x.directFinal){
     overlap.durableDirectionalWithSeparateScheduledTwoReadFinal++;
     if(other.directPublicKalshiMatched)
      overlap.precloseMarketMatchedAndSeparateFinal++;
    }else overlap.durableDirectionalAwaitingSeparateFinal++;
   }
  }else{
   merged.set(k,x);
   overlap.scheduledLedgerOnlyModelMarketDecisions++;
  }
 }
 overlap.durableOnlyModelMarketDecisions=d.size-
  overlap.identicalFrozenCommitments;
 const dur=summary(d),leg=summary(l),combined=summary(merged);
 const witnessedLead=firstWitnessLeadTiming(d);
 const claimedFreezeDelay=claimedFreezeToFirstWitnessDelay(d);
 if(claimedFreezeDelay.early.witnessedModelMarketDecisions!==
     witnessedLead.early.modelMarketDecisions||
    claimedFreezeDelay.late.witnessedModelMarketDecisions!==
     witnessedLead.late.modelMarketDecisions)
  throw Error('Self-reported freeze-to-witness diagnostic model denominator mismatch');
 if(witnessedLead.early.modelMarketDecisions!==dur.earlyWait+dur.earlyDirectional||
    witnessedLead.late.modelMarketDecisions!==dur.lateWait+dur.lateDirectional)
  throw Error('First-witness timing identity count mismatch');
 const distinctDurableRuns=new Set(
  [...d.values()].flatMap(x=>[...x.runIds])
 ).size;
 if(distinctDurableRuns>durableRunCount||
    dur.totalModelMarketDecisions!==
      dur.earlyWait+dur.earlyDirectional+dur.lateWait+dur.lateDirectional||
    leg.totalModelMarketDecisions!==legacyFiles||
    combined.totalModelMarketDecisions!==
       dur.totalModelMarketDecisions+
       overlap.scheduledLedgerOnlyModelMarketDecisions)
  throw Error('Combined public evidence denominator inconsistency');
 const legacyDirectionalWithFinal=[...l.values()].filter(x=>
  x.side!=='WAIT'&&x.directFinal).length;
 const legacyDirectionalWithoutFinal=[...l.values()].filter(x=>
  x.side!=='WAIT'&&!x.directFinal).length;
 const settledLate=[...l.values()].filter(x=>
  x.model==='KXBTC15M_LATE_CHECKPOINT_SHADOW_V1'&&
  x.side!=='WAIT'&&x.directFinal);
 const latePriced=settledLate.filter(x=>x.paperPriced);
 const lateHits=settledLate.filter(x=>x.side===x.winner).length;
 const lateMisses=settledLate.length-lateHits;
 const lateCorrectNonpositive=latePriced.filter(x=>
  x.side===x.winner&&x.netConservativeUSD<=0).length;
 const lateNet=latePriced.length?
  Number(latePriced.reduce((sum,x)=>sum+x.netConservativeUSD,0).toFixed(4)):
  null;
 return {
  version:VERSION,
  archiveType:'PUBLIC_GITHUB_RESEARCH_CROSS_EVIDENCE_COHORT_ONLY',
  durable:{...dur,firstWitnessLeadTiming:witnessedLead,
   claimedFreezeToFirstWitnessDelay:claimedFreezeDelay,
   originalArchiveRuns:durableRunCount,
   runsWithAReadableFrozenDecision:distinctDurableRuns,
   publicExchangeMatchedModelMarketDecisions:[...d.values()].filter(x=>
    x.directPublicKalshiMatched).length,
   directionalWithPublicExchangeMatch:[...d.values()].filter(x=>
    x.side!=='WAIT'&&x.directPublicKalshiMatched).length},
  scheduledLegacy:{...leg,
   directionalWithSeparateDirectFinal:legacyDirectionalWithFinal,
   directionalWithoutDirectFinal:legacyDirectionalWithoutFinal,
   directionalWithCounterfactualAsk:[...l.values()].filter(x=>
    x.side!=='WAIT'&&x.paperPriced).length,
   lateDirectionalPublishedFinals:settledLate.length,
   lateDirectionalPublishedHits:lateHits,
   lateDirectionalPublishedMisses:lateMisses,
   lateDirectionalPricedCounterfactuals:latePriced.length,
   lateCorrectButNonpositiveConservativePaper:lateCorrectNonpositive,
   lateConservativeHypotheticalNetUSD:lateNet},
  overlap,
  distinctUnion:combined,
  inferenceTimeBRTIIndependentlyReplicated:false,
  exchangeSignedForecastTimeProven:false,
  tradeFillsVerified:0,realMoneyOrdersAllowed:false,
  independentlyQualifiedCount:0,
  independentValidationTarget:100,
  validationGateMet:false,
  historicalAuditCompletenessProven:false,
  warning:'Freeze-to-first-witness delay is measured since the original SOURCE-REPORTED frozenAt, not a verified public publication timestamp, actual network latency, or GitHub scheduling delay. It cannot assign fault to the source server or prove when external observers could first access the forecast. First-witness lead-time bins show earliest available GitHub-observed pre-expiry timestamps for DISTINCT model/market decisions only. Repeated polls, later confirmations and settlement outcomes cannot increase the sample or select a more favorable timestamp. These are not full forecast coverage, authenticated exchange first-publication times, or unique underlying Kalshi contracts. Records count unique model/contract frozen identities across two incomplete GitHub-hosted public-proxy evidence sets, not an independently sampled holdout. Early+late decisions for the same Kalshi contract are ONE market, not two independent contracts. Provisional ledger finals never retrospectively time-witness another forecast; original runner timestamps are not cryptographically notarized, BRTI index inputs/quotes and actual fills are not verified, and agreement does not establish trading profitability.'
 };
}
function auditCombined(lateRoot,ledgerRoot){
 const d=readDurableRows(lateRoot),l=readLegacyRows(ledgerRoot);
 return compareCohorts({durableRows:d.rows,legacyRows:l.rows,
  durableRunCount:d.inventory.runs,legacyFiles:l.inventory.fileCount});
}
if(require.main===module){
 if(process.argv.length!==4)
  throw Error('Usage: node late-public-cohort-audit.js LATE_ORIGINAL_ARCHIVE_ROOT SCHEDULED_SETTLED_LEDGER_ROOT');
 const out=auditCombined(process.argv[2],process.argv[3]);
 console.log('CASH_COHORT_DURABLE_ORIGINAL_RUNS='+out.durable.originalArchiveRuns);
 console.log('CASH_COHORT_DURABLE_UNIQUE_CONTRACTS='+out.durable.uniqueKalshiContracts);
 console.log('CASH_COHORT_DURABLE_LATE_DIRECTIONAL='+out.durable.lateDirectional);
 for(const kind of ['early','late']){
  const x=out.durable.firstWitnessLeadTiming[kind];
  console.log('CASH_COHORT_FIRST_WITNESS_'+kind.toUpperCase()+'_MODEL_DECISIONS='+x.modelMarketDecisions);
  console.log('CASH_COHORT_FIRST_WITNESS_'+kind.toUpperCase()+'_AT_MOST_30S='+x.atMost30s);
  console.log('CASH_COHORT_FIRST_WITNESS_'+kind.toUpperCase()+'_OVER_30_TO_60S='+x.over30To60s);
  console.log('CASH_COHORT_FIRST_WITNESS_'+kind.toUpperCase()+'_OVER_60_TO_120S='+x.over60To120s);
  console.log('CASH_COHORT_FIRST_WITNESS_'+kind.toUpperCase()+'_OVER_120S='+x.over120s);
  console.log('CASH_COHORT_FIRST_WITNESS_'+kind.toUpperCase()+'_MEDIAN_LEAD_SECONDS='+x.medianLeadSeconds);
  const f=out.durable.claimedFreezeToFirstWitnessDelay[kind];
  console.log('CASH_COHORT_CLAIMED_FREEZE_'+kind.toUpperCase()+'_TIMED_DECISIONS='+f.withClaimedFreezeTimestamp);
  console.log('CASH_COHORT_CLAIMED_FREEZE_'+kind.toUpperCase()+'_UNKNOWN='+f.missingClaimedFreezeTimestamp);
  console.log('CASH_COHORT_CLAIMED_FREEZE_'+kind.toUpperCase()+'_WITHIN_5S='+f.atMost5s);
  console.log('CASH_COHORT_CLAIMED_FREEZE_'+kind.toUpperCase()+'_OVER_5_TO_30S='+f.over5To30s);
  console.log('CASH_COHORT_CLAIMED_FREEZE_'+kind.toUpperCase()+'_OVER_30_TO_120S='+f.over30To120s);
  console.log('CASH_COHORT_CLAIMED_FREEZE_'+kind.toUpperCase()+'_OVER_120S='+f.over120s);
  console.log('CASH_COHORT_CLAIMED_FREEZE_'+kind.toUpperCase()+'_MEDIAN_DELAY_SECONDS='+f.medianSeconds);
 }
 console.log('CASH_COHORT_SCHEDULED_LEDGER_LATE_DIRECTIONAL='+out.scheduledLegacy.lateDirectional);
 console.log('CASH_COHORT_SCHEDULED_LEDGER_DIRECTIONAL_FINALS='+out.scheduledLegacy.directionalWithSeparateDirectFinal);
 console.log('CASH_COHORT_SCHEDULED_LEDGER_LATE_HITS='+out.scheduledLegacy.lateDirectionalPublishedHits);
 console.log('CASH_COHORT_SCHEDULED_LEDGER_LATE_MISSES='+out.scheduledLegacy.lateDirectionalPublishedMisses);
 console.log('CASH_COHORT_SCHEDULED_LEDGER_LATE_PRICED='+out.scheduledLegacy.lateDirectionalPricedCounterfactuals);
 console.log('CASH_COHORT_SCHEDULED_LEDGER_LATE_NET_CONSERVATIVE_PAPER_USD='+out.scheduledLegacy.lateConservativeHypotheticalNetUSD);
 console.log('CASH_COHORT_SCHEDULED_LEDGER_CORRECT_BUT_NONPOSITIVE_NET='+out.scheduledLegacy.lateCorrectButNonpositiveConservativePaper);
 console.log('CASH_COHORT_CROSS_ARCHIVE_MATCHES='+out.overlap.identicalFrozenCommitments);
 console.log('CASH_COHORT_UNION_UNIQUE_KALSHI_CONTRACTS='+out.distinctUnion.uniqueKalshiContracts);
 console.log('CASH_COHORT_INDEPENDENT_QUALIFIED=0');
 console.log('CASH_COHORT_ORDERS_ENABLED=false');
}
module.exports={readDurableRows,readLegacyRows,compareCohorts,
 auditCombined,VERSION,summary,canonicalCloseUtc,firstWitnessLeadTiming,
 claimedFreezeToFirstWitnessDelay};
