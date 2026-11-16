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
const {proposeSpotMomentum,assessSpotMomentum,toContractSide,isValidSpotCandidate}=require('./spot-momentum');
const {createScanContinuity,classifyQuote}=require('./scan-continuity');
const {evaluateShadowRecords}=require('./shadow-evaluation');
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


/* Check all capture fields against each other, including when recovering an
 * otherwise correctly SHA256-linked journal. This is semantic consistency,
 * NOT proof that an externally recorded timestamp or quote is authentic. */
function isValidCaptureEvidence(x,minimumLeadMs=MIN_LEAD_MS){
 if(!x||!VALID_VENUES.has(x.venue)||typeof x.marketId!=='string'
   ||x.id!==x.venue+':'+x.marketId
   ||x.baselineName!=='PUBLIC_MARKET_FAVORED_ASK_V1')return false;
 if(x.venue==='Kalshi'){
  if(!/^KXBTC15M-[A-Za-z0-9-]{6,70}$/.test(x.marketId)||x.slug!==null)return false;
 }else if(!/^0x[0-9a-fA-F]{64}$/.test(x.marketId)
   ||!/^btc-updown-5m-\d{9,12}$/.test(x.slug||''))return false;
 const captured=Date.parse(x.serverCapturedAt),fetched=Date.parse(x.quoteFetchedAt),
  expires=Date.parse(x.endTime);
 if(!Number.isFinite(captured)||!Number.isFinite(fetched)||!Number.isFinite(expires)
   ||fetched>captured+2000||captured-fetched>12000
   ||!Number.isFinite(x.leadMs)||expires-captured!==x.leadMs
   ||x.leadMs<minimumLeadMs)return false;
 const asks=x.observedAsks;
 if(!asks||typeof asks!=='object'||Array.isArray(asks)
   ||Object.keys(asks).length!==2)return false;
 const recovered=chooseMarketBaseline({venue:x.venue,status:'live',
  yesAsk:asks.YES,noAsk:asks.NO,upAsk:asks.UP,downAsk:asks.DOWN});
 if(!recovered||x.baselineSide!==recovered.side
   ||x.quoteSource!==recovered.source
   ||!Number.isFinite(x.normalizedMarketShare)
   ||Math.abs(x.normalizedMarketShare-recovered.normalizedMarketShare)>1e-12)return false;
 return x.spotCandidate===undefined||x.spotCandidate===null
  ||isValidSpotCandidate(x.spotCandidate,x.venue,captured);
}

/* Independently verify the public result evidence before scoring or replaying.
 * An adapter's status:'verified' claim alone is not proof of finality. */
function hasVerifiedEvidence(result,record){
 if(!result||result.confirmationCount!==2||!record
   ||typeof result.evidenceSha256!=='string'||!/^[a-f0-9]{64}$/.test(result.evidenceSha256)
   ||!result.evidenceSnapshot||typeof result.evidenceSnapshot!=='object'
   ||Array.isArray(result.evidenceSnapshot)
   ||typeof result.evidenceSourceUrl!=='string'
   ||!Number.isFinite(Date.parse(result.checkedAt))
   ||!Number.isFinite(Date.parse(result.firstObservedAt))
   ||Date.parse(result.firstObservedAt)>Date.parse(result.checkedAt)
   ||Date.parse(result.firstObservedAt)<Date.parse(record.endTime)
   ||Date.parse(result.checkedAt)-Date.parse(result.firstObservedAt)<20000
   ||Date.parse(result.checkedAt)<Date.parse(record.endTime))return false;
 const evidence=result.evidenceSnapshot;
 try{
  if(createHash('sha256').update(JSON.stringify(evidence)).digest('hex')!==result.evidenceSha256)return false;
  if(record.venue==='Kalshi'){
   if(result.evidenceSourceUrl!=='https://external-api.kalshi.com/trade-api/v2/markets/'+encodeURIComponent(record.marketId)
     ||evidence.venue!=='Kalshi'||evidence.ticker!==record.marketId
     ||!['settled','finalized'].includes(String(evidence.status||'').toLowerCase())
     ||evidence.is_provisional===true)return false;
   const winner={yes:'YES',no:'NO',void:'VOID'}[String(evidence.result||'').toLowerCase()];
   return Boolean(winner&&winner===result.winner);
  }
  if(record.venue==='Polymarket'){
   if(result.evidenceSourceUrl!=='https://gamma-api.polymarket.com/events?slug='+encodeURIComponent(record.slug)
     ||evidence.venue!=='Polymarket'||evidence.slug!==record.slug
     ||evidence.conditionId!==record.marketId||evidence.closed!==true
     ||!['resolved','settled'].includes(String(evidence.resolutionStatus||evidence.umaResolutionStatus||'').toLowerCase()))return false;
   const names=typeof evidence.outcomes==='string'?JSON.parse(evidence.outcomes):evidence.outcomes;
   const values=typeof evidence.outcomePrices==='string'?JSON.parse(evidence.outcomePrices):evidence.outcomePrices;
   if(!Array.isArray(names)||!Array.isArray(values)||names.length!==2||values.length!==2)return false;
   const up=names.findIndex(x=>String(x).toLowerCase()==='up');
   const down=names.findIndex(x=>String(x).toLowerCase()==='down');
   const payout=values.map(Number);
   if(up<0||down<0||up===down||!payout.every(x=>x===0||x===1)||payout[up]===payout[down])return false;
   return (payout[up]===1?'UP':'DOWN')===result.winner;
  }
 }catch{}
 return false;
}

