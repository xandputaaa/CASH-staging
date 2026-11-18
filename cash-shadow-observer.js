'use strict';
/*
 * Read-only independent runner clock filter for public shadow journal snapshots.
 * An observation is provisional; it does not establish exchange truth, model
 * calibration, source provenance or independent qualification.
 */
const {verifyShadowJournal}=require('./cash-shadow-journal');
function observeShadowSnapshot(snapshot,{observedAtMs,runId='UNKNOWN'}={}){
 if(!Number.isFinite(observedAtMs))throw Error('Runner observation clock required');
 verifyShadowJournal(snapshot);
 const evidence=[];
 for(const e of snapshot.events){
  if(e.asOfMs>observedAtMs||e.recordedAtMs>observedAtMs||
   e.closesAtMs-observedAtMs<=15000)continue;
  evidence.push(Object.freeze({
   modelId:e.modelId,marketId:e.marketId,side:e.side,
   frozenEventHash:e.hash,observedAtRunnerMs:observedAtMs,
   forecastAsOfMs:e.asOfMs,contractClosesAtMs:e.closesAtMs,
   source:'UNVERIFIED_PUBLIC_SHADOW_JOURNAL',
   independentQualification:false
  }));
 }
 return Object.freeze({
  version:'CASH_SHADOW_OFFSERVER_OBSERVATION_V1',
  observedAtRunnerMs:observedAtMs,githubRunId:String(runId),
  observedForecasts:evidence,
  observedBeforeExpiryCount:evidence.length,
  independentlyQualifiedCount:0,realMoneyOrdersAllowed:false,
  note:'Runner clock records a pre-expiry observation of source claims; does not independently establish Kalshi strike, BRTI, settlement, or predictive edge.'
 });
}
module.exports={observeShadowSnapshot};
