'use strict';
// CASH read-only resolution adapter. Finality requires two consistent public
// responses obtained at different times. Neither response proves immutable
// exchange records, source authenticity, or independent market-rule auditing.
const {createHash}=require('node:crypto');
const KALSHI='https://external-api.kalshi.com/trade-api/v2';
const GAMMA='https://gamma-api.polymarket.com';
const KALSHI_ID=/^KXBTC15M-[A-Za-z0-9-]{6,70}$/;
const POLY_ID=/^0x[0-9a-fA-F]{64}$/;
const POLY_SLUG=/^btc-updown-5m-\d{9,12}$/;
const CONFIRMATION_MS=20000,CACHE_MS=15000;
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
 if(m.is_provisional===true)return {status:'pending',reason:'Provisional result is not final'};
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
 if(!['resolved','settled'].includes(resolution))return {status:'pending',reason:'Official resolution not final'};
 try{
  const names=decode(m.outcomes),vals=decode(m.outcomePrices);
  if(!Array.isArray(names)||!Array.isArray(vals)||names.length!==2||vals.length!==2)return {status:'pending',reason:'No binary final payout'};
  const up=names.findIndex(x=>String(x).toLowerCase()==='up'),down=names.findIndex(x=>String(x).toLowerCase()==='down');
  const prices=vals.map(Number);
  if(up<0||down<0||up===down||!prices.every(x=>x===0||x===1)||prices[up]===prices[down])
   return {status:'pending',reason:'Ambiguous official payout'};
  return {status:'verified',winner:prices[up]===1?'UP':'DOWN',source:'Polymarket Gamma final market result',settledAt:typeof m.updatedAt==='string'?m.updatedAt:null};
 }catch{return {status:'pending',reason:'Unreadable official payout'}}
}
function marketEvidence(venue,body,marketId,slug){
 let selected;
 if(venue==='Kalshi'){
  const m=body?.market||{};
  selected={venue,ticker:m.ticker,status:m.status,result:m.result,is_provisional:m.is_provisional??null,settlement_ts:m.settlement_ts??null,close_time:m.close_time??null};
 }else{
  const events=Array.isArray(body)?body:[body],m=events.find(e=>e?.slug===slug)?.markets?.find(x=>x?.conditionId===marketId)||{};
  selected={venue,slug,conditionId:m.conditionId??null,closed:m.closed??null,
   resolutionStatus:m.resolutionStatus??null,umaResolutionStatus:m.umaResolutionStatus??null,
   outcomes:m.outcomes??null,outcomePrices:m.outcomePrices??null,updatedAt:m.updatedAt??null};
 }
 return createHash('sha256').update(JSON.stringify(selected)).digest('hex');
}
function createResolver({fetchImpl=fetch,clock=()=>Date.now(),confirmationMs=CONFIRMATION_MS,cacheMs=CACHE_MS}={}){
 const cache=new Map(),tentative=new Map();
 async function lookup({venue,marketId,slug}){
  if(venue==='Kalshi'&&!KALSHI_ID.test(marketId)||venue==='Polymarket'&&(!POLY_ID.test(marketId)||!POLY_SLUG.test(slug))||!['Kalshi','Polymarket'].includes(venue))
   throw Error('Unsupported market identifier');
  const now=clock(),key=venue+':'+marketId,previous=cache.get(key);
  if(previous&&now-previous.checkedMs<cacheMs)return previous.result;
  let outcome,body=null;
  const sourceUrl=venue==='Kalshi'?KALSHI+'/markets/'+encodeURIComponent(marketId):GAMMA+'/events?slug='+encodeURIComponent(slug);
  try{
   body=await read(sourceUrl,fetchImpl);
   outcome=venue==='Kalshi'?kalshiOutcome(body,marketId):polymarketOutcome(body,slug,marketId);
  }catch{outcome={status:'pending',reason:'Official result service unavailable'}}
  const checkedAt=new Date(clock()).toISOString();
  if(outcome.status==='verified'&&body){
   const latest=tentative.get(key);
   const digest=marketEvidence(venue,body,marketId,slug);
   if(latest&&latest.winner===outcome.winner&&latest.source===outcome.source
      &&clock()-latest.firstObservedMs>=confirmationMs){
    outcome={...outcome,confirmationCount:2,firstObservedAt:new Date(latest.firstObservedMs).toISOString(),
      evidenceSourceUrl:sourceUrl,evidenceSha256:digest,
      evidenceCaveat:'Checksum of selected public API fields, not an immutable or independently authenticated settlement proof'};
    tentative.delete(key);
   }else{
    if(!latest||latest.winner!==outcome.winner||latest.source!==outcome.source)
     tentative.set(key,{winner:outcome.winner,source:outcome.source,firstObservedMs:clock()});
    outcome={status:'pending',reason:'Waiting for second matching finalized public result',tentativeWinner:outcome.winner};
   }
  }else tentative.delete(key);
  const result={venue,marketId,slug:venue==='Polymarket'?slug:null,...outcome,checkedAt};
  cache.set(key,{checkedMs:clock(),result});
  return result;
 }
 return {lookup};
}
module.exports={createResolver,kalshiOutcome,polymarketOutcome,marketEvidence};
