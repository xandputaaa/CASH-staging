'use strict';
/*
 * A GitHub runner reconciles a constrained set of past externally observed
 * forecast commitments with the CURRENT public post-expiry journals.
 * Input witness artifacts and GH run metadata are read only. Not a
 * qualified independent timestamp, trading simulator, or exchange account.
 */
const fs=require('node:fs'),path=require('node:path');
const {reconcileWitnesses}=require('./observed-settlement-reconciler');
const {auditDirectFinal}=require('./direct-kalshi-final-audit');
const {summarizeWitnessCoverage}=require('./witness-coverage');
function safeJson(p,maxBytes=2500000){
 const b=fs.readFileSync(p);
 if(b.length>maxBytes)throw Error('Oversized observation/research JSON');
 return JSON.parse(b.toString('utf8'));
}
function collectWitnesses(dir,runs){
 if(!Array.isArray(runs?.workflow_runs))throw Error('Missing authentic GitHub run listing');
 const byId=new Map(runs.workflow_runs.map(x=>[String(x.id),x]));
 const witnesses=[],excluded=[];
 for(const id of fs.existsSync(dir)?fs.readdirSync(dir):[]){
  if(!/^\d{8,16}$/.test(id))continue;
  const f=path.join(dir,id,'public-preexpiry-observation.json');
  if(!fs.existsSync(f))continue;
  try{
   const w=safeJson(f,200000),run=byId.get(id);
   const observed=Date.parse(w.observedAtRunner);
   const started=Date.parse(run?.created_at),finished=Date.parse(run?.updated_at);
   if(w.githubRunId!==id||w.githubRepo!=='xandputaaa/CASH-staging'||
    run?.conclusion!=='success'||!Number.isFinite(observed)||
    !Number.isFinite(started)||!Number.isFinite(finished)||
    observed<started-5000||observed>finished+180000){
     excluded.push({run:id,reason:'GITHUB_RUN_PROVENANCE_MISMATCH'});continue;
   }
   witnesses.push(w);
  }catch{excluded.push({run:id,reason:'UNREADABLE_WITNESS'})}
 }
 return {witnesses,excluded};
}
async function buildReport({witnessDir,runListPath,earlyPath,latePath,outputPath,checkDirectFinal=auditDirectFinal}){
 const runs=safeJson(runListPath,1000000);
 const collected=collectWitnesses(witnessDir,runs);
 const early=safeJson(earlyPath),late=safeJson(latePath);
 const result=reconcileWitnesses({witnesses:collected.witnesses,early,late});
 // Use a fresh, second-source Kalshi API GET after settlement on this GH
 // runner; the result cannot rewrite model verdicts or trade a contract.
 const checked=await checkDirectFinal(result);
 // Keep the COMPLETE frozen current-session denominator, not only
 // the off-server observed directional winners.
 const witnessCoverage=summarizeWitnessCoverage({
  early,late,reconciliation:checked
 });
 const report={...checked,witnessCoverage,githubRunCrossCheck:{
  witnessArtifactsReviewed:collected.witnesses.length,
  rejectedArtifacts:collected.excluded,
  witnessRunMetadataSource:'GitHub Actions API workflow runs; runner job creation/completion timestamps',
  reportProducedBy:'CASH_GITHUB_RECONCILIATION_WORKFLOW',
  note:'Runner times checked against GitHub API run metadata for internal consistency only. Runner time and server hash remain neither a cryptographically trusted third-party notary nor an independent qualified accuracy result.'
 }};
 fs.mkdirSync(path.dirname(outputPath),{recursive:true});
 fs.writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log('CASH_WITNESS_RECONCILED_EARLY_DIRECTIONAL='+result.groups.early.directionalVerifiedOutcomes);
 console.log('CASH_WITNESS_RECONCILED_LATE_DIRECTIONAL='+result.groups.late.directionalVerifiedOutcomes);
 console.log('CASH_WITNESS_LATE_DIRECT_KALSHI_MATCHES='+result.groups.late.directExchangeCorroborated);
 console.log('CASH_WITNESS_LATE_DIRECTIONAL_DIRECT_KALSHI='+result.groups.late.directionalOutcomesWithDirectExchange);
 console.log('CASH_WITNESS_RECONCILED_LATE_HITS='+result.groups.late.hits);
 console.log('CASH_WITNESS_RECONCILED_LATE_MISSES='+result.groups.late.misses);
 console.log('CASH_WITNESS_RECONCILED_EARLY_WAITS='+result.groups.early.waitsResolved);
 console.log('CASH_WITNESS_RECONCILED_LATE_WAITS='+result.groups.late.waitsResolved);
 console.log('CASH_WITNESSED_LATE_PAPER_PRICED='+result.groups.late.witnessedPaper.pricedSettlements);
 console.log('CASH_WITNESSED_LATE_PAPER_CONSERVATIVE_NET_USD='+
  (result.groups.late.witnessedPaper.totalConservativeNetUSD??'NOT_AVAILABLE'));
 console.log('CASH_WITNESSED_LATE_PAPER_BETTER_FEE_NET_USD='+
  (result.groups.late.witnessedPaper.totalCentiCentFeeNetUSD??'NOT_AVAILABLE'));
 console.log('CASH_WITNESS_UNRESOLVED_OR_REJECTED='+
  (result.groups.early.unresolvedOrRejected+result.groups.late.unresolvedOrRejected));
 console.log('CASH_DIRECT_FINAL_EARLY_TWO_READ_CONFIRMED='+
  report.secondSourceFinalAudit.early.secondSourceTwoReadConfirmed);
 console.log('CASH_DIRECT_FINAL_LATE_TWO_READ_CONFIRMED='+
  report.secondSourceFinalAudit.late.secondSourceTwoReadConfirmed);
 console.log('CASH_DIRECT_FINAL_LATE_PUBLIC_HASH_MATCH='+
  report.secondSourceFinalAudit.late.publicFieldsHashMatchesServer);
 console.log('CASH_DIRECT_FINAL_UNIQUE_MARKETS_CHECKED='+
  report.secondSourceFinalAudit.uniqueMarketsAttempted);
 console.log('CASH_COVERAGE_LATE_ALL_DIRECTIONAL='+
  witnessCoverage.groups.late.publicProxyDirectional);
 console.log('CASH_COVERAGE_LATE_EXTERNALLY_WITNESSED_DIRECTIONAL='+
  witnessCoverage.groups.late.matchedDirectionalWitnesses);
 console.log('CASH_COVERAGE_LATE_UNWITNESSED_DIRECTIONAL='+
  witnessCoverage.groups.late.publicProxyDirectionalWithoutMatchedWitness);
 console.log('CASH_COVERAGE_LATE_DIRECTLY_RECHECKED_FINAL_DIRECTIONAL='+
  witnessCoverage.groups.late.directlyRecheckedFinalDirectional);
 console.log('CASH_COVERAGE_LATE_WITNESSED_CORRECT_BUT_NONPOSITIVE_CONSERVATIVE_PAPER='+
  witnessCoverage.groups.late.witnessedCorrectPaperNonpositiveConservative);
 console.log('CASH_COVERAGE_LATE_WITNESSED_PRICE_BREAK_EVEN_AT_LEAST_100_PERCENT='+
  witnessCoverage.groups.late.witnessedPaperBreakEvenAtOrAbove100Pct);
 console.log('CASH_COVERAGE_LATE_WITNESSED_UNPRICED_DIRECTIONAL='+
  witnessCoverage.groups.late.witnessedScoredDirectionalWithoutPaperPrice);
 console.log('CASH_COVERAGE_LATE_WAIT_NO_VALID_WITNESS='+
  witnessCoverage.groups.late.publicProxyWaitWithoutMatchedWitness);
 console.log('CASH_WITNESS_INDEPENDENTLY_QUALIFIED=0');
 return report;
}
if(require.main===module){
 const [dir,runListPath,earlyPath,latePath,outputPath]=process.argv.slice(2);
 if([dir,runListPath,earlyPath,latePath,outputPath].some(v=>!v))
  throw Error('Usage: node observed-settlement-reconcile-cli.js WITNESS_DIR RUNS_JSON EARLY_JSON LATE_JSON REPORT_JSON');
 buildReport({witnessDir:dir,runListPath,earlyPath,latePath,outputPath})
  .catch(e=>{console.error('CASH direct settlement audit failed: '+e.message);process.exitCode=1});
}
module.exports={collectWitnesses,buildReport};
