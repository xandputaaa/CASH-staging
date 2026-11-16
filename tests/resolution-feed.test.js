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
test('official market result requires two independent time-separated matching reads, with cached first result',async()=>{
  let calls=0,now=Date.now();
  const body={market:{ticker,status:'settled',result:'yes',is_provisional:false,settlement_ts:new Date(now-1000).toISOString()}};
  const resolver=createResolver({clock:()=>now,fetchImpl:async url=>{
    calls++;assert.ok(url.includes(ticker));return {ok:true,json:async()=>body}
  }});
  const a=await resolver.lookup({venue:'Kalshi',marketId:ticker});
  const b=await resolver.lookup({venue:'Kalshi',marketId:ticker});
  assert.equal(a.status,'pending');assert.match(a.reason,/second matching/);
  assert.equal(b.status,'pending');assert.equal(calls,1);
  now+=21000;
  const verified=await resolver.lookup({venue:'Kalshi',marketId:ticker});
  assert.equal(verified.status,'verified');assert.equal(verified.winner,'YES');
  assert.equal(verified.confirmationCount,2);assert.equal(calls,2);
  assert.match(verified.evidenceSourceUrl,/external-api.kalshi.com/);
  assert.match(verified.evidenceSha256,/^[0-9a-f]{64}$/);
  assert.equal(verified.evidenceSnapshot.result,'yes');
  assert.equal(verified.firstObservedAt,new Date(now-21000).toISOString());
});

test('Polymarket settled status is final only with closed one-hot payout',()=>{assert.equal(polymarketOutcome(poly({status:'settled'}),slug,id).winner,'UP');assert.equal(polymarketOutcome(poly({status:'settled',prices:'["0.6","0.4"]'}),slug,id).status,'pending')});

test('Kalshi provisional market cannot be verified even when status reports settled',()=>{
 assert.equal(kalshiOutcome({market:{ticker,status:'settled',result:'yes',is_provisional:true}},ticker).status,'pending');
});
test('opposite final outcomes reset confirmation and cannot settle on a single contradictory fetch',async()=>{
 let now=Date.now(),winner='yes',calls=0;
 const r=createResolver({clock:()=>now,fetchImpl:async()=>{
  calls++;return {ok:true,json:async()=>({market:{ticker,status:'settled',result:winner}})};
 }});
 assert.equal((await r.lookup({venue:'Kalshi',marketId:ticker})).status,'pending');
 now+=21000;winner='no';
 const changed=await r.lookup({venue:'Kalshi',marketId:ticker});
 assert.equal(changed.status,'pending');assert.equal(changed.tentativeWinner,'NO');
 now+=21000;
 const verified=await r.lookup({venue:'Kalshi',marketId:ticker});
 assert.equal(verified.status,'verified');assert.equal(verified.winner,'NO');
 assert.equal(calls,3);
});
test('an official source outage resets previous tentative settlement confirmation',async()=>{
 let now=Date.now(),offline=false;
 const r=createResolver({clock:()=>now,fetchImpl:async()=>{
  if(offline)throw Error('offline');
  return {ok:true,json:async()=>({market:{ticker,status:'settled',result:'yes'}})};
 }});
 assert.equal((await r.lookup({venue:'Kalshi',marketId:ticker})).status,'pending');
 now+=21000;offline=true;
 assert.equal((await r.lookup({venue:'Kalshi',marketId:ticker})).status,'pending');
 now+=21000;offline=false;
 assert.equal((await r.lookup({venue:'Kalshi',marketId:ticker})).status,'pending');
 now+=21000;assert.equal((await r.lookup({venue:'Kalshi',marketId:ticker})).status,'verified');
});
test('Polymarket final outcomes require two matching reads and include raw field evidence',async()=>{
 let now=Date.now(),calls=0;
 const r=createResolver({clock:()=>now,fetchImpl:async()=>{
  calls++;return {ok:true,json:async()=>poly({status:'resolved'})};
 }});
 const a=await r.lookup({venue:'Polymarket',marketId:id,slug});
 assert.equal(a.status,'pending');assert.equal(a.tentativeWinner,'UP');
 now+=21000;const b=await r.lookup({venue:'Polymarket',marketId:id,slug});
 assert.equal(b.status,'verified');assert.equal(b.winner,'UP');assert.equal(calls,2);
 assert.equal(b.evidenceSnapshot.conditionId,id);
 assert.equal(b.evidenceSnapshot.umaResolutionStatus,'resolved');
 assert.match(b.evidenceSha256,/^[0-9a-f]{64}$/);
});

test('subsequent unchanged finalized public results remain confirmed after initial two-check verification',async()=>{
 let now=Date.now(),calls=0;
 const resolver=createResolver({clock:()=>now,fetchImpl:async()=>{
  calls++;return {ok:true,json:async()=>({market:{ticker,status:'settled',result:'yes'}})};
 }});
 assert.equal((await resolver.lookup({venue:'Kalshi',marketId:ticker})).status,'pending');
 now+=21000;assert.equal((await resolver.lookup({venue:'Kalshi',marketId:ticker})).status,'verified');
 now+=21000;const again=await resolver.lookup({venue:'Kalshi',marketId:ticker});
 assert.equal(again.status,'verified');
 assert.equal(again.confirmationCount,2);
 assert.equal(calls,3);
});
test('previously confirmed winner is withdrawn immediately if official response changes',async()=>{
 let now=Date.now(),winner='yes';
 const resolver=createResolver({clock:()=>now,fetchImpl:async()=>({
  ok:true,json:async()=>({market:{ticker,status:'settled',result:winner}})
 })});
 await resolver.lookup({venue:'Kalshi',marketId:ticker});
 now+=21000;assert.equal((await resolver.lookup({venue:'Kalshi',marketId:ticker})).status,'verified');
 now+=21000;winner='no';
 const changed=await resolver.lookup({venue:'Kalshi',marketId:ticker});
 assert.equal(changed.status,'pending');assert.equal(changed.tentativeWinner,'NO');
 now+=21000;
 const recertified=await resolver.lookup({venue:'Kalshi',marketId:ticker});
 assert.equal(recertified.status,'verified');assert.equal(recertified.winner,'NO');
});
