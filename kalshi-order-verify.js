'use strict';
/*
 * Owner-only exchange-record verification. Fixed GET-only Kalshi API
 * allowlist: no order placement, cancellation, withdraw, account balance,
 * strategy approval, or trading capability. Credentials never leave server.
 *
 * Order accepted != order filled. A settlement on a ticker applies to the
 * account's market position, not necessarily a specific single order.
 */
const crypto=require('node:crypto');
const {readConfig}=require('./kalshi-brti');
const HOST='https://external-api.kalshi.com';
const PREFIX='/trade-api/v2';
const ID=/^[A-Za-z0-9_-]{8,100}$/;
const TICKER=/^KXBTC15M-[A-Za-z0-9-]{6,70}$/;
const PRICE=/^(?:0|[1-9][0-9]{0,7})(?:\.[0-9]{1,8})?$/;
const MAX_ROWS=100;
function amount(v){
 if(typeof v!=='number'&&typeof v!=='string')return null;
 const str=String(v);
 if(!PRICE.test(str))return null;
 const n=Number(str);
 return Number.isFinite(n)&&n>=0?n:null;
}
function ownerAuthorized(expected,bearer){
 if(typeof expected!=='string'||expected.length<32||expected.length>512)return false;
 if(typeof bearer!=='string'||!bearer.startsWith('Bearer '))return false;
 const supplied=bearer.slice(7);
 const a=crypto.createHash('sha256').update(expected).digest();
 const b=crypto.createHash('sha256').update(supplied).digest();
 return crypto.timingSafeEqual(a,b);
}
function getHeaders(config,pathname,time){
 if(!config||config.state!=='CONFIGURED')throw Error('READ_KEY_UNAVAILABLE');
 if(!(/^\/trade-api\/v2\/portfolio\/orders\/[A-Za-z0-9_-]{8,100}$/.test(pathname)||
   pathname===PREFIX+'/portfolio/fills'||
   pathname===PREFIX+'/portfolio/settlements'))
  throw Error('NON_READ_PATH_REJECTED');
 const msg=String(time)+'GET'+pathname;
 const signature=config.key.asymmetricKeyType==='ed25519'?
  crypto.sign(null,Buffer.from(msg),config.key):
  crypto.sign('sha256',Buffer.from(msg),{key:config.key,
   padding:crypto.constants.RSA_PKCS1_PSS_PADDING,
   saltLength:crypto.constants.RSA_PSS_SALTLEN_DIGEST});
 return {'KALSHI-ACCESS-KEY':config.keyId,
  'KALSHI-ACCESS-SIGNATURE':signature.toString('base64'),
  'KALSHI-ACCESS-TIMESTAMP':String(time),Accept:'application/json'};
}
function combine({orderId,orderData,fillData,settlementData,at}){
 const o=orderData?.order;
 if(!o||o.order_id!==orderId||!TICKER.test(o.ticker))
  throw Error('ORDER_NOT_CONFIRMED');
 if(!fillData||!Array.isArray(fillData.fills))
  throw Error('FILLS_NOT_CONFIRMED');
 const rows=fillData.fills.filter(x=>x?.order_id===orderId);
 if(rows.some(x=>x.ticker!==o.ticker&&x.market_ticker!==o.ticker))
  throw Error('FILL_MARKET_MISMATCH');
 const known=new Set(),seen=[];
 let quantity=0,fee=0,cost=0,allCostsPresent=true;
 for(const x of rows){
  if(typeof x.fill_id!=='string'||x.fill_id.length<5||known.has(x.fill_id)||
    !['yes','no'].includes(String(x.side||x.outcome_side).toLowerCase())||
    !['buy','sell'].includes(String(x.action).toLowerCase()))
   throw Error('FILL_INCONSISTENT');
  known.add(x.fill_id);
  const count=amount(x.count_fp),unit=amount((x.side||x.outcome_side)==='no'?
   x.no_price_dollars:x.yes_price_dollars);
  if(count===null||count<=0||unit===null||unit>1)throw Error('FILL_COUNT_OR_PRICE_INVALID');
  const f=amount(x.fee_cost);
  if(f===null)allCostsPresent=false;
  else fee+=f;
  quantity+=count;cost+=count*unit;
  seen.push({fillId:x.fill_id,side:x.side||x.outcome_side,
   action:x.action,quantity:count,unitPriceDollars:unit,
   feeDollars:f,executedAt:x.created_time||null});
 }
 const officialFilled=amount(o.fill_count_fp);
 const incomplete=Boolean(fillData.cursor)||rows.length>=MAX_ROWS||
  officialFilled!==null&&Math.abs(quantity-officialFilled)>0.000001;
 const executed=seen.length>0&&quantity>0&&!incomplete;
 const settlementRows=settlementData?.settlements;
 const row=Array.isArray(settlementRows)?
  settlementRows.find(x=>x?.ticker===o.ticker&&['yes','no','void'].includes(x.market_result)):null;
 const settlementComplete=Boolean(row)&&!settlementData.cursor;
 const grade=executed?(settlementComplete?'FILL_AND_ACCOUNT_SETTLEMENT_VERIFIED':
  'FILL_VERIFIED'):'NOT_EXECUTION_VERIFIED';
 const reason=executed?
  (settlementComplete?'A real matched fill and ticker-level account settlement were returned by Kalshi.':
   'Real matched fills were returned by Kalshi; ticker-level account settlement is not confirmed.'):
  (incomplete?'Fill history is incomplete or conflicts with the order quantity.':
   'Order exists but a matched execution was not established.');
 return {
  version:'CASH_KALSHI_PRIVATE_ORDER_AUDIT_V1',
  checkedAt:new Date(at).toISOString(),exchange:'KALSHI_PRODUCTION',
  method:'READ_ONLY_EXCHANGE_ORDER_FILL_SETTLEMENT',
  order:{orderId,ticker:o.ticker,status:typeof o.status==='string'?o.status:'UNKNOWN',
   side:o.side||o.outcome_side||null,action:o.action||null,
   expectedFilledQuantity:officialFilled},
  evidence:{grade,orderFound:true,filledExecutionVerified:executed,
   matchingFillCount:seen.length,matchedQuantity:quantity,
   totalFillPriceDollars:executed?Math.round(cost*10000)/10000:null,
   recordedFillFeesDollars:executed&&allCostsPresent?Math.round(fee*10000)/10000:null,
   fullFillHistoryVerified:!incomplete,
   settlementRecordLinkedByTicker:settlementComplete,
   marketSettlementResult:settlementComplete?row.market_result:null,
   orderSpecificNetPnlVerified:false,
   fills:executed?seen.slice(0,20):[]},
  prediction:{cashModelMatchedToOrder:false,
   prospectiveModelQualified:false,afterFeeEdgeVerified:false},
  realTradeOrderSubmittedByCash:false,
  tradingEnabled:false,
  note:reason+' Settlement is account/market-level, not an attributable P&L of this single order. This does not prove CASH prediction accuracy or profitability.'
 };
}
function createKalshiOrderVerifier({fetchImpl=fetch,clock=()=>Date.now(),
 keyId=process.env.CASH_KALSHI_READ_KEY_ID,
 privateKeyPem=process.env.CASH_KALSHI_READ_KEY_PEM,
 ownerToken=process.env.CASH_OWNER_VERIFY_TOKEN}={}){
 const auth=readConfig(keyId,privateKeyPem);
 const configured=auth.state==='CONFIGURED'&&typeof ownerToken==='string'&&
  ownerToken.length>=32&&ownerToken.length<=512;
 function publicStatus(){
  return {version:'CASH_ORDER_VERIFICATION_READINESS_V1',
   state:configured?'PRIVATE_VERIFICATION_CONFIGURED':'NOT_CONNECTED',
   ownerAccessConfigured:configured,
   verifiedLiveOrders:0, // not a count: no account query occurs until authorized
   independentlyValidatedPredictions:0,
   automaticOrdersEnabled:false,orderPlacementEnabled:false,
   note:configured?
    'Owner may request one signed read-only account lookup using a private access token. No public account records are returned.':
    'A Kalshi read-only account key plus a separate 32+ character owner token are required. No exchange order or fill has been verified here.'};
 }
 async function get(path,query=''){
  const time=clock(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
  try{
   const response=await fetchImpl(HOST+path+query,{
    method:'GET',redirect:'error',signal:controller.signal,
    headers:getHeaders(auth,path,time)});
   if(!response.ok)throw Error(response.status===401||response.status===403?'EXCHANGE_AUTH_FAILED':
    response.status===404?'ORDER_OR_RECORD_NOT_FOUND':'EXCHANGE_UNAVAILABLE');
   return await response.json();
  }finally{clearTimeout(timer)}
 }
 async function verify(orderId,bearer){
  if(!configured)throw Error('VERIFIER_NOT_CONFIGURED');
  if(!ownerAuthorized(ownerToken,bearer))throw Error('OWNER_NOT_AUTHORIZED');
  if(typeof orderId!=='string'||!ID.test(orderId))throw Error('INVALID_ORDER_ID');
  const orderData=await get(PREFIX+'/portfolio/orders/'+orderId);
  if(orderData?.order?.order_id!==orderId||!TICKER.test(orderData?.order?.ticker))
   throw Error('NOT_A_VERIFIABLE_KXBTC15M_ORDER');
  const ticker=orderData.order.ticker;
  const fills=await get(PREFIX+'/portfolio/fills',
   '?order_id='+encodeURIComponent(orderId)+'&limit='+MAX_ROWS);
  // Do not let failed ticker-level account settlement invalidate an authentic
  // fill: show "settlement unverified" if access/record is unavailable.
  let settlement=null;
  try{settlement=await get(PREFIX+'/portfolio/settlements',
   '?ticker='+encodeURIComponent(ticker)+'&limit='+MAX_ROWS)}catch{}
  return combine({orderId,orderData,fillData:fills,settlementData:settlement,at:clock()});
 }
 return {publicStatus,verify,configured};
}
module.exports={createKalshiOrderVerifier,ownerAuthorized,getHeaders,combine};
