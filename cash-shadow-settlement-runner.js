'use strict';
/*
 * Scheduled GitHub runner. Reads only separate archived witness branch
 * plus publicly exported source commitments; Kalshi direct GET only after
 * expiry. Writes an artifact, never account data, orders or live forecasts.
 */
const fs=require('node:fs'),path=require('node:path');
const {getPublicSnapshot,URL}=require('./cash-shadow-public-observer-runner');
const {reconcileShadowPublicFinals}=require('./cash-shadow-settlement-reconciler');
const {inspectShadowExchangeArchive,joinExchangeEvidenceToSettlement}=
 require('./cash-shadow-exchange-archive');
async function runShadowSettlement({
 archiveRoot='shadow-witness-store',
 outFile='audit/shadow-public-final-recheck.json',
 fetchImpl=fetch,clock=()=>Date.now(),delay
}={}){
 let snapshot=null,sourceHash=null;
 try{
  const result=await getPublicSnapshot(URL,{fetchImpl});
  snapshot=result.snapshot;sourceHash=result.sha256;
 }catch{
  // The witness archive still counts; the missing source cannot be scored.
 }
 let report=await reconcileShadowPublicFinals({
  archiveRoot,sourceSnapshot:snapshot
 },{fetchImpl,clock,...(delay?{delay}:{})});
 const exchangeArchive=inspectShadowExchangeArchive(archiveRoot);
 report=joinExchangeEvidenceToSettlement(report,exchangeArchive,
  {sourceSnapshot:snapshot});
 report={
  ...report,sourceJournalSha256:sourceHash,
  sourceSnapshotAvailable:sourceHash!==null,
  sourceSnapshotWasIndependentlyAttested:false
 };
 const dest=path.resolve(outFile);
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.writeFileSync(dest,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log('CASH_SHADOW_SETTLEMENT_STATUS='+report.state);
 console.log('CASH_SHADOW_SETTLEMENT_UNIQUE_WITNESSED='+report.witnessedContracts);
 console.log('CASH_SHADOW_SETTLEMENT_WITNESSED_DIRECTIONAL='+report.witnessedDirectional);
 console.log('CASH_SHADOW_SETTLEMENT_WAITS='+report.witnessedWaits);
 console.log('CASH_SHADOW_SETTLEMENT_DIRECT_TWO_READ='+report.evaluatedDirectional);
 console.log('CASH_SHADOW_SETTLEMENT_PROVISIONAL_HITS='+report.provisionalHits);
 console.log('CASH_SHADOW_SETTLEMENT_PROVISIONAL_MISSES='+report.provisionalMisses);
 console.log('CASH_SHADOW_PUBLIC_EXCHANGE_ARCHIVED_MATCHES='+report.preExpiryPublicExchangeCorroboration.matchedUniqueContracts);
 console.log('CASH_SHADOW_PUBLIC_EXCHANGE_MATCHED_DIRECTIONAL='+report.preExpiryPublicExchangeCorroboration.matchedDirectionalContracts);
 console.log('CASH_SHADOW_PUBLIC_EXCHANGE_MATCHED_WAITS='+report.preExpiryPublicExchangeCorroboration.matchedWaits);
 console.log('CASH_SHADOW_PUBLIC_EXCHANGE_PROVISIONAL_HITS_WITH_MARKET_MATCH='+report.preExpiryPublicExchangeCorroboration.provisionalHitsWithPreExpiryMarketMatch);
 console.log('CASH_SHADOW_SETTLEMENT_INDEPENDENTLY_QUALIFIED=0');
 console.log('CASH_SHADOW_SETTLEMENT_ORDERS_ENABLED=false');
 return report;
}
if(require.main===module)
 runShadowSettlement().catch(()=>{
  console.error('CASH public shadow final-check failed closed; no accuracy claim');
  process.exitCode=1;
 });
module.exports={runShadowSettlement};
