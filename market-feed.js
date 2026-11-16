'use strict';
const SOURCES=[
  {name:'Kraken BTC/USD',url:'https://api.kraken.com/0/public/Ticker?pair=xbtusd'},
  {name:'Coinbase Exchange BTC-USD',url:'https://api.exchange.coinbase.com/products/BTC-USD/ticker'}
];
const CACHE_MS=5000,LIVE_MS=12000,HISTORY_LIMIT=72;
function isValidPrice(price){return Number.isFinite(price)&&price>1000&&price<10000000}
async function getJson(url,fetchImpl=fetch,timeoutMs=3500){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(url,{signal:controller.signal,headers:{Accept:'application/json','User-Agent':'CASH-read-only-market-monitor/1.0'}});
    if(!response.ok)throw Error('Upstream HTTP failure');
    return await response.json();
  }finally{clearTimeout(timeout)}
}
function parseKraken(data){
  if(!data||!Array.isArray(data.error)||data.error.length||!data.result)throw Error('Invalid Kraken response');
  const ticker=Object.values(data.result)[0],price=Number(ticker?.c?.[0]);
  if(!isValidPrice(price))throw Error('Invalid Kraken price');
  return {price,source:SOURCES[0].name};
}
function parseCoinbase(data,now=Date.now()){
  const price=Number(data?.price),tradeTime=typeof data?.time==='string'?Date.parse(data.time):NaN;
  if(!isValidPrice(price))throw Error('Invalid Coinbase price');
  if(!Number.isFinite(tradeTime)||tradeTime>now+5000||now-tradeTime>20000)
    throw Error('Coinbase trade timestamp missing, in the future, or older than 20s');
  return {price,source:SOURCES[1].name};
}
function createMarketFeed({fetchImpl=fetch,clock=()=>Date.now()}={}){
  let cached=null,inflight=null,history=[];
  async function update(){
    if(cached&&clock()-cached.fetchedMs<CACHE_MS)return view();
    if(inflight)return inflight;
    inflight=(async()=>{
      let quote=null;
      for(let i=0;i<SOURCES.length;i++){
        try{
          const body=await getJson(SOURCES[i].url,fetchImpl,3500);
          quote=i===0?parseKraken(body):parseCoinbase(body,clock());
          break;
        }catch(e){}
      }
      if(quote){
        const fetchedMs=clock(),fetchedAt=new Date(fetchedMs).toISOString();
        cached={...quote,fetchedMs,fetchedAt};
        history.push({time:fetchedAt,price:quote.price,source:quote.source});
        if(history.length>HISTORY_LIMIT)history=history.slice(-HISTORY_LIMIT);
      }
      return view();
    })().finally(()=>{inflight=null});
    return inflight;
  }
  function view(){
    const ageMs=cached?Math.max(0,clock()-cached.fetchedMs):null;
    const status=!cached?'unavailable':ageMs<=LIVE_MS?'live':'stale';
    return {status,price:cached?.price??null,source:cached?.source??null,fetchedAt:cached?.fetchedAt??null,ageMs,history:history.slice(),description:'Public spot BTC/USD reference only. Not a Kalshi BRTI value, venue order book, contract quote, or official settlement.'};
  }
  return {update,view};
}
module.exports={createMarketFeed,parseKraken,parseCoinbase,isValidPrice};
