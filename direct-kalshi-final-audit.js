'use strict';
/*
 * GitHub-only second-source final Kalshi result check.
 * Checks publicly published final payout after the original CASH journal
 * has already matched an off-server pre-expiry event hash. This NEVER
 * upgrades independent qualification, turns quotes into fills or trades.
 * Two reads from the SAME official public API are not independent sources,
 * cryptographic signatures, or proof of CF Benchmarks calculation.
 */
const {createHash}=require('node:crypto');
const {fetchExchangeMarket}=require('./exchange-preexpiry-check');
const {marketEvidenceSnapshot}=require('./resolution-feed');
const {checkKalshiSettlement}=require('./kalshi-settlement-check');
const MARKET=/^KXBTC15M-[A-Za-z0-9-]{6,70}$/;
const HASH=/^[a-f0-9]{64}$/;
const MIN_SEPARATION_MS=20000,DEFAULT_MAX_MARKETS=12;
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const time=x=>Date.parse(x);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function checkDirectFinal(entry,market,receivedMs){
 const base={state:'DIRECT_FINAL_NOT_VERIFIED',
  source:'KALSHI_DIRECT_PUBLIC_MARKET_GET',
  checkedAt:Number.isFinite(receivedMs)?new Date(receivedMs).toISOString():null,
  independentlyQualified:false,actualFillVerified:false,ordersEnabled:false};
 if(!entry||!MARKET.test(entry.marketId||'')||
  !['YES','NO'].includes(entry.witnessedSide)||
  !['OBSERVED_DIRECTIONAL_HIT','OBSERVED_DIRECTIONAL_MISS'].includes(entry.state)||
  !['YES','NO'].includes(entry.publicWinner)||
  !HASH.test(entry.settlementEvidenceSha256||'')||
  !Number.isFinite(time(entry.contractClosesAt))||
  !Number.isFinite(receivedMs))
  return {...base,state:'INVALID_WITNESSED_SETTLEMENT_INPUT'};
 const expiry=time(entry.contractClosesAt);
 if(receivedMs<=expiry+MIN_SEPARATION_MS)
  return {...base,state:'DIRECT_FINAL_CHECK_TOO_EARLY'};
 if(!market||typeof market!=='object')
  return {...base,state:'DIRECT_FINAL_API_UNAVAILABLE'};
 if(market.ticker!==entry.marketId||
    !Number.isFinite(time(market.close_time))||
    time(market.close_time)!==expiry)
  return {...base,state:'DIRECT_FINAL_MARKET_OR_CLOSE_MISMATCH'};
 const selected=marketEvidenceSnapshot('Kalshi',{market},entry.marketId,null);
 const selectedHash=sha(selected);
 if(!['settled','finalized'].includes(String(market.status||'').toLowerCase())||
    market.is_provisional===true||
    !['yes','no'].includes(String(market.result||'').toLowerCase()))
  return {...base,state:'DIRECT_FINAL_NOT_YET_SETTLED',
   directPublicEvidenceSha256:selectedHash};
 if(market.settlement_ts!==null&&market.settlement_ts!==undefined&&
    (!Number.isFinite(time(market.settlement_ts))||
     time(market.settlement_ts)<expiry))
  return {...base,state:'DIRECT_FINAL_SETTLEMENT_TIME_CONFLICT',
   directPublicEvidenceSha256:selectedHash};
 const numeric=checkKalshiSettlement(market);
 if(numeric.state!=='NUMERIC_MATCH')
  return {...base,state:'DIRECT_FINAL_NUMERIC_RULE_UNCONFIRMED',
   directPublicEvidenceSha256:selectedHash};
 const frozenStrike=Math.round(numeric.strikeCents);
 if(!Number.isInteger(frozenStrike))
  return {...base,state:'DIRECT_FINAL_STRIKE_UNCONFIRMED',
   directPublicEvidenceSha256:selectedHash};
 const winner=market.result.toUpperCase();
 if(winner!==entry.publicWinner)
  return {...base,state:'DIRECT_FINAL_WINNER_CONFLICT',
   directWinner:winner,directPublicEvidenceSha256:selectedHash,
   publicWinnerInServerJournal:entry.publicWinner};
 const hashMatches=selectedHash===entry.settlementEvidenceSha256;
 return {...base,state:'DIRECT_FINAL_NUMERIC_MATCH',
  directWinner:winner,publishedCloseTime:market.close_time,
  publicStrikeCents:numeric.strikeCents,
  publicFinalCents:numeric.finalCents,
  directPublicEvidenceSha256:selectedHash,
  matchesServerJournalPublicFields:hashMatches,
  // The original server's final evidence may differ from a later API read
  // solely because metadata changed: preserve this mismatch for an auditor.
  sourceFieldDifference:!hashMatches,
  finalResultCorroborated:true};
}
async function auditDirectFinal(report,{
 fetchImpl=fetch,clock=()=>Date.now(),delay=pause,maxMarkets=DEFAULT_MAX_MARKETS
}={}){
 if(report?.version!=='CASH_PROVISIONAL_EXTERNAL_WITNESS_RECONCILIATION_V1'||
  report.independentQualifiedCount!==0||report.ordersEnabled!==false||
  !Array.isArray(report.matched)||
  !Number.isInteger(maxMarkets)||maxMarkets<1||maxMarkets>32)
  throw Error('Unsafe provisional witness report');
 const eligible=report.matched.filter(x=>
  ['OBSERVED_DIRECTIONAL_HIT','OBSERVED_DIRECTIONAL_MISS'].includes(x.state)&&
  ['YES','NO'].includes(x.witnessedSide)&&
  MARKET.test(x.marketId||'')&&
  Number.isFinite(time(x.contractClosesAt))&&
  ['YES','NO'].includes(x.publicWinner)&&
  HASH.test(x.settlementEvidenceSha256||''));
 const ordered=eligible.slice().sort((a,b)=>time(b.contractClosesAt)-time(a.contractClosesAt));
 // Same market may occur in BOTH models, with contradictory internal
 // reported winners. Never let Map replacement decide which result gets
 // checked. Keep every cohort and select a matching prior claim using the
 // DIRECT first API observation; then independently compare all peers.
 const cohorts=new Map();
 for(const item of ordered){
  if(!cohorts.has(item.marketId))cohorts.set(item.marketId,[]);
  cohorts.get(item.marketId).push(item);
 }
 const unique=[...cohorts].slice(0,maxMarkets).map(([marketId,entries])=>({
  marketId,entries
 }));
 const read=async marketId=>{
  try{return await fetchExchangeMarket(marketId,{fetchImpl,clock})}
  catch{return {market:null,receivedMs:clock()}}
 };
 const first=await Promise.all(unique.map(x=>read(x.marketId)));
 const chosen=unique.map((group,i)=>group.entries.find(item=>
  checkDirectFinal(item,first[i].market,first[i].receivedMs).state===
   'DIRECT_FINAL_NUMERIC_MATCH')||group.entries[0]);
 const provisional=unique.map((x,i)=>checkDirectFinal(
  chosen[i],first[i].market,first[i].receivedMs));
 const valid=provisional.map((x,i)=>x.state==='DIRECT_FINAL_NUMERIC_MATCH'?i:-1).filter(i=>i>=0);
 const direct=new Map();
 for(let i=0;i<unique.length;i++){
  const entry=unique[i],s=provisional[i];
  if(s.state!=='DIRECT_FINAL_NUMERIC_MATCH'){
   direct.set(entry.marketId,s);
  }
 }
 if(valid.length){
  // Responses may still come from a cached exchange edge; two matching
  // reads merely increase operational assurance, not independent proof.
  await delay(MIN_SEPARATION_MS+1000);
  const second=await Promise.all(valid.map(i=>read(unique[i].marketId)));
  for(let j=0;j<valid.length;j++){
   const i=valid[j],old=provisional[i],
    current=checkDirectFinal(chosen[i],second[j].market,second[j].receivedMs),
    separation=second[j].receivedMs-first[i].receivedMs;
   let finished;
   if(!Number.isFinite(separation)||separation<MIN_SEPARATION_MS){
    finished={...current,state:'DIRECT_FINAL_READS_TOO_CLOSE'};
   }else if(current.state!=='DIRECT_FINAL_NUMERIC_MATCH'||
      current.directPublicEvidenceSha256!==old.directPublicEvidenceSha256){
    finished={...current,state:'DIRECT_FINAL_PUBLIC_SOURCE_CHANGED',
     firstReadSha256:old.directPublicEvidenceSha256,
     secondReadSha256:current.directPublicEvidenceSha256||null};
   }else{
    finished={...current,state:current.matchesServerJournalPublicFields?
     'DIRECT_FINAL_TWO_READ_JOURNAL_HASH_MATCH':
     'DIRECT_FINAL_TWO_READ_NUMERIC_MATCH_FIELDS_DIFFER',
     firstReadAt:old.checkedAt,secondReadAt:current.checkedAt,
     sourceReadSeparationMs:separation,
     finalResultCorroborated:true};
   }
   direct.set(unique[i].marketId,finished);
  }
 }
 const confirmedKinds=new Set([
  'DIRECT_FINAL_TWO_READ_JOURNAL_HASH_MATCH',
  'DIRECT_FINAL_TWO_READ_NUMERIC_MATCH_FIELDS_DIFFER'
 ]);
 const matched=report.matched.map(row=>{
  if(!['OBSERVED_DIRECTIONAL_HIT','OBSERVED_DIRECTIONAL_MISS'].includes(row.state))
   return {...row,directFinalStatus:'NOT_A_SCORED_DIRECTIONAL_SETTLEMENT'};
  const external=direct.get(row.marketId);
  if(!external)return {...row,directFinalStatus:'DIRECT_FINAL_NOT_CHECKED'};
  // The same Kalshi contract can have both an early and a late research
  // side. One direct HTTP fetch can be shared, but EVERY model's internal
  // public winner/strike/expiry must be compared independently.
  if(confirmedKinds.has(external.state)){
   if(external.directWinner!==row.publicWinner||
      time(external.publishedCloseTime)!==time(row.contractClosesAt))
    return {...row,directFinalStatus:'DIRECT_FINAL_COHORT_RESULT_OR_CLOSE_CONFLICT',
     directFinal:{...external,state:'DIRECT_FINAL_COHORT_RESULT_OR_CLOSE_CONFLICT',
      finalResultCorroborated:false}};
   const same=external.directPublicEvidenceSha256===row.settlementEvidenceSha256;
   const status=same?'DIRECT_FINAL_TWO_READ_JOURNAL_HASH_MATCH':
     'DIRECT_FINAL_TWO_READ_NUMERIC_MATCH_FIELDS_DIFFER';
   return {...row,directFinalStatus:status,
    directFinal:{...external,state:status,matchesServerJournalPublicFields:same,
     sourceFieldDifference:!same}};
  }
  return {...row,directFinalStatus:external.state,directFinal:external};
 });
 const validSet=new Set([
  'DIRECT_FINAL_TWO_READ_JOURNAL_HASH_MATCH',
  'DIRECT_FINAL_TWO_READ_NUMERIC_MATCH_FIELDS_DIFFER'
 ]);
 const tally=kind=>{
  const subset=matched.filter(x=>x.model===(kind==='early'?
   'KXBTC15M_SETTLEMENT_EARLY_V3':'KXBTC15M_LATE_CHECKPOINT_SHADOW_V1')&&
   ['OBSERVED_DIRECTIONAL_HIT','OBSERVED_DIRECTIONAL_MISS'].includes(x.state));
  return {
   witnessedAndInternallyScored:subset.length,
   secondSourceTwoReadConfirmed:subset.filter(x=>validSet.has(x.directFinalStatus)).length,
   publicFieldsHashMatchesServer:subset.filter(x=>
    x.directFinalStatus==='DIRECT_FINAL_TWO_READ_JOURNAL_HASH_MATCH').length,
   numericAgreesButSourceFieldsDiffer:subset.filter(x=>
    x.directFinalStatus==='DIRECT_FINAL_TWO_READ_NUMERIC_MATCH_FIELDS_DIFFER').length,
   contestedOrUnavailable:subset.filter(x=>!validSet.has(x.directFinalStatus)).length,
   // Accuracy is NOT inferred from only the externally checked subset.
   independentlyQualified:0
  };
 };
 return {...report,
  version:'CASH_PROVISIONAL_EXTERNAL_WITNESS_RECONCILIATION_V1',
  matched,
  secondSourceFinalAudit:{
   version:'CASH_DIRECT_KALSHI_POST_EXPIRY_TWO_READ_AUDIT_V1',
   uniqueMarketsAttempted:unique.length,
   maxUniqueMarketsPerRun:maxMarkets,
   early:tally('early'),late:tally('late'),
   independentQualifiedCount:0,executionVerified:false,ordersEnabled:false,
   note:'Two separated read-only GET requests directly from Kalshi public market API on GitHub runner. Confirms published numeric payout, but is not a cryptographically independent audit or CF BRTI source replication; unchanged vs changed exchange public fields hashes reported separately. Does not revise original forecast hit/miss/PnL denominators. No actual fills.'
  },
  independentQualifiedCount:0,executionVerified:false,ordersEnabled:false};
}
module.exports={checkDirectFinal,auditDirectFinal,MIN_SEPARATION_MS};
