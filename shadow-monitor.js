'use strict';
/*
 * CASH Shadow Monitor v1
 * Session-only, public market-quote baseline. No trades, user accounts,
 * model predictions, official forecasting validation or durable storage.
 * A SHA256 link detects accidental history edits within an exported session;
 * it does NOT authenticate clock times or provide tamper-proof evidence.
 */
const {createHash}=require('node:crypto');
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
 maxRecords=MAX_RECORDS,maxEvents=MAX_EVENTS}={}){
 if(!quotes||!results)throw Error('Shadow monitor needs read-only quote and result providers');
 const bootAt=ISO(clock()),observations=[],events=[],ids=new Set();
 let lastHash='GENESIS',inflight=null,scanCount=0,lastScanAt=null,lastError=null;
 function append(type,payload){
  if(events.length>=maxEvents)return null;
  const e={sequence:events.length+1,type,recordedAt:ISO(clock()),payload,previousHash:lastHash};
  e.hash=createHash('sha256').update(JSON.stringify(e)).digest('hex');
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
  const data={
   id,venue:quote.venue,marketId,slug:quote.venue==='Polymarket'?quote.slug:null,
   endTime:quote.endTime,quoteFetchedAt:quote.fetchedAt,serverCapturedAt:ISO(now),
   leadMs:end-now,baselineName:'PUBLIC_MARKET_FAVORED_ASK_V1',
   baselineSide:baseline.side,normalizedMarketShare:baseline.normalizedMarketShare,
   observedAsks:baseline.observedAsks,quoteSource:baseline.source
  };
  const event=append('CAPTURE',data);
  if(!event)return null;
  const record={...data,status:'PENDING',winner:null,outcomeSource:null,
   outcomeCheckedAt:null,outcomeSettledAt:null,captureSequence:event.sequence};
  observations.push(record);ids.add(id);
  return record;
 }
 async function resolvePending(){
  let checked=0,changed=0;
  const candidates=observations.filter(x=>x.status==='PENDING'&&Date.parse(x.endTime)<=clock()).slice(0,3);
  for(const record of candidates){
   if(events.length>=maxEvents)break;
   checked++;
   try{
    const resolution=await results.lookup({venue:record.venue,marketId:record.marketId,slug:record.slug});
    const allowed=record.venue==='Kalshi'?['YES','NO','VOID']:['UP','DOWN','VOID'];
    if(resolution?.status!=='verified'||resolution.marketId!==record.marketId
      ||resolution.venue!==record.venue||!allowed.includes(resolution.winner))continue;
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
    record.resolutionSequence=event.sequence;changed++;
   }catch(e){lastError='Official result provider failed; observations remain pending'}
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
    }catch(e){lastError='Market quote source temporarily unavailable'}
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
  return {
   mode:'PUBLIC_MARKET_FAVORED_ASK_V1',
   storageMode:'VOLATILE_SERVER_SESSION',
   qualifyingProspectiveContracts:0,requiredQualifyingContracts:100,
   qualifyingForModelAccuracy:false,independentForecastModel:false,
   warning:'Read-only public market-favored quote baseline. Session data disappears on restart and is not independently time-attested. These are NOT verified CASH AI predictions and do not count toward the 100 prospective-contract gate.',
   bootAt,lastScanAt,scanCount,cap:{records:maxRecords,events:maxEvents},
   observed:observations.length,pending,settled,voided,correct,incorrect,
   baselineDirectionalAccuracy:settled?correct/settled:null,
   recordedEvents:events.length,headHash:lastHash,lastError,
   recent:observations.slice(-15).reverse().map(x=>({...x}))
  };
 }
 function exportSession(){
  return {...snapshot(),format:'CASH-shadow-volatile-v1',exportedAt:ISO(clock()),
   checksumChainWarning:'SHA256 links detect accidental event alteration but do not prove immutable capture times or independent provenance.',
   events:events.map(x=>({...x}))};
 }
 return {scan,capture,resolvePending,snapshot,exportSession};
}
module.exports={createShadowMonitor,chooseMarketBaseline};
