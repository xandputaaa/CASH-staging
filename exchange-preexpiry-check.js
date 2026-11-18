'use strict';
/*
 * Independent read-only DIRECT exchange comparison at the GH observer,
 * after the forecast event has already been frozen in CASH. This is a
 * second public SOURCE, not an independently certified clock, a fill,
 * validation of the prediction algorithm, or an order.
 */
const {createHash}=require('node:crypto');
const API='https://external-api.kalshi.com/trade-api/v2/markets/';
const ID=/^KXBTC15M-[A-Za-z0-9-]{6,70}$/;
const SHA=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const stamp=ms=>Number.isFinite(ms)?new Date(ms).toISOString():null;
function publicMarketFields(m){
 return {ticker:m.ticker??null,status:m.status??null,result:m.result??null,
  close_time:m.close_time??null,strike_type:m.strike_type??null,
  floor_strike:m.floor_strike??null,is_provisional:m.is_provisional??null,
  yes_ask_dollars:m.yes_ask_dollars??null,
  no_ask_dollars:m.no_ask_dollars??null,
  yes_ask_size_fp:m.yes_ask_size_fp??null,
  no_ask_size_fp:m.no_ask_size_fp??null};
}
function checkExchangeMarket({marketId,freezeStrike,closeTime,market,receivedMs}){
 const base={state:'EXCHANGE_NOT_CORROBORATED',source:'KALSHI_DIRECT_PUBLIC_GET_MARKET',
  observedAtRunner:stamp(receivedMs),independentValidation:false,
  isFill:false,quoteWasNotFrozenAtPrediction:true};
 if(!ID.test(marketId||'')||!Number.isFinite(freezeStrike)||
    !Number.isFinite(Date.parse(closeTime))||!Number.isFinite(receivedMs))
  return {...base,state:'INVALID_PUBLIC_FORECAST_FIELDS'};
 if(!market||typeof market!=='object')
  return {...base,state:'EXCHANGE_MARKET_UNAVAILABLE'};
 const snapshot=publicMarketFields(market);
 // A checksum of a second public source's selected fields, not its signature.
 const selectedFieldsSha256=SHA(snapshot);
 const observedClose=Date.parse(market.close_time);
 if(!Number.isFinite(observedClose)||
    observedClose!==Date.parse(closeTime)||
    market.ticker!==marketId)
  return {...base,state:'EXCHANGE_MARKET_ID_OR_EXPIRY_MISMATCH',
   exchangePublicFieldsSha256:selectedFieldsSha256};
 if(!(receivedMs < observedClose-15000))
  return {...base,state:'EXCHANGE_READ_TOO_LATE',
   exchangePublicFieldsSha256:selectedFieldsSha256};
 if(!['active','open'].includes(String(market.status||'').toLowerCase())||
    ![null,undefined,''].includes(market.result)||
    market.is_provisional===true)
  return {...base,state:'EXCHANGE_NOT_UNSETTLED_ACTIVE_MARKET',
   exchangePublicFieldsSha256:selectedFieldsSha256};
 const observedStrike=Number(market.floor_strike);
 if(market.floor_strike===null||market.floor_strike===undefined||
  !Number.isFinite(observedStrike)||
  Math.round(observedStrike*100)!==Math.round(freezeStrike*100)||
  market.strike_type!=='greater_or_equal')
  return {...base,state:'EXCHANGE_STRIKE_OR_RULE_MISMATCH',
   exchangePublicFieldsSha256:selectedFieldsSha256};
 const nonneg=v=>v===null||v===undefined?null:
    typeof v==='string'&&v.trim()===''?null:Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
 const quote=v=>{const n=nonneg(v);return n===null||n>1?null:n};
 return {...base,state:'MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET',
  publishedCloseTime:market.close_time,
  publicStrikeAtObserver:observedStrike,
  publicStrikeType:market.strike_type,
  publicMarketStatusAtObserver:market.status,
  exchangePublicFieldsSha256:selectedFieldsSha256,
  // These asks and sizes are sampled AFTER freeze, not executable asks
  // at prediction time; do not use them for modeled paper profit.
  witnessTimeQuotesNotFills:{
   yesAskDollars:quote(market.yes_ask_dollars),
   noAskDollars:quote(market.no_ask_dollars),
   yesAskSizeFp:nonneg(market.yes_ask_size_fp),
   noAskSizeFp:nonneg(market.no_ask_size_fp)
  }
 };
}
async function fetchExchangeMarket(marketId,{fetchImpl=fetch,clock=()=>Date.now()}={}){
 if(!ID.test(marketId||''))throw Error('Not Kalshi BTC15m ticker');
 const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),4500);
 try{
  const response=await fetchImpl(API+encodeURIComponent(marketId),{
   headers:{Accept:'application/json','User-Agent':'CASH-external-public-witness/1.0'},
   signal:ctrl.signal
  });
  if(!response.ok)throw Error('Direct public exchange source HTTP failure');
  const text=await response.text();
  if(Buffer.byteLength(text)>256000)throw Error('Excessive public exchange response');
  const market=JSON.parse(text)?.market;
  return {market,receivedMs:clock()};
 }finally{clearTimeout(timeout)}
}
async function augmentObservationWithExchange(observation,{early,late},
 opts={fetchImpl:fetch,clock:()=>Date.now()}){
 const {fetchImpl=fetch,clock=()=>Date.now()}=opts;
 const byMarket=new Map();
 const enhanced=[];
 for(const evidence of observation.frozenEvidence){
  const snapshot=evidence.model==='KXBTC15M_SETTLEMENT_EARLY_V3'?early:late;
  const frozen=snapshot?.events?.find(x=>x.type==='FORECAST'&&
   x.hash===evidence.frozenEventHash&&x.payload?.marketId===evidence.marketId);
  if(!frozen){
   enhanced.push({...evidence,exchangeAtWitness:{
    state:'FROZEN_EVENT_NOT_PRESENT',independentValidation:false}});
   continue;
  }
  const p=frozen.payload,strike=evidence.model==='KXBTC15M_SETTLEMENT_EARLY_V3'?
   p.targetPrice:p.officialStrikeAtFreeze;
  if(!byMarket.has(evidence.marketId)){
   byMarket.set(evidence.marketId,fetchExchangeMarket(evidence.marketId,
     {fetchImpl,clock}).catch(()=>({market:null,receivedMs:clock()})));
  }
  const source=await byMarket.get(evidence.marketId);
  const comparison=checkExchangeMarket({
   marketId:evidence.marketId,freezeStrike:strike,
   closeTime:evidence.contractClosesAt,
   market:source.market,receivedMs:source.receivedMs
  });
  enhanced.push({...evidence,exchangeAtWitness:comparison});
 }
 const matched=enhanced.filter(x=>x.exchangeAtWitness?.state===
  'MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET').length;
 return {...observation,frozenEvidence:enhanced,
  directExchangeComparisons:enhanced.length,
  directExchangeMatches:matched,
  directExchangeMismatchesOrUnavailable:enhanced.length-matched,
  independentQualifiedCount:0,realOrdersEnabled:false};
}
module.exports={publicMarketFields,checkExchangeMarket,fetchExchangeMarket,
 augmentObservationWithExchange};
