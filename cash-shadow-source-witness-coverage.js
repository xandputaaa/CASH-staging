'use strict';
/*
 * Separates live server SOURCE claims from GH-runner pre-expiry OBSERVATIONS.
 * A source-only YES/NO is NOT an externally witnessed prediction and NEVER
 * enters independent qualification, scoring, or the trading decision path.
 * This is a bounded, read-only collection coverage diagnostic.
 */
const {inspectShadowWitnessArchive}=require('./cash-shadow-witness-coverage');
const {verifyShadowJournal}=require('./cash-shadow-journal');
const VERSION='CASH_SHADOW_SOURCE_WITNESS_COVERAGE_V1';
function sourceWitnessCoverage({archiveRoot,sourceSnapshot=null,asOfMs}={}){
 if(!Number.isSafeInteger(asOfMs))throw Error('Coverage requires GitHub runner UTC');
 const archive=inspectShadowWitnessArchive(archiveRoot,{includeContracts:true});
 const base={
  version:VERSION,asOfRunner:new Date(asOfMs).toISOString(),
  status:'SOURCE_UNAVAILABLE',
  externalWitnessUniqueContracts:archive.uniqueContracts,
  externalWitnessDirectional:archive.uniqueDirectional,
  externalWitnessAbstentions:archive.uniqueAbstentions,
  externalWitnessDuplicateObservations:archive.repeatedObservations,
  sourceCommittedContracts:null,sourceClaimedDirectional:null,
  sourceClaimedAbstentions:null,
  sourceOnlyNotExternallyWitnessed:null,
  sourceOnlyDirectionalNotExternallyWitnessed:null,
  expiredSourceOnly:null,stillOpenSourceOnly:null,
  sourceCommitmentsMatchingWitness:null,
  independentlyQualifiedCount:0,scoredOutcomes:0,ordersAllowed:false,
  limitation:'Server-side source journal and as-of timestamps are not independent proof. Only GH-runner records observed before expiry are externally witnessed. A missed forecast cannot be witnessed retrospectively; source-only YES/NO must never inflate accuracy. No authenticated independent BRTI rule confirmation, exchange-trade fills or verified model edge.',
  sourceOnlySamples:[]
 };
 if(sourceSnapshot===null)return base;
 verifyShadowJournal(sourceSnapshot);
 const events=sourceSnapshot.events;
 const byMarket=new Map(events.map(e=>[e.marketId,e]));
 const externalByMarket=new Map(archive.contracts.map(e=>[e.marketId,e]));
 for(const w of archive.contracts){
  const src=byMarket.get(w.marketId);
  if(!src||src.hash!==w.frozenEventHash||
     src.side!==w.side||src.modelId!==w.modelId||
     src.asOfMs!==w.forecastAsOfMs||
     src.closesAtMs!==w.contractClosesAtMs)
    throw Error('Externally witnessed forecast conflicts with current source journal');
 }
 const sourceOnly=events.filter(e=>!externalByMarket.has(e.marketId));
 const due=sourceOnly.filter(e=>e.closesAtMs<=asOfMs);
 const active=sourceOnly.filter(e=>e.closesAtMs>asOfMs);
 const directional=events.filter(e=>e.side==='YES'||e.side==='NO');
 return {
  ...base,status:sourceOnly.length?'SOURCE_HAS_UNWITNESSED_COMMITMENTS':
   'ALL_SOURCE_COMMITMENTS_EXTERNALLY_OBSERVED',
  sourceCommittedContracts:events.length,
  sourceClaimedDirectional:directional.length,
  sourceClaimedAbstentions:events.length-directional.length,
  sourceOnlyNotExternallyWitnessed:sourceOnly.length,
  sourceOnlyDirectionalNotExternallyWitnessed:sourceOnly.filter(e=>
   e.side==='YES'||e.side==='NO').length,
  expiredSourceOnly:due.length,
  stillOpenSourceOnly:active.length,
  sourceCommitmentsMatchingWitness:archive.uniqueContracts,
  sourceOnlySamples:sourceOnly.slice(-10).map(e=>({
   marketId:e.marketId,side:e.side,frozenEventHash:e.hash,
   advertisedCloseAt:new Date(e.closesAtMs).toISOString(),
   externalObservation:'NONE_IN_ARCHIVE',
   closeState:e.closesAtMs<=asOfMs?'PAST_CLOSE':'OPEN_AT_COVERAGE_CHECK',
   accuracyEligible:false
  }))
 };
}
module.exports={sourceWitnessCoverage,VERSION};
