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
function readSafe(p,cap=200000){
 const stat=fs.lstatSync(p);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<10||stat.size>cap)
  throw Error('Unsafe public audit source file');
 return JSON.parse(fs.readFileSync(p,'utf8'));
}
function normalize(row,source){
 if(!row||!MODELS.has(row.model)||!KEY.test(row.marketId||'')||
    !['YES','NO','WAIT'].includes(row.side)||
    !SHA.test(row.hash||'')||
    !Number.isFinite(Date.parse(row.close))||
    source!==row.source||
    (source==='durable'&&
      (!Number.isFinite(Date.parse(row.observedAt))||
       !RUN.test(row.githubRunId||'')||
       Date.parse(row.observedAt)>=Date.parse(row.close)))||
    (source==='ledger'&&
      (typeof row.directFinal!=='boolean'||typeof row.paperPriced!=='boolean'||
       (row.side==='WAIT'&&(row.directFinal||row.paperPriced))||
       row.paperPriced&&!row.directFinal)))
  throw Error('Invalid immutable public cohort identity or evidence class');
 return row;
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
     paperPriced:r.conditionalPaper!==null
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
      before.close!==x.close)
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
 return {
  version:VERSION,
  archiveType:'PUBLIC_GITHUB_RESEARCH_CROSS_EVIDENCE_COHORT_ONLY',
  durable:{...dur,originalArchiveRuns:durableRunCount,
   runsWithAReadableFrozenDecision:distinctDurableRuns,
   publicExchangeMatchedModelMarketDecisions:[...d.values()].filter(x=>
    x.directPublicKalshiMatched).length,
   directionalWithPublicExchangeMatch:[...d.values()].filter(x=>
    x.side!=='WAIT'&&x.directPublicKalshiMatched).length},
  scheduledLegacy:{...leg,
   directionalWithSeparateDirectFinal:legacyDirectionalWithFinal,
   directionalWithoutDirectFinal:legacyDirectionalWithoutFinal,
   directionalWithCounterfactualAsk:[...l.values()].filter(x=>
    x.side!=='WAIT'&&x.paperPriced).length},
  overlap,
  distinctUnion:combined,
  inferenceTimeBRTIIndependentlyReplicated:false,
  exchangeSignedForecastTimeProven:false,
  tradeFillsVerified:0,realMoneyOrdersAllowed:false,
  independentlyQualifiedCount:0,
  independentValidationTarget:100,
  validationGateMet:false,
  historicalAuditCompletenessProven:false,
  warning:'Records count unique model/contract frozen identities across two incomplete GitHub-hosted public-proxy evidence sets, not an independently sampled holdout. Early+late decisions for the same Kalshi contract are ONE market, not two independent contracts. Provisional ledger finals never retrospectively time-witness another forecast; original runner timestamps are not cryptographically notarized, BRTI index inputs/quotes and actual fills are not verified, and agreement does not establish trading profitability.'
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
 console.log('CASH_COHORT_SCHEDULED_LEDGER_LATE_DIRECTIONAL='+out.scheduledLegacy.lateDirectional);
 console.log('CASH_COHORT_SCHEDULED_LEDGER_DIRECTIONAL_FINALS='+out.scheduledLegacy.directionalWithSeparateDirectFinal);
 console.log('CASH_COHORT_CROSS_ARCHIVE_MATCHES='+out.overlap.identicalFrozenCommitments);
 console.log('CASH_COHORT_UNION_UNIQUE_KALSHI_CONTRACTS='+out.distinctUnion.uniqueKalshiContracts);
 console.log('CASH_COHORT_INDEPENDENT_QUALIFIED=0');
 console.log('CASH_COHORT_ORDERS_ENABLED=false');
}
module.exports={readDurableRows,readLegacyRows,compareCohorts,
 auditCombined,VERSION,summary};
