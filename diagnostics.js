'use strict';
/* Cached feed health is not a trading signal or authorization to trade.
 * This module never performs remote requests or estimates model accuracy. */
const isAsk=n=>Number.isFinite(n)&&n>0&&n<1;
function feedState(kind,data={},now=Date.now()){
 const status=String(data.status||'unavailable');
 const fetched=Date.parse(data.fetchedAt),age=Number.isFinite(fetched)?Math.max(0,now-fetched):null;
 const end=Date.parse(data.endTime),expired=kind!=='Spot'&&(!Number.isFinite(end)||end<=now);
 const maxAge=kind==='Spot'?12000:30000;
 const identity=kind==='Spot'?Number.isFinite(data.price)&&data.price>1000
  :kind==='Kalshi'?typeof data.marketId==='string'&&/^KXBTC15M-[A-Za-z0-9-]+$/.test(data.marketId)
  :typeof data.marketId==='string'&&/^0x[0-9a-fA-F]{64}$/.test(data.marketId)
   &&/^btc-updown-5m-\d{9,12}$/.test(data.slug||'');
 const sideCount=kind==='Spot'?1:kind==='Kalshi'?[data.yesAsk,data.noAsk].filter(isAsk).length:
  [data.upAsk,data.downAsk].filter(isAsk).length;
 let state='OFFLINE',reason='No usable current quote';
 if(identity&&sideCount>0&&Number.isFinite(fetched)){
  if(fetched>now+2000){reason='Quote timestamp is in the future';}
  else if(age>maxAge||expired||status==='stale'){
   state='STALE';reason=expired?'Contract expired':age>maxAge?'Quote exceeded freshness window':'Upstream refresh failed';
  }else if(status==='live'&&sideCount===(kind==='Spot'?1:2)){
   state='LIVE';reason='Fresh read-only reference';
  }else if(['live','partial'].includes(status)){
   state='PARTIAL';reason='Not all required quote fields are available';
  }
 }
 return {state,reason,ageMs:age,fetchedAt:data.fetchedAt||null,
  source:kind==='Spot'?data.source||null:kind,
  marketId:kind==='Spot'?null:data.marketId||null,
  endTime:kind==='Spot'?null:data.endTime||null};
}
function createDiagnostics({spot={},kalshi={},polymarket={},shadow={},now=Date.now()}={}){
 const feeds={spot:feedState('Spot',spot,now),
  Kalshi:feedState('Kalshi',kalshi,now),
  Polymarket:feedState('Polymarket',polymarket,now)};
 const states=Object.values(feeds).map(f=>f.state);
 const dataStatus=states.every(s=>s==='LIVE')?'LIVE':
  states.some(s=>s==='LIVE'||s==='PARTIAL')?'DEGRADED':'OFFLINE';
 const scan=Date.parse(shadow.lastScanAt);
 const monitor=Number.isFinite(scan)&&scan<=now+2000&&now-scan<=60000?'ACTIVE':
  Number.isFinite(scan)?'STALE':'STARTING';
 const storageMode=shadow.storageMode||'VOLATILE_SERVER_SESSION';
 const blockers=[
  'Independent CASH model has not passed 100 independently verified prospective settlements',
  storageMode==='VOLATILE_SERVER_SESSION'?'Server observations are volatile across redeploys':
   'Audit journal capture times and persistence are not independently attested',
  'Read-only spot references and venue quotes do not guarantee executable outcomes'
 ];
 return {service:'CASH',mode:'SIMULATION_ONLY',generatedAt:new Date(now).toISOString(),
  dataStatus,feeds,monitor:{state:monitor,lastScanAt:shadow.lastScanAt||null,
   observed:Number(shadow.observed)||0,settled:Number(shadow.settled)||0},
  validation:{state:'NOT_VALIDATED',qualifyingProspectiveContracts:0,
   requiredProspectiveContracts:100,independentModelValidated:false,
   independentTimeAttestation:false,storageMode,realOrdersEnabled:false,blockers},
  note:'LIVE describes public read-only data freshness only, never model accuracy or trading readiness.'};
}
module.exports={createDiagnostics,feedState};
