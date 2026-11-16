'use strict';
/*
 * CASH Shadow Monitor v1
 * Session-only, public market-quote baseline. No trades, user accounts,
 * model predictions, official forecasting validation or durable storage.
 * A SHA256 link detects accidental history edits within an exported session;
 * it does NOT authenticate clock times or provide tamper-proof evidence.
 */
const {createHash}=require('node:crypto');
const {verifyChain}=require('./audit-journal');
const {proposeSpotMomentum,toContractSide,isValidSpotCandidate}=require('./spot-momentum');
const MIN_LEAD_MS=60000,MAX_RECORDS=300,MAX_EVENTS=650;
const VALID_VENUES=new Set(['Kalshi','Polymarket']);
const isPrice=n=>Number.isFinite(n)&&n>0&&n<1;
const ISO=ms=>new Date(ms).toISOString();
function chooseMarketBaseline(quote){
 if(!quote||!VALID_VENUES.has(quote.venue)||!['live','partial'].includes(quote.status))return null;
 let first,second,firstSide,secondSide;
 if(quote.venue==='Kalshi'){
  first=quote.yesAsk;second=quote.noAsk;firstSide='YES';secondSide='NO';
 }else{
  first=quote.upAsk;second=quote.downAsk;firstSide='UP';secondSide='DOWN';
 }
 if(!isPrice(first)||!isPrice(second)||Math.abs(first-second)<0.000001)return null;
 const sum=first+second;
 const favored=first>second;
 return {
  side:favored?firstSide:secondSide,
  normalizedMarketShare:(favored?first:second)/sum,
  observedAsks:{[firstSide]:first,[secondSide]:second},
  source:quote.venue==='Kalshi'?'Kalshi public YES/NO asks':'Polymarket CLOB public UP/DOWN buy asks'
 };
}
function createShadowMonitor({quotes,results,clock=()=>Date.now(),minimumLeadMs=MIN_LEAD_MS,
 maxRecords=MAX_RECORDS,maxEvents=MAX_EVENTS,journal=null,spot=null}={}){
 if(!quotes||!results)throw Error('Shadow monitor needs read-only quote and result providers');
 const bootAt=ISO(clock()),observations=[],events=[],ids=new Set();
 let lastHash='GENESIS',inflight=null,scanCount=0,lastScanAt=null,lastError=null,pendingCursor=0,totalSettlementChecks=0;
 function loadSavedHistory(){
  const saved=journal?.events||[];
  verifyChain(saved,{limit:maxEvents});
  for(const e of saved){
   const x=e.payload;
   if(e.type==='CAPTURE'){
    const acceptedSide=x.venue==='Kalshi'?['YES','NO']:x.venue==='Polymarket'?['UP','DOWN']:[];
    if(typeof x.marketId!=='string'||x.id!==x.venue+':'+x.marketId
      ||ids.has(x.id)||observations.length>=maxRecords
      ||x.baselineName!=='PUBLIC_MARKET_FAVORED_ASK_V1'
      ||!acceptedSide.includes(x.baselineSide)
      ||!Number.isFinite(x.normalizedMarketShare)||x.normalizedMarketShare<=0||x.normalizedMarketShare>=1
      ||!x.observedAsks||!Object.values(x.observedAsks).every(isPrice)
      ||!Number.isFinite(Date.parse(x.endTime))||!Number.isFinite(Date.parse(x.serverCapturedAt))
      ||!Number.isFinite(Date.parse(x.quoteFetchedAt))
      ||!Number.isFinite(x.leadMs)||x.leadMs<minimumLeadMs
      ||(x.spotCandidate!==undefined&&x.spotCandidate!==null&&!isValidSpotCandidate(x.spotCandidate,x.venue,Date.parse(x.serverCapturedAt))))
      throw Error('Saved capture is semantically invalid');
    observations.push({...x,status:'PENDING',winner:null,outcomeSource:null,
      outcomeCheckedAt:null,outcomeSettledAt:null,lastCheckAt:null,settlementAttempts:0,pendingReason:null,captureSequence:e.sequence});
    ids.add(x.id);
   }else if(e.type==='RESOLUTION'){
    const record=observations.find(o=>o.id===x.id),allowed=record?.venue==='Kalshi'?['YES','NO','VOID']:['UP','DOWN','VOID'];
    if(!record||record.status!=='PENDING'||x.venue!==record.venue||x.marketId!==record.marketId
      ||!allowed.includes(x.winner)||typeof x.source!=='string'
      ||!Number.isFinite(Date.parse(x.checkedAt)))
      throw Error('Saved resolution is semantically invalid');
    record.status=x.winner==='VOID'?'VOID':x.winner===record.baselineSide?'CORRECT':'INCORRECT';
    record.winner=x.winner;record.outcomeSource=x.source;
    record.outcomeCheckedAt=x.checkedAt;record.outcomeSettledAt=x.settledAt||null;
    record.resolutionSequence=e.sequence;
   }
   events.push(e);lastHash=e.hash;
  }
 }
 loadSavedHistory();

 function append(type,payload){
  if(events.length>=maxEvents)return null;
  const e={sequence:events.length+1,type,recordedAt:ISO(clock()),payload,previousHash:lastHash};
  e.hash=createHash('sha256').update(JSON.stringify(e)).digest('hex');
  if(journal)journal.append(e); // Durable append must succeed before state changes
  lastHash=e.hash;events.push(e);return e;
 }
 function capture(quote){
  const now=clock(),baseline=chooseMarketBaseline(quote);
  if(!baseline||observations.length>=maxRecords||events.length>=maxEvents-1)return null;
  const marketId=quote.marketId,quoteAt=Date.parse(quote.fetchedAt),end=Date.parse(quote.endTime);
  const id=quote.venue+':'+marketId;
  if(typeof marketId!=='string'||marketId.length<6||marketId.length>100||ids.has(id)
     ||!Number.isFinite(quoteAt)||!Number.isFinite(end)
     ||quoteAt>now+2000||now-quoteAt>12000||end-now<minimumLeadMs
     ||(quote.venue==='Polymarket'&&!/^btc-updown-5m-\d{9,12}$/.test(quote.slug||'')))return null;
  let spotCandidate=null;
  if(spot){try{const raw=proposeSpotMomentum(spot.view(),now);
   if(raw)spotCandidate={...raw,predictedContractSide:toContractSide(quote.venue,raw.predictedDirection)};
  }catch{}}
  const data={
   id,venue:quote.venue,marketId,slug:quote.venue==='Polymarket'?quote.slug:null,
   endTime:quote.endTime,quoteFetchedAt:quote.fetchedAt,serverCapturedAt:ISO(now),
   leadMs:end-now,baselineName:'PUBLIC_MARKET_FAVORED_ASK_V1',
   baselineSide:baseline.side,normalizedMarketShare:baseline.normalizedMarketShare,
   observedAsks:baseline.observedAsks,quoteSource:baseline.source,spotCandidate
  };
  const event=append('CAPTURE',data);
  if(!event)return null;
  const record={...data,status:'PENDING',winner:null,outcomeSource:null,
   outcomeCheckedAt:null,outcomeSettledAt:null,lastCheckAt:null,settlementAttempts:0,pendingReason:null,captureSequence:event.sequence};
  observations.push(record);ids.add(id);
  return record;
 }
 async function resolvePending(){
  let checked=0,changed=0;
  // Round robin prevents the oldest unresolved markets starving newer expired ones.
  const eligible=observations.filter(x=>x.status==='PENDING'&&Date.parse(x.endTime)<=clock());
  const count=Math.min(3,eligible.length);
  const start=eligible.length?pendingCursor%eligible.length:0;
  const candidates=Array.from({length:count},(_,i)=>eligible[(start+i)%eligible.length]);
  pendingCursor=eligible.length?(start+count)%eligible.length:0;
  for(const record of candidates){
   if(events.length>=maxEvents)break;
   checked++;totalSettlementChecks++;
   record.settlementAttempts=(record.settlementAttempts||0)+1;
   record.lastCheckAt=ISO(clock());
   try{
    const resolution=await results.lookup({venue:record.venue,marketId:record.marketId,slug:record.slug});
    if(resolution?.status==='pending'){record.pendingReason=String(resolution.reason||'No finalized public result yet').slice(0,160);continue}
    const allowed=record.venue==='Kalshi'?['YES','NO','VOID']:['UP','DOWN','VOID'];
    if(resolution?.status!=='verified'||resolution.marketId!==record.marketId
      ||resolution.venue!==record.venue||!allowed.includes(resolution.winner)){
      record.pendingReason='Unrecognized or contradictory result response';continue;
    }
    const result={
     id:record.id,marketId:record.marketId,venue:record.venue,
     winner:resolution.winner,source:resolution.source||'public official market',
     checkedAt:resolution.checkedAt||ISO(clock()),
     settledAt:resolution.settledAt||null
    };
    const event=append('RESOLUTION',result);
    if(!event)break;
    record.status=resolution.winner==='VOID'?'VOID':resolution.winner===record.baselineSide?'CORRECT':'INCORRECT';
    record.winner=resolution.winner;record.outcomeSource=result.source;
    record.outcomeCheckedAt=result.checkedAt;record.outcomeSettledAt=result.settledAt;
    record.pendingReason=null;record.resolutionSequence=event.sequence;changed++;
   }catch(e){record.pendingReason='Result lookup or journal write failed';lastError=journal?.configured?'Official result source or audit journal failed; observations remain pending':'Official result provider failed; observations remain pending'}
  }
  return {checked,changed};
 }
 async function scan(){
  if(inflight)return inflight;
  inflight=(async()=>{
   let captured=0;
   for(const venue of VALID_VENUES){
    try{
     const quote=await quotes.query(venue);
     if(capture(quote))captured++;
    }catch(e){lastError=journal?.configured?'Market quote failed or audit journal could not persist the observation':'Market quote source temporarily unavailable'}
   }
   const resolution=await resolvePending();
   scanCount++;lastScanAt=ISO(clock());
   return {captured,resolved:resolution.changed};
  })().finally(()=>{inflight=null});
  return inflight;
 }
 function snapshot(){
  const correct=observations.filter(x=>x.status==='CORRECT').length,
    incorrect=observations.filter(x=>x.status==='INCORRECT').length,
    voided=observations.filter(x=>x.status==='VOID').length,
    pending=observations.filter(x=>x.status==='PENDING').length,settled=correct+incorrect;
  const candidateObservations=observations.filter(x=>x.spotCandidate);
  const candidateSettled=candidateObservations.filter(x=>['CORRECT','INCORRECT'].includes(x.status));
  const candidateCorrect=candidateSettled.filter(x=>x.spotCandidate.predictedContractSide===x.winner).length;
  return {
   mode:'PUBLIC_MARKET_FAVORED_ASK_V1',
   storageMode:journal?.mode||'VOLATILE_SERVER_SESSION',
   recoveredEvents:journal?.events?.length||0,
   qualifyingProspectiveContracts:0,requiredQualifyingContracts:100,
   qualifyingForModelAccuracy:false,independentForecastModel:false,
   warning:journal?.configured?'Read-only public market-favored quote baseline. Events are written to a local filesystem journal, but the volume and capture time have NOT been independently validated. These are NOT verified CASH AI predictions and do not count toward the 100-contract gate.':'Read-only public market-favored quote baseline. Session data disappears on restart and is not independently time-attested. These are NOT verified CASH AI predictions and do not count toward the 100 prospective-contract gate.',
   bootAt,lastScanAt,scanCount,cap:{records:maxRecords,events:maxEvents},
   observed:observations.length,pending,settled,voided,correct,incorrect,
   totalSettlementChecks,
   spotCandidateName:'SPOT_MOMENTUM_90S_V1',
   spotCandidateObservations:candidateObservations.length,
   spotCandidateSettled:candidateSettled.length,
   spotCandidateCorrect:candidateCorrect,
   spotCandidateAccuracy:candidateSettled.length?candidateCorrect/candidateSettled.length:null,
   spotCandidateQualified:false,
   baselineDirectionalAccuracy:settled?correct/settled:null,
   recordedEvents:events.length,headHash:lastHash,lastError,
   recent:observations.slice(-15).reverse().map(x=>({...x}))
  };
 }
 function exportSession(){
  return {...snapshot(),format:journal?.configured?'CASH-shadow-filesystem-unverified-v1':'CASH-shadow-volatile-v1',exportedAt:ISO(clock()),
   checksumChainWarning:'SHA256 links detect accidental event alteration but do not prove immutable capture times or independent provenance.',
   events:events.map(x=>({...x}))};
 }
 return {scan,capture,resolvePending,snapshot,exportSession};
}
module.exports={createShadowMonitor,chooseMarketBaseline};
