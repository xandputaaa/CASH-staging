'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createMarketFeed,parseKraken,parseCoinbase}=require('../market-feed');
const kraken={error:[],result:{XXBTZUSD:{c:['85432.15','0.01']}}};
const coinbase={price:'85440.80',time:new Date().toISOString()};
test('Kraken spot response parses a real numeric ticker field',()=>assert.deepEqual(parseKraken(kraken),{price:85432.15,source:'Kraken BTC/USD'}));
test('Coinbase fallback spot response parses the last trade price',()=>assert.equal(parseCoinbase(coinbase).price,85440.8));
test('invalid, empty, and API-error upstream data never become a price',()=>{assert.throws(()=>parseKraken({error:['unavailable'],result:{}}));assert.throws(()=>parseKraken({error:[],result:{pair:{c:['NaN']}}}));assert.throws(()=>parseCoinbase({price:'0'}))});
test('live public quote is cached to avoid excessive exchange requests',async()=>{
  let calls=0,now=Date.now();const fetchImpl=async()=>{calls++;return {ok:true,json:async()=>kraken}};
  const feed=createMarketFeed({fetchImpl,clock:()=>now});
  const first=await feed.update(),second=await feed.update();
  assert.equal(first.status,'live');assert.equal(first.price,85432.15);assert.equal(first.source,'Kraken BTC/USD');
  assert.equal(second.history.length,1);assert.equal(calls,1);
  now+=5100;const third=await feed.update();assert.equal(third.history.length,2);assert.equal(calls,2);
});
test('Coinbase read-only fallback activates if Kraken times out or fails',async()=>{
  let calls=0;const fetchImpl=async url=>{calls++;if(url.includes('kraken'))throw Error('network failure');return {ok:true,json:async()=>coinbase}};
  const feed=createMarketFeed({fetchImpl});
  const result=await feed.update();
  assert.equal(calls,2);assert.equal(result.status,'live');assert.equal(result.price,85440.8);assert.equal(result.source,'Coinbase Exchange BTC-USD');
});
test('full outage never fabricates a live BTC quote',async()=>{
  const fetchImpl=async()=>{throw Error('offline')};
  const result=await createMarketFeed({fetchImpl}).update();
  assert.equal(result.status,'unavailable');assert.equal(result.price,null);assert.deepEqual(result.history,[]);
});
test('old cached quotes are clearly marked stale during provider outages',async()=>{
  let now=Date.now(),fail=false;const fetchImpl=async()=>{if(fail)throw Error('offline');return {ok:true,json:async()=>kraken}};
  const feed=createMarketFeed({fetchImpl,clock:()=>now});await feed.update();
  now+=14000;fail=true;const result=await feed.update();
  assert.equal(result.status,'stale');assert.equal(result.price,85432.15);assert.equal(result.history.length,1);
});
test('concurrent viewers share one in-flight market request',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;await new Promise(done=>setTimeout(done,10));return {ok:true,json:async()=>kraken}};
  const feed=createMarketFeed({fetchImpl});const [a,b]=await Promise.all([feed.update(),feed.update()]);
  assert.equal(calls,1);assert.equal(a.price,b.price);
});
