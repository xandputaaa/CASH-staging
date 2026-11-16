'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createResolver,kalshiOutcome,polymarketOutcome}=require('../resolution-feed');
const ticker='KXBTC15M-26NOV160930-00';
const slug='btc-updown-5m-1794846600';
const id='0x'+'a'.repeat(64);
test('Kalshi result stays pending until officially settled',()=>{
  assert.equal(kalshiOutcome({market:{ticker,status:'open',result:'yes'}},ticker).status,'pending');
  assert.equal(kalshiOutcome({market:{ticker,status:'closed',result:'yes'}},ticker).status,'pending');
  assert.equal(kalshiOutcome({market:{ticker:'wrong',status:'settled',result:'no'}},ticker).status,'pending');
});
test('Kalshi officially settled YES, NO and VOID labels are supported',()=>{
  for(const [result,winner] of [['yes','YES'],['no','NO'],['void','VOID']]){
    assert.equal(kalshiOutcome({market:{ticker,status:'settled',result}},ticker).winner,winner);
  }
});
function poly({status='resolved',prices='["1","0"]',closed=true}={}){
  return [{slug,markets:[{conditionId:id,closed,umaResolutionStatus:status,outcomes:'["Up","Down"]',outcomePrices:prices}]}];
}
test('Polymarket needs resolved status and exact one-hot payouts',()=>{
  assert.equal(polymarketOutcome(poly(),slug,id).winner,'UP');
  assert.equal(polymarketOutcome(poly({prices:'["0","1"]'}),slug,id).winner,'DOWN');
  assert.equal(polymarketOutcome(poly({status:'proposed'}),slug,id).status,'pending');
  assert.equal(polymarketOutcome(poly({closed:false}),slug,id).status,'pending');
  assert.equal(polymarketOutcome(poly({prices:'["0.99","0.01"]'}),slug,id).status,'pending');
});
test('read-only result endpoints never accept arbitrary IDs or URLs',async()=>{
  const resolver=createResolver({fetchImpl:async()=>{throw Error('should not fetch')}});
  await assert.rejects(resolver.lookup({venue:'Kalshi',marketId:'https://example.org'}));
  await assert.rejects(resolver.lookup({venue:'Polymarket',marketId:'0xabc',slug}));
  await assert.rejects(resolver.lookup({venue:'Other',marketId:ticker}));
});
test('unavailable resolution sources do not produce fabricated results',async()=>{
  const resolver=createResolver({fetchImpl:async()=>{throw Error('offline')}});
  const result=await resolver.lookup({venue:'Kalshi',marketId:ticker});
  assert.equal(result.status,'pending');assert.equal(result.winner,undefined);
});
test('official market result lookups are cached',async()=>{
  let calls=0;const resolver=createResolver({fetchImpl:async url=>{calls++;assert.ok(url.includes(ticker));return {ok:true,json:async()=>({market:{ticker,status:'settled',result:'yes'}})}}});
  const a=await resolver.lookup({venue:'Kalshi',marketId:ticker}),b=await resolver.lookup({venue:'Kalshi',marketId:ticker});
  assert.equal(a.status,'verified');assert.equal(b.winner,'YES');assert.equal(calls,1);
});

test('Polymarket settled status is final only with closed one-hot payout',()=>{assert.equal(polymarketOutcome(poly({status:'settled'}),slug,id).winner,'UP');assert.equal(polymarketOutcome(poly({status:'settled',prices:'["0.6","0.4"]'}),slug,id).status,'pending')});
