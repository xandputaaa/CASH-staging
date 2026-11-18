'use strict';
/*
 * GH-hosted research INPUT-TIME audit of published forecast journals.
 * No model re-fit, new source, private index, balance or order API.
 * This checks only PUBLIC metadata and raw Kraken proxy timestamps:
 * cannot independently prove data-source integrity or Kalshi BRTI values.
 * Late model publicly exports hash commitments without actual samples;
 * no claim that the original late input history can be audited here.
 */
const fs=require('node:fs');
const {verifiedJournal}=require('./preexpiry-observer');
const EARLY='KXBTC15M_SETTLEMENT_EARLY_V3';
const LATE='KXBTC15M_LATE_CHECKPOINT_SHADOW_V1';
const HASH=/^[a-f0-9]{64}$/;
const QUOTE_MAX_MS=12000,SPOT_MAX_MS=12000,EARLY_MAX_MS=780000;
const TOL_MS=5000;
const parse=x=>typeof x==='string'?Date.parse(x):NaN;
const safePrice=x=>Number.isFinite(x)&&x>0;
const safeAsk=x=>x===null||x===undefined||
  (Number.isFinite(x)&&x>=0&&x<=1);
function inspectFrozen({event,payload:p,kind}){
 const issues=[],warnings=[];
 const fail=x=>issues.push(x),warn=x=>warnings.push(x);
 const frozen=parse(p.at),written=parse(event.recordedAt),end=parse(p.endTime);
 if(!Number.isFinite(frozen)||!Number.isFinite(written)||!Number.isFinite(end))
  fail('MALFORMED_PUBLIC_FORECAST_CLOCK');
 else {
  if(Math.abs(written-frozen)>TOL_MS)fail('EVENT_WRITTEN_DIFFERENT_FROM_FREEZE_TIME');
  const lead=end-frozen;
  if(lead<(kind==='early'?90000:150000)||
    lead>(kind==='early'?780000:210000))
   fail('FORECAST_OUTSIDE_DECLARED_PREEXPIRY_WINDOW');
  if(!Number.isFinite(p.leadMs)||Math.abs(p.leadMs-lead)>1500)
   fail('LEAD_TIME_INCONSISTENT_WITH_EXPIRY');
 }
 if(p.indexSourceType!=='SINGLE_EXCHANGE_PROXY')
  return {issues,warnings:[...warnings,'NON_PUBLIC_PROXY_SOURCE_NOT_TIME_RECONSTRUCTABLE'],
   inspectable:false,rawSampleTimesAvailable:false};
 if(kind==='early'){
  if(p.model!==EARLY)fail('EARLY_MODEL_ID_MISMATCH');
  if(!safePrice(p.targetPrice)||!safePrice(p.spotPrice))
   fail('BAD_PUBLIC_STRIKE_OR_KRAKEN_SPOT');
  if(!HASH.test(p.sampleWindowSha256||'')||
    !HASH.test(p.inputSha256||''))
   fail('EARLY_INPUT_COMMITMENT_MISSING');
  const quote=parse(p.quoteFetchedAt),spot=parse(p.spotFetchedAt);
  if(!Number.isFinite(quote)||!Number.isFinite(frozen)||quote>frozen+1000)
   fail('EARLY_QUOTE_AFTER_FORECAST');
  else if(frozen-quote>QUOTE_MAX_MS)fail('EARLY_QUOTE_TOO_STALE_AT_FORECAST');
  if(!Number.isFinite(spot)||!Number.isFinite(frozen)||spot>frozen+1000)
   fail('KRAKEN_SPOT_TIMESTAMP_AFTER_FORECAST');
  else if(frozen-spot>SPOT_MAX_MS)fail('KRAKEN_SPOT_STALE_AT_FORECAST');
  if(!Array.isArray(p.sampleWindow)||p.sampleWindow.length<2||
      p.sampleWindow.length>128){
   fail('EARLY_RAW_PUBLIC_SAMPLE_WINDOW_MISSING');
  }else{
   let prev=-Infinity;
   for(const sample of p.sampleWindow){
    const t=parse(sample?.time);
    if(!Number.isFinite(t)||!Number.isFinite(frozen)||
      t>frozen+1000)fail('KRAKEN_HISTORY_CONTAINS_FUTURE_SAMPLE');
    if(t<prev)fail('KRAKEN_HISTORY_OUT_OF_ORDER');
    if(Number.isFinite(t)&&Number.isFinite(frozen)&&
       frozen-t>EARLY_MAX_MS)fail('KRAKEN_HISTORY_SAMPLE_TOO_OLD');
    if(!safePrice(sample?.price)||sample?.source!=='Kraken BTC/USD')
      fail('KRAKEN_HISTORY_UNRECOGNIZED_PUBLIC_SOURCE');
    prev=t;
   }
   const last=parse(p.sampleWindow.at(-1)?.time);
   if(Number.isFinite(last)&&Number.isFinite(spot)&&
      Math.abs(last-spot)>15000)
    warn('KRAKEN_HISTORY_LAST_SAMPLE_NOT_IDENTICAL_TO_SPOT');
  }
  if(!safeAsk(p.observedAsks?.YES)||!safeAsk(p.observedAsks?.NO))
   fail('EARLY_PUBLIC_ASK_INVALID');
 }else{
  if(p.model!==LATE)fail('LATE_MODEL_ID_MISMATCH');
  if(!safePrice(p.officialStrikeAtFreeze)||
   p.strikeTypeAtFreeze!=='greater_or_equal')
   fail('INVALID_PUBLIC_KALSHI_STRIKE_AT_FREEZE');
  if(!HASH.test(p.inputCommitment||'')||
    !HASH.test(p.sampleCommitment||''))
   fail('LATE_COMMITTED_INPUT_HASH_MISSING');
  if(!safeAsk(p.publicAskAtFreeze?.YES)||!safeAsk(p.publicAskAtFreeze?.NO))
   fail('LATE_PUBLIC_ASK_INVALID');
  const quote=parse(p.publicAskQuoteFetchedAt);
  if(!Number.isFinite(quote)||!Number.isFinite(frozen)||quote>frozen+1000)
   fail('LATE_PUBLIC_ASK_OBSERVED_AFTER_FREEZE');
  else if(frozen-quote>QUOTE_MAX_MS)
   fail('LATE_PUBLIC_ASK_STALE_AT_FREEZE');
  if(p.feeScheduleAtFreeze!==null&&p.feeScheduleAtFreeze!==undefined){
   const fees=p.feeScheduleAtFreeze;
   const t=parse(fees.refreshedAt);
   if(!Number.isFinite(t)||!Number.isFinite(frozen)||t>frozen+1000)
    fail('SERIES_FEE_METADATA_OBSERVED_AFTER_FREEZE');
   else if(frozen-t>300000)
    warn('FEE_METADATA_OLDER_THAN_FIVE_MINUTES');
   if(fees.source!=='KALSHI_PUBLIC_SERIES_API'||
      !Number.isFinite(fees.multiplier)||fees.multiplier<0)
    fail('SERIES_FEE_METADATA_INVALID');
  }
  warn('LATE_RAW_MODEL_INPUT_SAMPLES_REDACTED_NOT_RECONSTRUCTABLE');
 }
 return {issues:[...new Set(issues)],warnings:[...new Set(warnings)],
  inspectable:true,rawSampleTimesAvailable:kind==='early'};
}
function auditPublicInputTimes({early,late}){
 const cohort={};
 for(const [kind,journal] of Object.entries({early,late})){
  // Hash and whole journal chain must be trusted as internally self-
  // consistent before temporal metadata becomes meaningful.
  const frozen=verifiedJournal(journal,kind);
  const counts={
   model:kind==='early'?EARLY:LATE,
   frozen:0,directional:0,waits:0,
   publicProxyInspected:0,recordsWithTemporalIssues:0,
   timeIssues:[],warnings:[],publicRawSampleTimeInspectable:0,
   publicRawSampleTimeNotInspectable:0,
   sourceInputsIndependentlyVerified:false,
   independentlyQualified:0
  };
  for(const {e,p} of frozen){
   counts.frozen++;
   if(p.side===null)counts.waits++;else counts.directional++;
   const a=inspectFrozen({event:e,payload:p,kind});
   if(a.inspectable)counts.publicProxyInspected++;
   if(a.rawSampleTimesAvailable)counts.publicRawSampleTimeInspectable++;
   else counts.publicRawSampleTimeNotInspectable++;
   if(a.issues.length)counts.recordsWithTemporalIssues++;
   for(const code of a.issues)counts.timeIssues.push({
    marketId:p.marketId,sequence:e.sequence,code
   });
   for(const code of a.warnings)counts.warnings.push({
    marketId:p.marketId,sequence:e.sequence,code
   });
  }
  cohort[kind]=counts;
 }
 return {
  version:'CASH_PUBLIC_FORECAST_TEMPORAL_INTEGRITY_AUDIT_V1',
  checkedAt:new Date().toISOString(),
  status:cohort.early.recordsWithTemporalIssues+
   cohort.late.recordsWithTemporalIssues>0?
    'PUBLIC_FREEZE_INPUT_TIME_ISSUES_FOUND':'NO_PUBLIC_INPUT_TIME_CONTRADICTIONS_FOUND',
  cohorts:cohort,
  independentlyQualifiedCount:0,
  actualFillsVerified:0,ordersEnabled:false,
  caveat:'Public self-hashed timing consistency, not independently sourced market-time attestation. The late model has redacted raw input samples, so no complete past-only evaluation can be proven. Kraken single-exchange spot is not licensed Kalshi BRTI.'
 };
}
if(require.main===module){
 const [earlyPath,latePath]=process.argv.slice(2);
 if(!earlyPath||!latePath)
  throw Error('Usage: node forecast-time-integrity.js EARLY_JOURNAL LATE_JOURNAL');
 const report=auditPublicInputTimes({
  early:JSON.parse(fs.readFileSync(earlyPath,'utf8')),
  late:JSON.parse(fs.readFileSync(latePath,'utf8'))
 });
 for(const kind of ['early','late']){
  const c=report.cohorts[kind];
  console.log('CASH_TIME_'+kind.toUpperCase()+'_FORECASTS='+c.frozen);
  console.log('CASH_TIME_'+kind.toUpperCase()+'_ISSUES='+c.recordsWithTemporalIssues);
  console.log('CASH_TIME_'+kind.toUpperCase()+'_RAW_SAMPLES_INSPECTABLE='+
   c.publicRawSampleTimeInspectable);
 }
 console.log('CASH_TIME_AUDIT_STATUS='+report.status);
 console.log('CASH_TIME_AUDIT_QUALIFIED=0');
 if(report.status!=='NO_PUBLIC_INPUT_TIME_CONTRADICTIONS_FOUND')
  process.exitCode=1;
}
module.exports={inspectFrozen,auditPublicInputTimes};
