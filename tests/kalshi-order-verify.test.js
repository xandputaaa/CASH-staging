'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createKalshiOrderVerifier,ownerAuthorized,getHeaders,combine}=require('../kalshi-order-verify');
const orderId='550e8400-e29b-41d4-a716-446655440000';
const ticker='KXBTC15M-26NOV161630-30',at=Date.parse('2026-11-16T23:50:00Z');
function data({executed=true,settled=true}={}){
 const order={order_id:orderId,ticker,status:executed?'executed':'resting',
  action:'buy',side:'yes',fill_count_fp:executed?'2.00':'0.00'};
 const fill={order_id:orderId,ticker,fill_id:'fill-a123',count_fp:'2.00',
  side:'yes',action:'buy',yes_price_dollars:'0.5400',fee_cost:'0.0200',
  created_time:'2026-11-16T23:45:00Z'};
 const settlement={ticker,market_result:'yes',settled_time:'2026-11-17T00:00:00Z'};
 return {order:{order},fills:{fills:executed?[fill]:[],cursor:''},
  settlements:{settlements:settled?[settlement]:[],cursor:''}};
}
function setup({source=data(),token='X'.repeat(42)}={}){
 const key=crypto.generateKeyPairSync('ed25519');
 const pem=key.privateKey.export({format:'pem',type:'pkcs8'}).toString();
 const requests=[];
 const verifier=createKalshiOrderVerifier({
  keyId:'kalshi-read-test-key-123456',privateKeyPem:pem,
  ownerToken:token,clock:()=>at,
  fetchImpl:async(url,opts)=>{
   requests.push({url,opts});
   assert.equal(opts.method,'GET');
   assert.equal(opts.redirect,'error');
   const u=new URL(url);
   assert.equal(u.hostname,'external-api.kalshi.com');
   const signed=opts.headers['KALSHI-ACCESS-SIGNATURE'];
   const input=String(at)+'GET'+u.pathname;
   assert.equal(crypto.verify(null,Buffer.from(input),key.publicKey,
    Buffer.from(signed,'base64')),true);
   let body;
   if(u.pathname.endsWith('/portfolio/orders/'+orderId))body=source.order;
   else if(u.pathname.endsWith('/portfolio/fills'))body=source.fills;
   else if(u.pathname.endsWith('/portfolio/settlements'))body=source.settlements;
   else throw Error('Unexpected account endpoint');
   return {ok:true,json:async()=>body};
  }});
 return {verifier,requests,token};
}
test('owner auth enforces a nontrivial token and constant-time hash comparison',()=>{
 const t='t'.repeat(40);
 assert.equal(ownerAuthorized(t,'Bearer '+t),true);
 assert.equal(ownerAuthorized(t,'Bearer '+t+'x'),false);
 assert.equal(ownerAuthorized('short','Bearer short'),false);
 assert.equal(ownerAuthorized(t,t),false);
 assert.throws(()=>getHeaders(null,'/trade-api/v2/portfolio/fills',at));
});
test('private verifier makes no exchange requests without both credentials and owner auth',async()=>{
 let calls=0;
 const disconnected=createKalshiOrderVerifier({
  keyId:null,privateKeyPem:null,ownerToken:null,
  fetchImpl:async()=>{calls++;throw Error('must not call')}});
 assert.equal(disconnected.publicStatus().state,'NOT_CONNECTED');
 await assert.rejects(()=>disconnected.verify(orderId,'Bearer '+'X'.repeat(42)),
  /VERIFIER_NOT_CONFIGURED/);
 const h=setup();
 await assert.rejects(()=>h.verifier.verify(orderId,'Bearer invalid'),/OWNER_NOT_AUTHORIZED/);
 await assert.rejects(()=>h.verifier.verify('../../withdrawals','Bearer '+h.token),
  /INVALID_ORDER_ID/);
 assert.equal(h.requests.length,0);
 assert.equal(calls,0);
});
test('actual matched exchange fills verify execution and fees; market settlement is not order-level profit',async()=>{
 const h=setup();
 const out=await h.verifier.verify(orderId,'Bearer '+h.token);
 assert.equal(out.evidence.grade,'FILL_AND_ACCOUNT_SETTLEMENT_VERIFIED');
 assert.equal(out.evidence.filledExecutionVerified,true);
 assert.equal(out.evidence.matchingFillCount,1);
 assert.equal(out.evidence.matchedQuantity,2);
 assert.equal(out.evidence.totalFillPriceDollars,1.08);
 assert.equal(out.evidence.recordedFillFeesDollars,0.02);
 assert.equal(out.evidence.settlementRecordLinkedByTicker,true);
 assert.equal(out.evidence.marketSettlementResult,'yes');
 assert.equal(out.evidence.orderSpecificNetPnlVerified,false);
 assert.equal(out.prediction.afterFeeEdgeVerified,false);
 assert.equal(out.tradingEnabled,false);
 assert.equal(out.realTradeOrderSubmittedByCash,false);
 assert.equal(h.requests.length,3);
 for(const x of h.requests)assert.equal(x.opts.method,'GET');
});
test('existing but unfilled order is NOT real-money execution verified',async()=>{
 const h=setup({source:data({executed:false,settled:false})});
 const out=await h.verifier.verify(orderId,'Bearer '+h.token);
 assert.equal(out.evidence.grade,'NOT_EXECUTION_VERIFIED');
 assert.equal(out.evidence.filledExecutionVerified,false);
 assert.equal(out.evidence.matchingFillCount,0);
 assert.equal(out.evidence.recordedFillFeesDollars,null);
});
test('pagination or order-vs-fill quantity mismatch fails closed',async()=>{
 const src=data();src.fills.cursor='more';
 let out=await setup({source:src}).verifier.verify(orderId,'Bearer '+'X'.repeat(42));
 assert.equal(out.evidence.filledExecutionVerified,false);
 assert.equal(out.evidence.fullFillHistoryVerified,false);
 const bad=data();bad.order.order.fill_count_fp='5.00';
 out=await setup({source:bad}).verifier.verify(orderId,'Bearer '+'X'.repeat(42));
 assert.equal(out.evidence.filledExecutionVerified,false);
});
test('order mismatch and mixed-market fills are rejected rather than counted',async()=>{
 const x=data();x.order.order.ticker='KXETH15M-BAD';
 await assert.rejects(()=>setup({source:x}).verifier.verify(orderId,'Bearer '+'X'.repeat(42)),
  /NOT_A_VERIFIABLE_KXBTC15M_ORDER/);
 const y=data();y.fills.fills[0].ticker='KXETH15M-BAD';y.fills.fills[0].market_ticker='KXETH15M-BAD';
 await assert.rejects(()=>setup({source:y}).verifier.verify(orderId,'Bearer '+'X'.repeat(42)),
  /FILL_MARKET_MISMATCH/);
});
test('settlement failures never fabricate verified profit and do not erase real execution evidence',async()=>{
 const x=data();x.settlements={settlements:[],cursor:''};
 const out=await setup({source:x}).verifier.verify(orderId,'Bearer '+'X'.repeat(42));
 assert.equal(out.evidence.grade,'FILL_VERIFIED');
 assert.equal(out.evidence.filledExecutionVerified,true);
 assert.equal(out.evidence.settlementRecordLinkedByTicker,false);
 assert.equal(out.evidence.orderSpecificNetPnlVerified,false);
});
