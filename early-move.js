'use strict';
/*
 * CASH EARLY MOVE RESEARCH — SPOT_45S_MOMENTUM_V1.
 * Predicts next 45s movement of one public BTC spot reference, NOT a
 * Kalshi YES/NO contract quote and NOT official BRTI settlement.
 * No future samples in freeze. No calibration, trade or money permission.
 */
const {createHash}=require('node:crypto');
const NAME='BTC_SPOT_MOMENTUM_45S_V1';
const HORIZON=45000,SPACING=90000,MAX=240,MAX_AGE=12000,GRACE=15000;
const MARKET=/^KXBTC15M-[A-Za-z0-9-]{6,70}$/;
const SOURCES=new Set(['Kraken BTC/USD','Coinbase Exchange BTC-USD']);
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const iso=t=>new Date(t).toISOString();
const valid=p=>Number.isFinite(p)&&p>1000&&p<10000000;
function evaluateEarlyMove({quote,spot,now=Date.now()}={}){
 const wait=reason=>({model:NAME,state:'WAIT',side:null,reason,forecastPrice:null,
  realMoneyAuthorized:false,calibratedProbability:null,expectedValue:null});
 if(!Number.isFinite(now)||!quote||!MARKET.test(quote.marketId||'')||
    quote.status!=='live'||quote.refreshFailed===true||
    !Number.isFinite(Date.parse(quote.endTime))||
    Date.parse(quote.endTime)-now<HORIZON+15000||
    !Number.isFinite(Date.parse(quote.fetchedAt))||
    Date.parse(quote.fetchedAt)>now+2000||now-Date.parse(quote.fetchedAt)>20000)
  return wait('NO_FRESH_ACTIVE_KALSHI_ROUND');
 if(!spot||spot.status!=='live'||!SOURCES.has(spot.source)||!valid(spot.price)||
   !Array.isArray(spot.history)||!Number.isFinite(Date.parse(spot.fetchedAt))||
   Date.parse(spot.fetchedAt)>now+2000||now-Date.parse(spot.fetchedAt)>MAX_AGE)
  return wait('FRESH_PUBLIC_SPOT_REQUIRED');
 const rows=spot.history.filter(x=>Number.isFinite(Date.parse(x?.time))&&
  Date.parse(x.time)<=now&&Date.parse(x.time)>=now-130000);
 if(rows.length<14||rows.some(x=>x.source!==spot.source||!valid(x.price)))
  return wait('SPOT_WINDOW_INCOMPLETE_OR_SOURCE_CHANGED');
 for(let i=1;i<rows.length;i++){
  const gap=Date.parse(rows[i].time)-Date.parse(rows[i-1].time);
  if(gap<=0||gap>20000)return wait('SPOT_WINDOW_GAP_OR_ORDER');
 }
 const last=rows.at(-1);
 if(now-Date.parse(last.time)>MAX_AGE||Math.abs(last.price-spot.price)>.01)
  return wait('SPOT_WINDOW_STALE');
 const atBefore=ms=>{
  const cutoff=now-ms;
  const row=rows.findLast(x=>Date.parse(x.time)<=cutoff);
  return row&&cutoff-Date.parse(row.time)<=15000?row:null;
 };
 const p20=atBefore(20000),p60=atBefore(60000),p90=atBefore(90000);
 if(!p20||!p60||!p90)return wait('NEED_90_SECONDS_PAST_HISTORY');
 const tail=rows.filter(x=>Date.parse(x.time)>=Date.parse(p90.time));
 let sq=0,seconds=0;
 for(let i=1;i<tail.length;i++){
  const dt=(Date.parse(tail[i].time)-Date.parse(tail[i-1].time))/1000;
  const r=Math.log(tail[i].price/tail[i-1].price);
  sq+=r*r;seconds+=dt;
 }
 if(seconds<80)return wait('VOLATILITY_WINDOW_INCOMPLETE');
 const sigma=Math.sqrt(Math.max(1e-10,sq/seconds));
 const fast=Math.log(last.price/p20.price);
 const slow=Math.log(last.price/p60.price);
 const threshold=Math.max(.000045,.7*sigma*Math.sqrt(20));
 const aligned=fast*slow>0&&Math.abs(fast)>threshold&&Math.abs(slow)>threshold*.7;
 const side=aligned?(fast>0?'UP':'DOWN'):null;
 const estimatedReturn=side?Math.max(-.003,Math.min(.003,fast*HORIZON/20000*.45)):null;
 const forecastPrice=estimatedReturn===null?null:last.price*Math.exp(estimatedReturn);
 const evidence=tail.map(x=>({time:x.time,price:x.price,source:x.source}));
 return {model:NAME,state:side?'PROVISIONAL_DIRECTION':'WAIT',
  side,reason:side?'PAST_MOMENTUM_ALIGNED':'MOMENTUM_WEAK_OR_CONFLICTING',
  at:iso(now),dueAt:iso(now+HORIZON),marketId:quote.marketId,
  endTime:quote.endTime,source:spot.source,spotPrice:last.price,
  forecastPrice,fastBps:Math.round(fast*1e5)/10,
  slowBps:Math.round(slow*1e5)/10,
  thresholdBps:Math.round(threshold*1e5)/10,
  windowHash:sha(evidence),inputHash:sha({now,marketId:quote.marketId,
   spotPrice:last.price,side,windowHash:sha(evidence)}),
  realMoneyAuthorized:false,calibratedProbability:null,expectedValue:null,
  validation:'UNVALIDATED_SHORT_HORIZON_PROXY',
  warning:'Predicts public BTC spot direction after 45s, NOT Kalshi contract odds or official BRTI. Not an investment recommendation.'};
}
function createEarlyMoveMonitor({quotes,spot,clock=()=>Date.now(),maxRecords=MAX}={}){
 if(!quotes?.view||!spot?.view||!spot?.update)throw Error('Read-only feeds required');
 const records=[];let scans=0,failures=0,lastReason='NOT_STARTED',lastScanAt=null;
 let inflight=null;
 function grade(r,s,now){
  if(now<Date.parse(r.dueAt))return;
  const obs=s?.history||[];
  const due=Date.parse(r.dueAt),from=Date.parse(r.at);
  const found=obs.find(x=>x?.source===r.source&&valid(x?.price)&&
   Number.isFinite(Date.parse(x.time))&&Date.parse(x.time)>=due&&
   Date.parse(x.time)<=due+GRACE);
  if(found){
   const window=obs.filter(x=>{
    const t=Date.parse(x?.time);
    return Number.isFinite(t)&&t>=from&&t<=Date.parse(found.time);
   });
   const consistent=window.length>=4&&window.every(x=>x.source===r.source&&valid(x.price));
   let gapsOK=consistent;
   let previous=from;
   for(const row of window){
    const t=Date.parse(row.time);
    if(t-previous>20000||t<previous)gapsOK=false;
    previous=t;
   }
   if(gapsOK){
    const deltaBps=Math.log(found.price/r.spotPrice)*10000;
    const outcome=deltaBps>1.5?'UP':deltaBps< -1.5?'DOWN':'FLAT';
    r.observedAt=found.time;r.observedPrice=found.price;
    r.observedDirection=outcome;r.deltaBps=Math.round(deltaBps*100)/100;
    r.status=r.side===null?'WAIT_OBSERVED':r.side===outcome?'HIT':'MISS';
    r.outcomeHash=sha({at:found.time,source:r.source,price:found.price,
      direction:outcome,deltaBps:r.deltaBps});
    return;
   }
  }
  if(now>due+GRACE)r.status='UNOBSERVED';
 }
 async function scan(){
  if(inflight)return inflight;
  inflight=(async()=>{
   scans++;
   try{
    const s=await spot.update(),now=clock(),q=quotes.view('Kalshi');
    for(const r of records)if(r.status==='PENDING')grade(r,s,now);
    const candidate=evaluateEarlyMove({quote:q,spot:s,now});
    lastReason=candidate.reason;
    const marketId=q?.marketId;
    const matching=records.filter(r=>r.marketId===marketId);
    const last=matching.at(-1);
    const canFreeze=candidate.at&&records.length<maxRecords&&matching.length<8&&
      (!last||now-Date.parse(last.at)>=SPACING);
    if(canFreeze){
      records.push({...candidate,status:'PENDING',observedAt:null,
       observedPrice:null,observedDirection:null,outcomeHash:null});
    }
   }catch{failures++;lastReason='SCANNER_ERROR'}
   lastScanAt=iso(clock());
   return snapshot();
  })().finally(()=>{inflight=null});
  return inflight;
 }
 function safeRecord(r){
  if(!r)return null;
  const {model,side,reason,at,dueAt,marketId,endTime,source,spotPrice,
   forecastPrice,fastBps,slowBps,thresholdBps,status,observedAt,
   observedPrice,observedDirection,deltaBps,windowHash,inputHash,outcomeHash}=r;
  return {model,side,reason,at,dueAt,marketId,endTime,source,spotPrice,
   forecastPrice,fastBps,slowBps,thresholdBps,status,observedAt,
   observedPrice,observedDirection,deltaBps,windowHash,inputHash,outcomeHash};
 }
 function snapshot(){
  const now=clock(),s=spot.view(),q=quotes.view('Kalshi');
  const scored=records.filter(x=>x.side&&['HIT','MISS'].includes(x.status));
  const hits=scored.filter(x=>x.status==='HIT').length;
  const current=records.findLast(x=>x.status==='PENDING'&&
   x.marketId===q?.marketId&&Date.parse(x.dueAt)>now)||null;
  const last=records.findLast(x=>x.marketId===q?.marketId)||null;
  const history=(s.history||[]).filter(x=>x.source===s.source&&valid(x.price)&&
    Date.parse(x.time)<=now&&Date.parse(x.time)>=now-240000)
   .slice(-60).map(x=>({time:x.time,price:x.price}));
  return {version:'CASH_SPOT_EARLY_MOVE_V1',model:NAME,
   updatedAt:iso(now),scans,failures,lastScanAt,lastReason,
   horizonSeconds:45,quoteMarketId:q?.marketId||null,
   spotSource:s.source||null,spotFresh:s.status==='live'&&s.ageMs<=MAX_AGE,
   history,active:safeRecord(current),latest:safeRecord(last),
   recent:records.slice(-10).reverse().map(safeRecord),
   frozen:records.length,directional:records.filter(x=>x.side).length,
   waits:records.filter(x=>!x.side).length,scored:scored.length,
   hits,misses:scored.length-hits,hitRate:scored.length?hits/scored.length:null,
   unobserved:records.filter(x=>x.status==='UNOBSERVED').length,
   independentValidation:0,requiredIndependentValidation:100,
   independentlyTimeAttested:false,modelCalibrated:false,
   tradingAuthorized:false,automaticOrdersEnabled:false,
   persistence:'VOLATILE_SERVER_SESSION',
   disclaimer:'Spot 45s forecasts are not Kalshi 15m YES/NO settlement predictions. Experimental unaudited session, no verified predictive edge or real-money permission.'};
 }
 return {scan,snapshot};
}
module.exports={NAME,evaluateEarlyMove,createEarlyMoveMonitor};
