'use strict';
/*
 * Read-only conditional paper economics and witness sample-size audit.
 * Archived rows represent selectively witnessed PUBLIC PROXY forecasts.
 * They cannot establish 100-contract prospective holdout, real liquidity,
 * execution, source clock honesty, actual profit, or calibrated accuracy.
 */
const fs=require('node:fs'),path=require('node:path');
const {scanPublicLedger}=require('./public-ledger-inspection');
const Z=1.959963984540054;
const ROUND=x=>Math.round((x+Number.EPSILON)*10000)/10000;
function wilson95Lower(hits,attempts){
 if(!Number.isSafeInteger(hits)||!Number.isSafeInteger(attempts)||
   hits<0||attempts<0||hits>attempts)
  throw Error('Invalid witnessed sample size');
 if(!attempts)return null;
 const p=hits/attempts,z2=Z*Z,denom=1+z2/attempts;
 return (p+z2/(2*attempts)-Z*Math.sqrt(
   p*(1-p)/attempts+z2/(4*attempts*attempts)))/denom;
}
function auditWitnessedPaperEconomics(root){
 const base=path.resolve(root);
 const inventory=scanPublicLedger(base);
 const evidence=path.join(base,'public-evidence');
 const metrics={
  version:'CASH_WITNESSED_PUBLIC_PROXY_PAPER_ECONOMICS_V1',
  ledgerRecords:inventory.fileCount,
  ledgerWaitRecords:inventory.waitCount,
  ledgerDirectionalRecords:inventory.directionalCount,
  lateDirectionalWitnessed:0,
  lateDirectionalDirectFinals:0,
  lateDirectionalDirectHits:0,
  lateDirectionalDirectMisses:0,
  lateDirectionalWithoutDirectFinal:0,
  lateDirectFinalsWithCounterfactualAsk:0,
  lateDirectFinalsWithoutCounterfactualAsk:0,
  lateCorrectButNonpositiveConservativePaper:0,
  lateConservativePositiveCorrectPaper:0,
  lateConservativePaperNetUSD:null,
  lateCentiCentFeePaperNetUSD:null,
  latePaperNetAssumingAllOneContractFills:false,
  lateDirectionalWilson95Lower:null,
  latestWitnessedSettlementAt:null,
  sampleRequirementAtLeast:100,
  sampleRequirementMet:false,
  prospectiveIIDHoldoutEstablished:false,
  archiveIncludesAllModelCalls:false,
  independentQualifiedCount:0,
  realOrdersEnabled:false,
  actualFillsVerified:0,
  financeDecision:'RESEARCH_ONLY_INSUFFICIENT_INDEPENDENT_VALIDATION',
  caveat:'This is a selected, incomplete GitHub-witnessed PUBLIC SPOT PROXY sample with publicly rechecked finals, not 100 independent prospective contracts. Hypothetical one-contract net assumes a fill at the original public ask and estimated fees; no fill, executable depth, slippage or account fee verification. Wilson interval is descriptive of this selected sample ONLY. It must not be used to unlock real-money orders.'
 };
 const uniqMarkets=new Set(),money={low:0,high:0},counts={priced:0};
 if(!fs.existsSync(evidence))return metrics;
 for(const date of fs.readdirSync(evidence).sort()){
  const folder=path.join(evidence,date);
  for(const market of fs.readdirSync(folder).sort()){
   const file=path.join(folder,market,'late-v1.json');
   if(!fs.existsSync(file))continue;
   const r=JSON.parse(fs.readFileSync(file,'utf8'));
   if(r.prediction.side==='WAIT')continue;
   if(uniqMarkets.has(market))
    throw Error('Repeated late market in Git witness ledger, not an independent contract');
   uniqMarkets.add(market);
   metrics.lateDirectionalWitnessed++;
   const f=r.directlyRecheckedFinal;
   if(!f){metrics.lateDirectionalWithoutDirectFinal++;continue}
   const hit=r.prediction.side===f.winner;
   metrics.lateDirectionalDirectFinals++;
   if(hit)metrics.lateDirectionalDirectHits++;
   else metrics.lateDirectionalDirectMisses++;
   const close=r.prediction.contractClosesAt;
   if(!metrics.latestWitnessedSettlementAt||close>metrics.latestWitnessedSettlementAt)
    metrics.latestWitnessedSettlementAt=close;
   if(r.conditionalPaper===null){
    metrics.lateDirectFinalsWithoutCounterfactualAsk++;continue;
   }
   const paper=r.conditionalPaper,ask=paper.observedPublicAskAtOriginalFreeze;
   const upper=paper.assumedNetOneContractUSDRoundedCentiCentFee;
   const lower=paper.assumedNetOneContractUSDConservativeCentFee;
   // In a one-dollar binary contract, fee cost cannot increase the
   // after-fee net relative to payout-minus-ask, even on a paper win.
   const gross=(hit?1:0)-ask;
   if(!Number.isFinite(gross)||lower<-2||upper>1||
      upper>gross+0.00011||lower>upper||lower>gross+0.00011)
    throw Error('Impossible or inflated hypothetical one-contract economics');
   counts.priced++;money.low+=lower;money.high+=upper;
   metrics.lateDirectFinalsWithCounterfactualAsk++;
   if(hit){
    if(lower<=0)metrics.lateCorrectButNonpositiveConservativePaper++;
    else metrics.lateConservativePositiveCorrectPaper++;
   }
 }
 metrics.lateDirectionalWilson95Lower=wilson95Lower(
  metrics.lateDirectionalDirectHits,metrics.lateDirectionalDirectFinals);
 if(counts.priced){
  metrics.lateConservativePaperNetUSD=ROUND(money.low);
  metrics.lateCentiCentFeePaperNetUSD=ROUND(money.high);
 }
 metrics.sampleRequirementMet=metrics.lateDirectionalDirectFinals>=100;
 if(metrics.lateDirectionalDirectHits+metrics.lateDirectionalDirectMisses!==
    metrics.lateDirectionalDirectFinals||
    metrics.lateDirectionalDirectFinals+metrics.lateDirectionalWithoutDirectFinal!==
    metrics.lateDirectionalWitnessed||
    metrics.lateDirectFinalsWithCounterfactualAsk+
    metrics.lateDirectFinalsWithoutCounterfactualAsk!==metrics.lateDirectionalDirectFinals||
    metrics.lateDirectionalWitnessed>inventory.lateCount)
  throw Error('Public witness paper economics denominator mismatch');
 return metrics;
}
function runAudit(root){
 const result=auditWitnessedPaperEconomics(root);
 console.log('CASH_PAPER_AUDIT_LATE_WITNESSED_DIRECTIONAL='+result.lateDirectionalWitnessed);
 console.log('CASH_PAPER_AUDIT_LATE_DIRECT_FINALS='+result.lateDirectionalDirectFinals);
 console.log('CASH_PAPER_AUDIT_LATE_DIRECT_HITS='+result.lateDirectionalDirectHits);
 console.log('CASH_PAPER_AUDIT_LATE_DIRECT_MISSES='+result.lateDirectionalDirectMisses);
 console.log('CASH_PAPER_AUDIT_LATE_PRICED_COUNTERFACTUALS='+result.lateDirectFinalsWithCounterfactualAsk);
 console.log('CASH_PAPER_AUDIT_LATE_CONSERVATIVE_PAPER_NET_USD='+String(result.lateConservativePaperNetUSD));
 console.log('CASH_PAPER_AUDIT_LATE_CORRECT_BUT_NONPOSITIVE='+result.lateCorrectButNonpositiveConservativePaper);
 console.log('CASH_PAPER_AUDIT_LATE_WILSON95_LOWER='+String(result.lateDirectionalWilson95Lower));
 console.log('CASH_PAPER_AUDIT_SAMPLE_REQUIREMENT_MET='+result.sampleRequirementMet);
 console.log('CASH_PAPER_AUDIT_ACTUAL_FILLS=0');
 console.log('CASH_PAPER_AUDIT_INDEPENDENT_QUALIFIED=0');
 console.log('CASH_PAPER_AUDIT_ORDERS_ENABLED=false');
 return result;
}
if(require.main===module){
 const root=process.argv[2];
 if(!root)throw Error('Usage: node witnessed-paper-economics.js LEDGER_ROOT');
 runAudit(root);
}
module.exports={wilson95Lower,auditWitnessedPaperEconomics,runAudit};
