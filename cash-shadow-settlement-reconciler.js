'use strict';
/*
 * CASH Model Lab: read-only post-expiry PUBLIC Kalshi result cross-check.
 *
 * A GitHub-observed pre-expiry forecast has already been archived in a
 * different branch. Every frozen hash must match the persisted source
 * journal BEFORE any public exchange request. Two separated reads of the
 * SAME Kalshi API are operational checks, NOT independent BRTI attestation.
 * No model promotion, live orders, or independently qualified statistics.
 */
const crypto=require('node:crypto');
const {inspectShadowWitnessArchive}=require('./cash-shadow-witness-coverage');
const {verifyShadowJournal}=require('./cash-shadow-journal');
const {fetchExchangeMarket}=require('./exchange-preexpiry-check');
const {marketEvidenceSnapshot}=require('./resolution-feed');
const {checkKalshiSettlement}=require('./kalshi-settlement-check');
const HASH=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const WAIT_MS=21000,MIN_FINAL_MS=20000,MAX_MARKETS=12;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const STATES=new Set(['TWO_READ_PUBLIC_NUMERIC_MATCH']);
function checkPublicShadowFinal(entry,frozen,market,receivedMs){
 const base={state:'PUBLIC_FINAL_NOT_CONFIRMED',
  publicEvidenceSha256:null,winner:null};
 if(!entry||!frozen||!Number.isSafeInteger(receivedMs)||
    !['YES','NO'].includes(entry.side)||frozen.marketId!==entry.marketId||
    frozen.hash!==entry.frozenEventHash||
    frozen.side!==entry.side||frozen.asOfMs!==entry.forecastAsOfMs||
    frozen.closesAtMs!==entry.contractClosesAtMs)
  return {...base,state:'FROZEN_COMMITMENT_MISMATCH'};
 const expiry=entry.contractClosesAtMs;
 if(receivedMs<=expiry+MIN_FINAL_MS)
  return {...base,state:'FINAL_READ_TOO_EARLY'};
 if(!market||typeof market!=='object')
  return {...base,state:'OFFICIAL_PUBLIC_API_UNAVAILABLE'};
 if(market.ticker!==entry.marketId||
    !Number.isFinite(Date.parse(market.close_time))||
    Date.parse(market.close_time)!==expiry)
  return {...base,state:'OFFICIAL_MARKET_OR_CLOSE_CONFLICT'};
 const selected=marketEvidenceSnapshot('Kalshi',{market},entry.marketId,null);
 const digest=HASH(selected);
 if(!['settled','finalized'].includes(String(market.status||'').toLowerCase())||
    market.is_provisional===true||
    !['yes','no'].includes(String(market.result||'').toLowerCase()))
  return {...base,state:'OFFICIAL_RESULT_NOT_FINAL',publicEvidenceSha256:digest};
 if(market.settlement_ts!==null&&market.settlement_ts!==undefined&&
    (!Number.isFinite(Date.parse(market.settlement_ts))||
      Date.parse(market.settlement_ts)<expiry))
  return {...base,state:'OFFICIAL_SETTLEMENT_TIME_CONFLICT',publicEvidenceSha256:digest};
 const audit=checkKalshiSettlement(market);
 if(audit.state!=='NUMERIC_MATCH')
  return {...base,state:'OFFICIAL_NUMERIC_RULE_UNCONFIRMED',publicEvidenceSha256:digest};
 if(audit.strikeCents!==Math.round(frozen.strikePrice*100))
  return {...base,state:'FROZEN_PUBLIC_STRIKE_MISMATCH',publicEvidenceSha256:digest};
 return {state:'PUBLIC_NUMERIC_FIELDS_MATCH',publicEvidenceSha256:digest,
  winner:market.result.toUpperCase()};
}
function reportBase(coverage,now){
 return {
  version:'CASH_SHADOW_PUBLIC_FINAL_RECHECK_V1',
  capturedAtRunner:Number.isFinite(now)?new Date(now).toISOString():null,
  state:'SOURCE_JOURNAL_UNAVAILABLE',
  provenance:'GITHUB_READONLY_DIRECT_PUBLIC_KALSHI_POSTEXPIRY',
  witnessedContracts:coverage.uniqueContracts,
  witnessedDirectional:coverage.uniqueDirectional,
  witnessedWaits:coverage.uniqueAbstentions,
  repeatedObservationsIgnored:coverage.repeatedObservations,
  evaluatedDirectional:0,provisionalHits:0,provisionalMisses:0,
  publicOutcomeChecksAttempted:0,sourceCommittedMatches:0,
  independentlyQualifiedCount:0,realMoneyOrdersAllowed:false,
  tradesPlaced:0,actualFillsVerified:0,
  rows:[],
  limitation:'GitHub clock witnesses public source claims only. Two reads of Kalshi public API are NOT independent exchange certification or CF Benchmarks BRTI replication. Retrospectively matching source strike to later Kalshi strike cannot independently prove the original pre-expiry BRTI reference. WAITs and duplicate run files never count as directional hits or misses. Not a trading recommendation.'
 };
}
async function reconcileShadowPublicFinals({
 archiveRoot,sourceSnapshot=null
},{
 fetchImpl=fetch,clock=()=>Date.now(),delay=pause,maxMarkets=MAX_MARKETS
}={}){
 if(!Number.isInteger(maxMarkets)||maxMarkets<1||maxMarkets>MAX_MARKETS)
  throw Error('Invalid settlement recheck market cap');
 const coverage=inspectShadowWitnessArchive(archiveRoot,{includeContracts:true});
 const start=clock();
 if(!Number.isSafeInteger(start))throw Error('Invalid GitHub settlement clock');
 const report=reportBase(coverage,start);
 if(!coverage.uniqueContracts){report.state='NO_ARCHIVED_WITNESSES';return report}
 if(!sourceSnapshot){
  report.rows=coverage.contracts.map(c=>({
   marketId:c.marketId,side:c.side,firstWitnessRunId:c.firstWitnessRunId,
   frozenEventHash:c.frozenEventHash,contractClosesAtMs:c.contractClosesAtMs,
   state:c.side==='WAIT'?'WITNESSED_WAIT_NOT_SCORED':'SOURCE_JOURNAL_UNAVAILABLE'
  }));
  return report;
 }
 // Fail the entire inspection on corrupted self-hashes, never score a subset.
 verifyShadowJournal(sourceSnapshot);
 const frozenByHash=new Map(sourceSnapshot.events.map(e=>[e.hash,e]));
 const items=coverage.contracts.slice().sort((a,b)=>
  b.contractClosesAtMs-a.contractClosesAtMs||a.marketId.localeCompare(b.marketId));
 const rows=items.map(c=>{
  const frozen=frozenByHash.get(c.frozenEventHash);
  const valid=frozen&&frozen.marketId===c.marketId&&frozen.side===c.side&&
   frozen.asOfMs===c.forecastAsOfMs&&frozen.closesAtMs===c.contractClosesAtMs;
  return {
   marketId:c.marketId,side:c.side,
   firstWitnessRunId:c.firstWitnessRunId,
   frozenEventHash:c.frozenEventHash,contractClosesAtMs:c.contractClosesAtMs,
   firstObservedAtRunnerMs:c.firstObservedAtRunnerMs,
   state:c.side==='WAIT'?'WITNESSED_WAIT_NOT_SCORED':
    !valid?'FROZEN_COMMITMENT_NOT_FOUND':
    start<=c.contractClosesAtMs+MIN_FINAL_MS?'NOT_YET_PAST_FINAL_CHECK_WINDOW':
    'READY_FOR_PUBLIC_FINAL_RECHECK',
   ...(valid?{_frozen:frozen}:{})
  };
 });
 report.sourceCommittedMatches=rows.filter(r=>Boolean(r._frozen)).length;
 const candidates=rows.filter(r=>r.state==='READY_FOR_PUBLIC_FINAL_RECHECK');
 for(const r of candidates.slice(maxMarkets))r.state='RECHECK_RUN_CAP_NOT_ATTEMPTED';
 const toCheck=candidates.slice(0,maxMarkets);
 const read=async c=>{
  try{return await fetchExchangeMarket(c.marketId,{fetchImpl,clock})}
  catch{return {market:null,receivedMs:clock()}}
 };
 const first=await Promise.all(toCheck.map(x=>read(x)));
 const firstResult=first.map((f,i)=>{
  const row=toCheck[i];
  return checkPublicShadowFinal(row,row._frozen,f.market,f.receivedMs);
 });
 const passes=firstResult.map((r,i)=>r.state==='PUBLIC_NUMERIC_FIELDS_MATCH'?i:-1)
  .filter(i=>i>=0);
 for(let i=0;i<toCheck.length;i++){
  const row=toCheck[i],firstCheck=firstResult[i];
  row.state=firstCheck.state;
  if(firstCheck.publicEvidenceSha256)row.publicEvidenceSha256=firstCheck.publicEvidenceSha256;
 }
 if(passes.length){
  // Exactly one waiting interval, even for a batch of markets.
  await delay(WAIT_MS);
  const second=await Promise.all(passes.map(i=>read(toCheck[i])));
  for(let n=0;n<passes.length;n++){
   const i=passes[n],row=toCheck[i],
    check=checkPublicShadowFinal(row,row._frozen,
      second[n].market,second[n].receivedMs);
   const delta=second[n].receivedMs-first[i].receivedMs;
   if(!Number.isFinite(delta)||delta<MIN_FINAL_MS){
    row.state='OFFICIAL_PUBLIC_READS_TOO_CLOSE';
   }else if(check.state!=='PUBLIC_NUMERIC_FIELDS_MATCH'||
      check.publicEvidenceSha256!==firstResult[i].publicEvidenceSha256||
      check.winner!==firstResult[i].winner){
    row.state='OFFICIAL_PUBLIC_RESULT_CHANGED_OR_UNAVAILABLE';
   }else{
    row.state='TWO_READ_PUBLIC_NUMERIC_MATCH';
    row.publishedWinner=check.winner;
    row.provisionalOutcome=row.side===check.winner?'HIT':'MISS';
    row.firstReadAt=new Date(first[i].receivedMs).toISOString();
    row.secondReadAt=new Date(second[n].receivedMs).toISOString();
    row.readSeparationMs=delta;
   }
  }
 }
 for(const row of rows)delete row._frozen;
 report.rows=rows;
 report.publicOutcomeChecksAttempted=toCheck.length;
 report.evaluatedDirectional=rows.filter(r=>STATES.has(r.state)).length;
 report.provisionalHits=rows.filter(r=>r.provisionalOutcome==='HIT').length;
 report.provisionalMisses=rows.filter(r=>r.provisionalOutcome==='MISS').length;
 report.state=report.evaluatedDirectional?'PUBLIC_NUMERIC_RESULTS_PROVISIONAL':
  'NO_TWO_READ_DIRECTIONAL_RESULTS';
 return report;
}
module.exports={checkPublicShadowFinal,reconcileShadowPublicFinals,WAIT_MS};
