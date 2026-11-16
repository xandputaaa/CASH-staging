'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
function browser(fetchImpl){
  const map=new Map(),document={hidden:false,getElementById(id){if(!map.has(id))map.set(id,{textContent:'',className:'',innerHTML:'',disabled:false,setAttribute(key,val){this[key]=val}});return map.get(id)},addEventListener(){}};
  const store=new Map(),localStorage={getItem:key=>store.get(key)||null,setItem:(key,val)=>store.set(key,val)};
  const ctx=vm.createContext({document,localStorage,alert(){},confirm(){return false},fetch:fetchImpl,AbortController,setTimeout,clearTimeout});
  vm.runInContext(script,ctx);
  return {get:id=>document.getElementById(id),run:expr=>vm.runInContext(expr,ctx)};
}
const now=Date.now(),fetchedAt=new Date(now).toISOString(),endTime=new Date(now+180000).toISOString();
const spot={status:'live',price:85436.56,source:'Kraken BTC/USD',fetchedAt,history:[{price:85431.34,time:new Date(now-5000).toISOString()},{price:85436.56,time:fetchedAt}]};
const kalshi={venue:'Kalshi',status:'live',fetchedAt,endTime,title:'BTC Up or Down',marketId:'KXBTC15M-MOCK',yesBid:0.45,yesAsk:0.47};
const poly={venue:'Polymarket',status:'live',fetchedAt,endTime,title:'BTC 5m Up/Down',marketId:'test-condition',upAsk:0.53,downAsk:0.48};
const goodFetch=async url=>({ok:true,json:async()=>url==='/api/spot'?spot:url.includes('Kalshi')?kalshi:poly});
test('live BTC spot and both venue widgets render actual API response fields',async()=>{
  const app=browser(goodFetch);await app.run("Promise.all([refreshSpot(),refreshVenue('Kalshi'),refreshVenue('Polymarket')])");
  assert.equal(app.get('spotPrice').textContent,'$85,436.56');
  assert.equal(app.get('spotStatus').textContent,'LIVE');
  assert.match(app.get('spotLine').d,/^M /);
  assert.equal(app.get('kalshiBid').textContent,'45.0¢');assert.equal(app.get('kalshiAsk').textContent,'47.0¢');
  assert.equal(app.get('polyUp').textContent,'53.0¢');assert.equal(app.get('polyDown').textContent,'48.0¢');
  assert.equal(app.get('kalshiState').textContent,'LIVE');assert.equal(app.get('polyState').textContent,'LIVE');
});
test('live UI fails closed with unavailable quotes instead of displaying fabricated prices',async()=>{
  const app=browser(async()=>({ok:false,json:async()=>({status:'unavailable',price:null})}));
  await app.run("Promise.all([refreshSpot(),refreshVenue('Kalshi'),refreshVenue('Polymarket')])");
  assert.equal(app.get('spotStatus').textContent,'OFFLINE');
  assert.equal(app.get('kalshiState').textContent,'OFFLINE');
  assert.equal(app.get('polyState').textContent,'OFFLINE');
  assert.equal(app.get('kalshiBid').textContent,'—');
  assert.equal(app.get('polyUp').textContent,'—');
});
test('outdated live prices and expired venues visibly lose their LIVE badges',async()=>{
  const old=new Date(now-120000).toISOString();
  const fetchImpl=async url=>({ok:true,json:async()=>url==='/api/spot'?{...spot,fetchedAt:old,status:'stale'}:url.includes('Kalshi')?{...kalshi,endTime:new Date(now-1000).toISOString()}:{...poly,status:'stale'}});
  const app=browser(fetchImpl);await app.run("Promise.all([refreshSpot(),refreshVenue('Kalshi'),refreshVenue('Polymarket')])");
  assert.equal(app.get('spotStatus').textContent,'STALE');
  assert.notEqual(app.get('kalshiState').textContent,'LIVE');
  assert.equal(app.get('polyState').textContent,'STALE');
});