function createShadowMonitor({quotes,results,clock=()=>Date.now(),minimumLeadMs=MIN_LEAD_MS,
 maxRecords=MAX_RECORDS,maxEvents=MAX_EVENTS,journal=null,spot=null}={}){
 if(!quotes||!results)throw Error('Shadow monitor needs read-only quote and result providers');
 const bootAt=ISO(clock()),observations=[],events=[],ids=new Set();
 let lastHash='GENESIS',inflight=null,scanCount=0,lastScanAt=null,lastError=null,pendingCursor=0,totalSettlementChecks=0;
 const collection=createScanContinuity({clock});
 const spotInputs={checks:0,candidates:0,rejected:0,lastReason:'NOT_CHECKED',lastCheckedAt:null,reasons:{}};
 function inspectSpotInputs(){
  if(!spot)return;
  let result;
  try{result=assessSpotMomentum(spot.view(),clock())}
  catch{result={candidate:null,reason:'SPOT_SOURCE_ERROR'}}
  spotInputs.checks++;
  if(result.candidate)spotInputs.candidates++;else spotInputs.rejected++;
  spotInputs.lastReason=result.reason;
  spotInputs.lastCheckedAt=ISO(clock());
  spotInputs.reasons[result.reason]=(spotInputs.reasons[result.reason]||0)+1;
 }
 function loadSavedHistory(){
  const saved=journal?.events||[];
  verifyChain(saved,{limit:maxEvents});
  for(const e of saved){
   const x=e.payload;
   if(e.type==='CAPTURE'){
    if(ids.has(x.id)||observations.length>=maxRecords
      ||!isValidCaptureEvidence(x,minimumLeadMs))
      throw Error('Saved capture is semantically invalid');
    observations.push({...x,status:'PENDING',winner:null,outcomeSource:null,
      outcomeCheckedAt:null,outcomeSettledAt:null,outcomeEvidence:null,lastCheckAt:null,settlementAttempts:0,pendingReason:null,captureSequence:e.sequence});
    ids.add(x.id);
   }else if(e.type==='RESOLUTION'){
    const record=observations.find(o=>o.id===x.id),allowed=record?.venue==='Kalshi'?['YES','NO','VOID']:['UP','DOWN','VOID'];
    if(!record||record.status!=='PENDING'||x.venue!==record.venue||x.marketId!==record.marketId
      ||!allowed.includes(x.winner)||typeof x.source!=='string'
      ||!Number.isFinite(Date.parse(x.checkedAt))
      ||!hasVerifiedEvidence(x,record))
      throw Error('Saved resolution is semantically invalid');
    record.status=x.winner==='VOID'?'VOID':x.winner===record.baselineSide?'CORRECT':'INCORRECT';
    record.winner=x.winner;record.outcomeSource=x.source;
    record.outcomeCheckedAt=x.checkedAt;record.outcomeSettledAt=x.settledAt||null;
    record.outcomeEvidence=x.confirmationCount===2?{confirmationCount:2,firstObservedAt:x.firstObservedAt,evidenceSha256:x.evidenceSha256,evidenceSourceUrl:x.evidenceSourceUrl,evidenceSnapshot:x.evidenceSnapshot}:null;
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
  if(typeof marketId!=='string'||ids.has(id)
     ||(quote.venue==='Kalshi'&&!/^KXBTC15M-[A-Za-z0-9-]{6,70}$/.test(marketId))
     ||(quote.venue==='Polymarket'&&(!/^0x[0-9a-fA-F]{64}$/.test(marketId)
       ||!/^btc-updown-5m-\d{9,12}$/.test(quote.slug||'')))
     ||!Number.isFinite(quoteAt)||!Number.isFinite(end)
     ||quoteAt>now+2000||now-quoteAt>12000||end-now<minimumLeadMs)return null;
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
  if(!isValidCaptureEvidence(data,minimumLeadMs))return null;
  const event=append('CAPTURE',data);
  if(!event)return null;
  const record={...data,status:'PENDING',winner:null,outcomeSource:null,
   outcomeCheckedAt:null,outcomeSettledAt:null,outcomeEvidence:null,lastCheckAt:null,settlementAttempts:0,pendingReason:null,captureSequence:event.sequence};
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
      ||resolution.venue!==record.venue||!allowed.includes(resolution.winner)
      ||!hasVerifiedEvidence(resolution,record)){
      record.pendingReason='Unrecognized or contradictory result response';continue;
    }
    const result={
     id:record.id,marketId:record.marketId,venue:record.venue,
     winner:resolution.winner,source:resolution.source||'public official market',
     checkedAt:resolution.checkedAt||ISO(clock()),
     settledAt:resolution.settledAt||null,
     confirmationCount:resolution.confirmationCount??null,
     firstObservedAt:resolution.firstObservedAt??null,
     evidenceSourceUrl:resolution.evidenceSourceUrl??null,
     evidenceSha256:resolution.evidenceSha256??null,
     evidenceSnapshot:resolution.evidenceSnapshot??null
    };
    const event=append('RESOLUTION',result);
    if(!event)break;
    record.status=resolution.winner==='VOID'?'VOID':resolution.winner===record.baselineSide?'CORRECT':'INCORRECT';
    record.winner=resolution.winner;record.outcomeSource=result.source;
    record.outcomeCheckedAt=result.checkedAt;record.outcomeSettledAt=result.settledAt;
    record.outcomeEvidence=result.confirmationCount===2?{confirmationCount:2,firstObservedAt:result.firstObservedAt,evidenceSha256:result.evidenceSha256,evidenceSourceUrl:result.evidenceSourceUrl,evidenceSnapshot:result.evidenceSnapshot}:null;
    record.pendingReason=null;record.resolutionSequence=event.sequence;changed++;
   }catch(e){record.pendingReason='Result lookup or journal write failed';lastError=journal?.configured?'Official result source or audit journal failed; observations remain pending':'Official result provider failed; observations remain pending'}
  }
  return {checked,changed};
 }
 async function scan(){
  if(inflight){collection.overlap();return inflight}
  const startedMs=clock();
  inflight=(async()=>{
   let captured=0;
   const states={Kalshi:'OFFLINE',Polymarket:'OFFLINE'};
   for(const venue of VALID_VENUES){
    try{
     const quote=await quotes.query(venue);
     states[venue]=classifyQuote(venue,quote,clock(),minimumLeadMs,Boolean(chooseMarketBaseline(quote)));
     if(capture(quote))captured++;
    }catch(e){
     states[venue]='ERROR';
     lastError=journal?.configured?'Market quote failed or audit journal could not persist the observation':
      'Market quote source temporarily unavailable';
    }
   }
   const resolution=await resolvePending();
   inspectSpotInputs();
   const finishedMs=clock();
   collection.record({startedMs,finishedMs,statuses:states,captured,resolved:resolution.changed});
   scanCount++;lastScanAt=ISO(finishedMs);
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
   bootAt,lastScanAt,scanCount,collection:collection.snapshot(),
   cap:{records:maxRecords,events:maxEvents},
   observed:observations.length,pending,settled,voided,correct,incorrect,
   totalSettlementChecks,
   spotCandidateName:'SPOT_MOMENTUM_90S_V1',
   spotCandidateObservations:candidateObservations.length,
   spotCandidateSettled:candidateSettled.length,
   spotCandidateCorrect:candidateCorrect,
   spotCandidateAccuracy:candidateSettled.length?candidateCorrect/candidateSettled.length:null,
   spotCandidateQualified:false,
   spotEvidence:{...spotInputs,reasons:{...spotInputs.reasons},
    sampleBackedCandidates:candidateObservations.filter(x=>Array.isArray(x.spotCandidate?.sampleWindow)).length,
    legacyWithoutSampleWindow:candidateObservations.filter(x=>!Array.isArray(x.spotCandidate?.sampleWindow)).length,
    caveat:'Spot window checks are session-only and use self-reported exchange observations; not independently attested.'},
   baselineDirectionalAccuracy:settled?correct/settled:null,
   recordedEvents:events.length,headHash:lastHash,lastError,
   recent:observations.slice(-15).reverse().map(x=>({...x}))
  };
 }
 function evaluation(){return evaluateShadowRecords(observations,{now:clock(),verifyOutcome:hasVerifiedEvidence})}
 function exportSession(){
  return {...snapshot(),format:journal?.configured?'CASH-shadow-filesystem-unverified-v1':'CASH-shadow-volatile-v1',exportedAt:ISO(clock()),
   checksumChainWarning:'SHA256 links detect accidental event alteration but do not prove immutable capture times or independent provenance.',
   events:events.map(x=>({...x}))};
 }
 return {scan,capture,resolvePending,snapshot,evaluation,exportSession};
}
module.exports={createShadowMonitor,chooseMarketBaseline};
