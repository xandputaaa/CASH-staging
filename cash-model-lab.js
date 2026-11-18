'use strict';
/*
 * CASH Model Lab: isolated, offline candidate evaluation.
 * No external package dependency, market feed, order routing, or model promotion.
 * Accepts immutable same-market candidate forecast rows and reuses evidence gates.
 */
const {auditBenchmarkInputs}=require('./benchmark-evidence-gates');
const MODEL_LAB_VERSION='CASH_MODEL_LAB_SHADOW_V1';
function evaluateShadowCandidate({baseline,candidate,candidateId}={}){
 if(typeof candidateId!=='string'||!/^CASH_SHADOW_[A-Z0-9_]{3,64}$/.test(candidateId))
  throw Error('Candidate must have an explicit shadow model ID');
 const audit=auditBenchmarkInputs({baseline,candidate});
 return {...audit,modelLabVersion:MODEL_LAB_VERSION,candidateId,
  mode:'OFFLINE_SHADOW_RESEARCH',candidatePromoted:false,
  baselineModelUnchanged:true,realMoneyOrdersAllowed:false,
  fullEligibleMarketDenominatorVerified:false,
  note:'Offline descriptive candidate comparison only. Never replace frozen CASH models, infer missing chronological markets, or trade on this output.'};
}
module.exports={evaluateShadowCandidate,MODEL_LAB_VERSION};
