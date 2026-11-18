'use strict';
/*
 * Public-only, MONOTONIC research evidence ledger.
 *
 * Trusted workflow_run (from DEFAULT branch) downloads a successful
 * scheduled GitHub reconciliation artifact, sanitizes its model/public
 * fields, and stores limited signed-by-GitHub-commit *repository history*
 * in a dedicated Git branch. This is NOT a proof of source honesty, not
 * cryptographic exchange attestation, not an independently qualified
 * accuracy record, not model state, and never an executable trade.
 *
 * Only SCHEDULED pre-expiry observer runs are eligible for this ledger.
 * PR/manual observations stay in normal short-lived research artifacts.
 */
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const MODEL={
 KXBTC15M_SETTLEMENT_EARLY_V3:'early-v3',
 KXBTC15M_LATE_CHECKPOINT_SHADOW_V1:'late-v1'
};
const SHA=/^[a-f0-9]{64}$/;
const RUN=/^\d{8,16}$/;
const MARKET=/^KXBTC15M-[A-Za-z0-9-]{6,70}$/;
const WINNER=new Set(['YES','NO']);
const FROZEN=new Set(['YES','NO','WAIT']);
const STATES=new Set([
 'OBSERVED_WAIT_RESOLVED','OBSERVED_DIRECTIONAL_HIT',
 'OBSERVED_DIRECTIONAL_MISS','OUTCOME_PENDING',
 'OUTCOME_EVIDENCE_REJECTED','DUPLICATE_OUTCOMES_REJECTED'
]);
const DIRECT_FINAL=new Set([
 'DIRECT_FINAL_TWO_READ_JOURNAL_HASH_MATCH',
 'DIRECT_FINAL_TWO_READ_NUMERIC_MATCH_FIELDS_DIFFER'
]);
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function dateMs(s){const t=Date.parse(s);return Number.isFinite(t)?t:NaN}
function safeMeta(meta){
 if(!meta||meta.event!=='schedule'||meta.headBranch!=='main'||
    meta.repository!=='xandputaaa/CASH-staging'||
    !RUN.test(String(meta.runId))||
    !/^[a-f0-9]{40}$/.test(meta.headSha||'')||
    !Number.isFinite(dateMs(meta.createdAt)))
  throw Error('Not an authorized scheduled main-branch reconciliation');
 return {...meta,runId:String(meta.runId)};
}
function validateReport(report){
 if(!report||report.version!=='CASH_PROVISIONAL_EXTERNAL_WITNESS_RECONCILIATION_V1'||
    report.independentQualifiedCount!==0||report.ordersEnabled!==false||
    report.executionVerified!==false||!Array.isArray(report.matched)||
    !report.secondSourceFinalAudit||
    report.secondSourceFinalAudit.independentQualifiedCount!==0||
    !report.witnessCoverage||report.witnessCoverage.independentlyQualifiedCount!==0||
    report.witnessCoverage.archivalCompletenessProven!==false)
  throw Error('Untrusted report or accidental validation/trading unlock');
}
function safeRow(row,meta,reportSha){
 if(!row||row.observerGithubEvent!=='schedule')return null;
 if(!MODEL[row.model]||!MARKET.test(row.marketId||'')||
    !FROZEN.has(row.witnessedSide)||!STATES.has(row.state)||
    !SHA.test(row.observedCommitmentHash||'')||
    !RUN.test(String(row.witnessGitHubRunId))||
    !/^[a-f0-9]{40}$/.test(row.observerGithubRunHeadSha||'')||
    typeof row.directlyCheckedPublicMarket!=='boolean')
  throw Error('Untrusted scheduled witness fields');
 const observed=dateMs(row.observedAtRunner),expiry=dateMs(row.contractClosesAt),
  created=dateMs(row.observerGithubRunCreatedAt);
 if(!Number.isFinite(observed)||!Number.isFinite(expiry)||
    !Number.isFinite(created)||created>observed+5000||
    expiry-observed<=15000||created>expiry)
  throw Error('Scheduled witness was not plausibly observed before closure');
 const date=new Date(expiry).toISOString().slice(0,10);
 const base={
  version:'CASH_PUBLIC_GITHUB_WITNESS_LEDGER_V1',
  prediction:{
   model:row.model,marketId:row.marketId,side:row.witnessedSide,
   contractClosesAt:new Date(expiry).toISOString(),
   frozenEventSha256:row.observedCommitmentHash
  },
  observations:[{
   githubObserverRunId:String(row.witnessGitHubRunId),
   githubObserverHeadSha:row.observerGithubRunHeadSha,
   observedAtRunner:new Date(observed).toISOString(),
   githubRunCreatedAt:new Date(created).toISOString(),
   githubRunEvent:'schedule',
   directKalshiActiveMarketCorroborated:row.directlyCheckedPublicMarket
  }],
  firstReconciliation:{githubRunId:meta.runId,headSha:meta.headSha,
   reportSha256:reportSha},
  directlyRecheckedFinal:null,
  conditionalPaper:null,
  independentQualification:0,
  ordersEnabled:false,
  provenanceLimitations:'Public GitHub workflow witnesses and public Kalshi API records are not exchange-signed forecast truth, licensed BRTI audit, real fill, profit, calibrated odds or certified independent accuracy. Branch can be altered by authorized repository writers.'
 };
 if(DIRECT_FINAL.has(row.directFinalStatus)){
  const final=row.directFinal;
  if(!WINNER.has(row.publicWinner)||!WINNER.has(final?.directWinner)||
     final.directWinner!==row.publicWinner||
     !['OBSERVED_DIRECTIONAL_HIT','OBSERVED_DIRECTIONAL_MISS'].includes(row.state)||
     !WINNER.has(row.witnessedSide)||
     (row.state==='OBSERVED_DIRECTIONAL_HIT')!==(row.witnessedSide===row.publicWinner)||
     !SHA.test(row.settlementEvidenceSha256||'')||
     !SHA.test(final.directPublicEvidenceSha256||'')||
     final.finalResultCorroborated!==true||
     !Number.isFinite(final.sourceReadSeparationMs)||
     final.sourceReadSeparationMs<20000)
   throw Error('Claimed direct final is unsupported or contradicts frozen side');
  base.directlyRecheckedFinal={
   winner:row.publicWinner,
   directKalshiTwoReadStatus:row.directFinalStatus,
   officialPublicFieldsSha256:final.directPublicEvidenceSha256,
   cashJournalPublicFieldsSha256:row.settlementEvidenceSha256,
   directReadSeparationMs:final.sourceReadSeparationMs,
   provenanceReconciliationGitHubRunId:meta.runId
  };
  const paper=row.witnessedPaper;
  if(paper!==undefined){
   if(paper?.state!=='WITNESSED_QUOTED_COUNTERFACTUAL_ONLY'||
      !Number.isFinite(paper.observedAsk)||paper.observedAsk<0||paper.observedAsk>1||
      !Number.isFinite(paper.netAfterFees?.lower)||
      !Number.isFinite(paper.netAfterFees?.upper)||
      paper.actualFillConfirmed!==false||paper.actualProfitVerified!==false)
    throw Error('Paper result cannot be considered a verified fill');
   base.conditionalPaper={
    observedPublicAskAtOriginalFreeze:paper.observedAsk,
    assumedNetOneContractUSDRoundedCentiCentFee:paper.netAfterFees.upper,
    assumedNetOneContractUSDConservativeCentFee:paper.netAfterFees.lower,
    actualFillConfirmed:false,actualProfitVerified:false
   };
  }
 }
 return {
  relativePath:path.posix.join('public-evidence',date,row.marketId,
   MODEL[row.model]+'.json'),
  value:base
 };
}
function immutableSame(a,b){return JSON.stringify(a)===JSON.stringify(b)}
function mergeEntry(old,next){
 if(!old)return next;
 if(old.version!=='CASH_PUBLIC_GITHUB_WITNESS_LEDGER_V1'||
  old.independentQualification!==0||old.ordersEnabled!==false||
  !immutableSame(old.prediction,next.prediction)||
  !Array.isArray(old.observations)||
  !old.firstReconciliation)
  throw Error('Previous public forecast identity conflicts with new evidence');
 const obs=old.observations.slice(),seen=new Set(obs.map(x=>x.githubObserverRunId));
 for(const x of next.observations){
  if(seen.has(x.githubObserverRunId)){
   const y=obs.find(y=>y.githubObserverRunId===x.githubObserverRunId);
   if(!immutableSame(y,x))throw Error('Prior GitHub witness observation has changed');
   continue;
  }
  seen.add(x.githubObserverRunId);obs.push(x);
 }
 obs.sort((a,b)=>dateMs(a.observedAtRunner)-dateMs(b.observedAtRunner)||
  Number(a.githubObserverRunId)-Number(b.githubObserverRunId));
 const final=old.directlyRecheckedFinal;
 if(final&&next.directlyRecheckedFinal){
  // Every new runner verifies Kalshi again and measures a DIFFERENT
  // two-read separation. Keep the original committed verification and
  // reject differences in the immutable settlement winner and hashes.
  const {
   provenanceReconciliationGitHubRunId:oldRunId,
   directReadSeparationMs:oldReadSpacing,
   ...oldImmutableSettlement
  }=final;
  const {
   provenanceReconciliationGitHubRunId:newRunId,
   directReadSeparationMs:newReadSpacing,
   ...newImmutableSettlement
  }=next.directlyRecheckedFinal;
  if(!Number.isFinite(oldReadSpacing)||oldReadSpacing<20000||
     !Number.isFinite(newReadSpacing)||newReadSpacing<20000||
     !immutableSame(oldImmutableSettlement,newImmutableSettlement))
   throw Error('Official final public settlement conflict: manual audit required');
 }
 if(old.conditionalPaper&&next.conditionalPaper&&
    !immutableSame(old.conditionalPaper,next.conditionalPaper))
  throw Error('Original frozen public ask economics conflict: manual audit required');
 return {
  ...old,observations:obs,
  directlyRecheckedFinal:final||next.directlyRecheckedFinal,
  conditionalPaper:old.conditionalPaper||next.conditionalPaper
 };
}
function applyReportToDirectory(report,meta,directory,{sourceReportSha256='0'.repeat(64)}={}){
 const safe=safeMeta(meta);validateReport(report);
 if(!SHA.test(sourceReportSha256))throw Error('Missing exact source artifact digest');
 const prepared=new Map(),skipped={nonScheduled:0,invalidOrUnreconciled:0},seen=new Set();
 for(const row of report.matched){
  if(row.observerGithubEvent!=='schedule'){skipped.nonScheduled++;continue}
  const selected=safeRow(row,safe,sourceReportSha256);
  if(!selected){skipped.invalidOrUnreconciled++;continue}
  const key=selected.relativePath;
  if(seen.has(key))throw Error('Duplicate scheduled model/market in same report');
  seen.add(key);
  const file=path.resolve(directory,key);
  if(!file.startsWith(path.resolve(directory)+path.sep))
   throw Error('Escaped ledger directory');
  const old=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
  const merged=mergeEntry(old,selected.value);
  if(!immutableSame(old,merged))prepared.set(file,merged);
 }
 // Validate EVERY update before writing ANY file.
 for(const [file,data] of prepared){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const staging=file+'.incoming';
  fs.writeFileSync(staging,JSON.stringify(data,null,2)+'\n',{mode:0o644});
  fs.renameSync(staging,file);
 }
 const result={
  version:'CASH_PUBLIC_LEDGER_ARCHIVE_RESULT_V1',
  archivedOrUpdated:prepared.size,
  scheduledWitnessesConsidered:seen.size,
  omittedNonScheduled:skipped.nonScheduled,
  sourceReconciliationGitHubRunId:safe.runId,
  sourceSha256:sourceReportSha256,
  independentQualification:0,realOrdersEnabled:false
 };
 console.log('CASH_LEDGER_PUBLIC_SCHEDULED_WITNESSES='+seen.size);
 console.log('CASH_LEDGER_ARCHIVED_OR_UPDATED='+prepared.size);
 console.log('CASH_LEDGER_OMITTED_PR_OR_MANUAL='+skipped.nonScheduled);
 console.log('CASH_LEDGER_INDEPENDENTLY_QUALIFIED=0');
 return result;
}
function archiveFile(file,directory,meta){
 const raw=fs.readFileSync(file);
 if(raw.length>2500000)throw Error('Source reconciliation report too large');
 return applyReportToDirectory(JSON.parse(raw),meta,directory,
  {sourceReportSha256:sha(raw)});
}
if(require.main===module){
 const [source,dest]=process.argv.slice(2);
 if(!source||!dest)throw Error('Usage: node public-evidence-ledger.js REPORT_JSON LEDGER_DIRECTORY');
 archiveFile(source,dest,{
  event:process.env.CASH_SOURCE_EVENT,
  repository:process.env.GITHUB_REPOSITORY,
  runId:process.env.CASH_RECON_RUN_ID,
  headSha:process.env.CASH_RECON_SHA,
  headBranch:process.env.CASH_RECON_BRANCH,
  createdAt:process.env.CASH_RECON_CREATED_AT
 });
}
module.exports={safeMeta,validateReport,safeRow,mergeEntry,
 applyReportToDirectory,archiveFile};
