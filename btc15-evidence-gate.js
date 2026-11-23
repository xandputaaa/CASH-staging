'use strict';
/*
 * BTC15 research evidence gate. READ ONLY, runner-side. This summarizes
 * existing, independently collected GH observations without promoting a
 * provisional hit-rate to independent accuracy, live-trade permission,
 * profitability or a validated 100-contract chronological holdout.
 *
 * No model changes, source reads, paid APIs or order endpoints.
 */
const fs=require('node:fs'),path=require('node:path');
const MODELS={early:{name:'KXBTC15M_SETTLEMENT_EARLY_V3',defaultCapacity:320},
 late:{name:'KXBTC15M_LATE_CHECKPOINT_SHADOW_V1',defaultCapacity:160}};
const valid=n=>Number.isSafeInteger(n)&&n>=0;
function requireCount(n,field){if(!valid(n))throw Error('Invalid research count: '+field);return n;}
function auditedGroup(kind,coverage,results){
 const model=MODELS[kind];
 if(!coverage||coverage.model!==model.name||coverage.realOrdersEnabled!==false||
    coverage.independentlyQualified!==0)
  throw Error('Unexpected or privileged '+kind+' coverage');
 const get=(key)=>requireCount(coverage[key],kind+'.'+key);
 const frozen=get('allFrozen'),directional=get('allDirectional'),
  waits=get('allWait'),publicDirectional=get('publicProxyDirectional'),
  witnessed=get('matchedDirectionalWitnesses'),
  unwitnessed=get('publicProxyDirectionalWithoutMatchedWitness'),
  directlyRechecked=get('directlyRecheckedFinalDirectional'),
  hits=get('witnessedDirectionalHits'),misses=get('witnessedDirectionalMisses'),
  unscored=get('witnessedDirectionalUnresolvedOrRejected'),
  priced=get('witnessedDirectionalPaperPriced'),
  unpriced=get('witnessedScoredDirectionalWithoutPaperPrice');
 if(frozen!==directional+waits||
    publicDirectional>directional||
    publicDirectional!==witnessed+unwitnessed||
    hits+misses+unscored!==witnessed||
    directlyRechecked>hits+misses||
    priced+unpriced!==hits+misses||
    !results||results.directionalVerifiedOutcomes!==hits+misses||
    results.hits!==hits||results.misses!==misses||
    results.directionalWitnessed!==witnessed)
  throw Error('Inconsistent research denominator for '+kind);
 const evidenceDeficits=[];
 if(!publicDirectional)evidenceDeficits.push('NO_FROZEN_PUBLIC_DIRECTIONAL_FORECASTS');
 if(unwitnessed)evidenceDeficits.push('UNWITNESSED_FROZEN_DIRECTIONAL_FORECASTS');
 if(directlyRechecked<hits+misses)evidenceDeficits.push('SCORED_OUTCOMES_NOT_DIRECTLY_RECHECKED');
 if(unscored)evidenceDeficits.push('WITNESSED_DIRECTIONAL_OUTCOMES_UNRESOLVED');
 if(unpriced)evidenceDeficits.push('SETTLED_DIRECTIONAL_OUTCOMES_UNPRICED');
 if(frozen>=model.defaultCapacity)evidenceDeficits.push('RESEARCH_SOURCE_AT_CODE_DEFAULT_CAPACITY');
 else if(frozen>=model.defaultCapacity-24)evidenceDeficits.push('RESEARCH_SOURCE_APPROACHING_CODE_DEFAULT_CAPACITY');
 return {
  model:model.name,
  frozen,waits,directional,publicProxyDirectional:publicDirectional,
  preExpiryWitnessedDirectional:witnessed,
  notWitnessedDirectional:unwitnessed,
  sourceScoredHits:hits,sourceScoredMisses:misses,
  sourceScoredDirectional:hits+misses,
  directPublicKalshiFinalRecheckedDirectional:directlyRechecked,
  unscoredWitnessedDirectional:unscored,
  oneContractCounterfactualPriced:priced,
  oneContractCounterfactualMissingPrice:unpriced,
  descriptiveWitnessedDirectionalHitRate:hits+misses?hits/(hits+misses):null,
  descriptiveOnly:true,
  codeDefaultJournalCapacity:model.defaultCapacity,
  liveCapacityVerified:false,
  independentlyQualified:0,
  expectedValueCalibrated:false,
  realOrdersEnabled:false,
  evidenceDeficits
 };
}
function assessBtc15Evidence(report){
 if(!report||report.version!=='CASH_PROVISIONAL_EXTERNAL_WITNESS_RECONCILIATION_V1'||
    report.independentQualifiedCount!==0||report.executionVerified!==false||
    report.ordersEnabled!==false||report.pricesReconstructedFromLaterQuotes!==false)
  throw Error('Unexpected or privileged provisional reconciliation');
 const c=report.witnessCoverage,gh=report.githubRunCrossCheck;
 if(c?.version!=='CASH_VOLATILE_RESEARCH_WITNESS_COVERAGE_V1'||
    c.independentlyQualifiedCount!==0||c.realOrdersEnabled!==false||
    c.actualFillsVerified!==0||c.calibrated!==false||
    c.archivalCompletenessProven!==false||
    gh?.archivalCompletenessProven!==false)
  throw Error('Provisional coverage is missing required safety caveats');
 const byModel={};
 for(const kind of Object.keys(MODELS))
  byModel[kind]=auditedGroup(kind,c.groups?.[kind],report.groups?.[kind]);
 const blockers=[
  'NO_INDEPENDENTLY_CERTIFIED_CHRONOLOGICAL_HOLDOUT',
  'PRE_EXPIRY_RUNNER_TIMESTAMPS_AND_SOURCE_NOT_CRYPTOGRAPHICALLY_INDEPENDENT',
  'OFFICIAL_BRTI_SETTLEMENT_COMPUTATION_NOT_INDEPENDENTLY_AUDITED',
  'FORECAST_PROBABILITIES_AND_POSITIVE_EXPECTED_VALUE_NOT_VALIDATED',
  'NO_VERIFIED_EXCHANGE_FILLS_LIQUIDITY_OR_MEMBER_COSTS',
  '100_INDEPENDENT_PROSPECTIVE_OUTCOMES_NOT_ESTABLISHED'
 ];
 if(gh.runSelectionTruncated!==false)blockers.push('GITHUB_RUN_RETRIEVAL_COMPLETENESS_UNVERIFIED');
 if(byModel.late.notWitnessedDirectional)
  blockers.push('LATE_DIRECTIONAL_WITNESS_COVERAGE_INCOMPLETE');
 if(byModel.early.notWitnessedDirectional)
  blockers.push('EARLY_DIRECTIONAL_WITNESS_COVERAGE_INCOMPLETE');
 if(byModel.early.frozen>=320)blockers.push('EARLY_JOURNAL_CAPACITY_STOP');
 if(byModel.late.frozen>=136)blockers.push('LATE_JOURNAL_CAPACITY_REVIEW_DUE');
 return {
  version:'CASH_BTC15_EVIDENCE_GATE_V1',
  issuedAt:new Date().toISOString(),
  decision:'NO_GO_REAL_MONEY',
  manualResearchOnly:true,
  modelParametersModified:false,
  forecastingAccuracyCertified:false,
  claimedAccuracyAtLeast85Percent:false,
  predictedWinProbability:null,expectedValue:null,
  independentQualifiedCount:0,requiredIndependentProspectiveOutcomes:100,
  chronologicalHoldoutComplete:false,
  evidenceComplete:false,
  sourceScope:c.denominatorScope||'CURRENT_RESEARCH_SESSION_ONLY',
  actualFillsVerified:0,realOrdersEnabled:false,
  byModel,blockers,
  note:'These counts are from bounded, provisional public-proxy journals and selected Github pre-expiry observations. A correct direction does not prove profitable or executable trading. No model can be promoted or traded automatically on this report.'
 };
}
function run(file,out){
 if(!file||!out)throw Error('Usage: node btc15-evidence-gate.js RECONCILIATION_JSON OUTPUT_JSON');
 const stat=fs.statSync(file);
 if(!stat.isFile()||stat.size>2500000)throw Error('Unsafe reconciliation size');
 const result=assessBtc15Evidence(JSON.parse(fs.readFileSync(file,'utf8')));
 fs.mkdirSync(path.dirname(out),{recursive:true});
 fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{mode:0o600});
 for(const model of Object.keys(MODELS)){
  const m=result.byModel[model];
  console.log('CASH_BTC15_'+model.toUpperCase()+'_FROZEN='+m.frozen);
  console.log('CASH_BTC15_'+model.toUpperCase()+'_DIRECTIONAL='+m.directional);
  console.log('CASH_BTC15_'+model.toUpperCase()+'_PREEXPIRY_WITNESSED='+m.preExpiryWitnessedDirectional);
  console.log('CASH_BTC15_'+model.toUpperCase()+'_DIRECT_FINALS='+m.directPublicKalshiFinalRecheckedDirectional);
 }
 console.log('CASH_BTC15_DECISION='+result.decision);
 console.log('CASH_BTC15_INDEPENDENTLY_QUALIFIED=0');
 console.log('CASH_BTC15_ORDERS_ENABLED=false');
 return result;
}
if(require.main===module){
 try{run(process.argv[2],process.argv[3])}
 catch{console.error('CASH_BTC15_GATE=INVALID_OR_UNAVAILABLE_RECONCILIATION');process.exitCode=1}
}
module.exports={assessBtc15Evidence,auditedGroup,run};
