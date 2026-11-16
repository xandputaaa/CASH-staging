'use strict';
// Public, read-only settlement lookups. Ambiguous or unavailable outcomes remain PENDING.
const KALSHI='https://external-api.kalshi.com/trade-api/v2';
const GAMMA='https://gamma-api.polymarket.com';
const KALSHI_ID=/^KXBTC15M-[A-Za-z0-9-]{6,70}$/;
const POLY_ID=/^0x[0-9a-fA-F]{64}$/;
const POLY_SLUG=/^btc-updown-5m-\d{9,12}$/;
async function read(url,fetchImpl,timeoutMs=4000){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{const response=await fetchImpl(url,{signal:controller.signal,headers:{Accept:'application/json','User-Agent':'CASH-readonly-results/1.0'}});
  if(!response.ok)throw Error('Public outcome lookup unavailable');
  return await response.json();
 }finally{clearTimeout(timer)}
}
function kalshiOutcome(data,id){
 const m=data?.market;
 if(!m||m.ticker!==id)return {status:'pending',reason:'Mismatched or missing market'};
 const state=String(m.status||'').toLowerCase(),result=String(m.result||'').toLowerCase();
 if(!['settled','finalized'].includes(state)||!['yes','no','void'].includes(result))
  return {status:'pending',reason:'Official market not settled'};
 return {status:'verified',winner:result==='yes'?'YES':result==='no'?'NO':'VOID',source:'Kalshi public market result',settledAt:typeof m.settlement_ts==='string'?m.settlement_ts:null};
}
function decode(value){return typeof value==='string'?JSON.parse(value):value}
function polymarketOutcome(data,slug,marketId){
 const events=Array.isArray(data)?data:[data],ev=events.find(e=>e?.slug===slug);
 const m=ev?.markets?.find(x=>x?.conditionId===marketId);
 if(!m||m.closed!==true)return {status:'pending',reason:'Official market not closed'};
 const resolution=String(m.resolutionStatus||m.umaResolutionStatus||'').toLowerCase();
 // Closure or a 1/0 price alone is not proof: an explicit resolved status is required.
 if(!['resolved','settled'].includes(resolution))return {status:'pending',reason:'Official resolution not final'};
 try{
  const names=decode(m.outcomes),vals=decode(m.outcomePrices);
  if(!Array.isArray(names)||!Array.isArray(vals)||names.length!==2||vals.length!==2)return {status:'pending',reason:'No binary final payout'};
  const up=names.findIndex(x=>String(x).toLowerCase()==='up');
  const down=names.findIndex(x=>String(x).toLowerCase()==='down');
  const prices=vals.map(Number);
  if(up<0||down<0||up===down||!prices.every(x=>x===0||x===1)||prices[up]===prices[down])
   return {status:'pending',reason:'Ambiguous official payout'};
  return {status:'verified',winner:prices[up]===1?'UP':'DOWN',source:'Polymarket Gamma final market result',settledAt:typeof m.updatedAt==='string'?m.updatedAt:null};
 }catch{return {status:'pending',reason:'Unreadable official payout'}}
}
function createResolver({fetchImpl=fetch,clock=()=>Date.now()}={}){
 const map=new Map();
 async function lookup({venue,marketId,slug}){
  if(venue==='Kalshi'&&!KALSHI_ID.test(marketId)||venue==='Polymarket'&&(!POLY_ID.test(marketId)||!POLY_SLUG.test(slug))||!['Kalshi','Polymarket'].includes(venue))
   throw Error('Unsupported market identifier');
  const key=venue+':'+marketId,previous=map.get(key);
  if(previous&&clock()-previous.checkedMs<20000)return previous.result;
  let outcome;
  try{
   if(venue==='Kalshi')outcome=kalshiOutcome(await read(KALSHI+'/markets/'+encodeURIComponent(marketId),fetchImpl),marketId);
   else outcome=polymarketOutcome(await read(GAMMA+'/events?slug='+encodeURIComponent(slug),fetchImpl),slug,marketId);
  }catch{outcome={status:'pending',reason:'Official result service unavailable'}}
  const result={venue,marketId,slug:venue==='Polymarket'?slug:null,...outcome,checkedAt:new Date(clock()).toISOString()};
  map.set(key,{checkedMs:clock(),result});
  return result;
 }
 return {lookup};
}
module.exports={createResolver,kalshiOutcome,polymarketOutcome};
