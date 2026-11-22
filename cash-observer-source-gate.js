'use strict';
// GitHub Actions acceptance gate for genuine scheduled and trusted
// scheduled-parent research witnesses. Success means export retrieval worked,
// NOT independent prediction timing, model accuracy, profitability, or fills.
const fs=require('node:fs');
function count(x){return Number.isSafeInteger(x)&&x>=0}
function checkPreexpiry(s){
 if(!s||s.version!=='CASH_SCHEDULED_WITNESS_WATCH_V1'||
    s.independentQualifiedCount!==0||s.ordersEnabled!==false||
    !count(s.attempts)||!count(s.validProbes)||!count(s.invalidProbes)||
    s.validProbes+s.invalidProbes!==s.attempts)
  return {ok:false,reason:'INVALID_WITNESS_SUMMARY'};
 const stats={};
 for(const model of ['early','late']){
  const x=s.eligibilityPolls?.[model];
  if(!x||!['validSourcePolls','unavailableSourcePolls',
    'invalidSourcePolls'].every(k=>count(x[k]))||
    x.validSourcePolls+x.unavailableSourcePolls+x.invalidSourcePolls>s.validProbes)
   return {ok:false,reason:'INVALID_SOURCE_DIAGNOSTICS'};
  stats[model]={valid:x.validSourcePolls,
   unavailable:x.unavailableSourcePolls,invalid:x.invalidSourcePolls};
 }
 if(stats.early.valid===0)return {ok:false,reason:'EARLY_EXPORT_NOT_VERIFIED'};
 if(stats.late.valid===0)return {ok:false,reason:'LATE_EXPORT_NOT_VERIFIED'};
 return {ok:true,reason:'BOTH_EXPORTS_READABLE',stats};
}
function checkShadow(s){
 if(!s||s.version!=='CASH_SHADOW_GITHUB_PUBLIC_OBSERVATION_V1'||
    s.independentlyQualifiedCount!==0||s.realMoneyOrdersAllowed!==false||
    !count(s.observedBeforeExpiryCount)||
    !Array.isArray(s.observedForecasts)||
    s.observedBeforeExpiryCount!==s.observedForecasts.length)
  return {ok:false,reason:'INVALID_SHADOW_WITNESS'};
 if(s.status==='PUBLIC_SOURCE_UNAVAILABLE_OR_INVALID')
  return {ok:false,reason:'SHADOW_EXPORT_UNAVAILABLE'};
 if(!['OBSERVED_PREEXPIRY','NO_ELIGIBLE_PREEXPIRY_RECORDS'].includes(s.status)||
    (s.status==='OBSERVED_PREEXPIRY'&&s.observedBeforeExpiryCount===0)||
    (s.status==='NO_ELIGIBLE_PREEXPIRY_RECORDS'&&s.observedBeforeExpiryCount!==0)||
    !/^[a-f0-9]{64}$/.test(s.sourceSha256||'')||
    !Number.isFinite(Date.parse(s.observedAtRunner||'')))
  return {ok:false,reason:'SHADOW_SOURCE_UNVERIFIED'};
 return {ok:true,reason:s.status==='OBSERVED_PREEXPIRY'
   ?'SHADOW_EXPORT_READABLE_WITNESS':'SHADOW_EXPORT_READABLE_NO_ELIGIBLE'};
}
function run(mode,{root='witness',read=fs.readFileSync,log=console.log}={}){
 if(!['preexpiry','shadow'].includes(mode))
  return {ok:false,reason:'UNSUPPORTED_GATE_MODE'};
 const filename=root+'/'+(mode==='preexpiry'
  ?'observer-run-summary.json':'shadow-public-observation.json');
 let data;
 try{data=JSON.parse(read(filename,'utf8'))}
 catch{return {ok:false,reason:'SOURCE_DIAGNOSTIC_MISSING_OR_INVALID'}}
 const result=mode==='preexpiry'?checkPreexpiry(data):checkShadow(data);
 log('CASH_SOURCE_GATE_MODE='+mode.toUpperCase());
 log('CASH_SOURCE_GATE='+(result.ok?'PROTECTED_EXPORTS_READABLE':'BLOCKED'));
 log('CASH_SOURCE_GATE_REASON='+result.reason);
 if(result.ok&&mode==='preexpiry')
  for(const [name,x] of Object.entries(result.stats))
   log('CASH_SOURCE_GATE_'+name.toUpperCase()+'_VALID_POLLS='+x.valid+
     ', unavailable='+x.unavailable+', invalid='+x.invalid);
 log('CASH_SOURCE_GATE_INDEPENDENTLY_QUALIFIED=0');
 log('CASH_SOURCE_GATE_REAL_ORDERS=false');
 return result;
}
if(require.main===module){
 const result=run(process.argv[2]);
 if(!result.ok)process.exitCode=1;
}
module.exports={checkPreexpiry,checkShadow,run};
