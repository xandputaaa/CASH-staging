'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createVenueFeeds,selectKalshi,selectPolyEvent,price}=require('../venue-feeds');
const now=Date.now(),open=new Date(now-60000).toISOString(),close=new Date(now+120000).toISOString();
const kalshiMarket={ticker:'KXBTC15M-26NOV161145-15',title:'Bitcoin Up in next 15m?',status:'open',open_time:open,close_time:close,yes_bid_dollars:'0.4400',yes_ask_dollars:'0.4700',no_ask_dollars:'0.5400'};
function currentSlot(t=Date.now()){return Math.floor(t/300000)*300}
function polyFixture(slot=currentSlot()){
  const slug='btc-updown-5m-'+slot;
  return [{slug,closed:false,title:'Bitcoin Up or Down 5m',markets:[{closed:false,active:true,conditionId:'0x'+'a'.repeat(64),outcomes:'["Up","Down"]',clobTokenIds:'["12345678901234567890","98765432109876543210"]'}]}];
}
test('Kalshi selects the current BTC 15m market and fixed-point USD quotes',()=>{const row=selectKalshi({markets:[kalshiMarket]},now);assert.equal(row.yesBid,0.44);assert.equal(row.yesAsk,0.47);assert.equal(row.marketId,kalshiMarket.ticker)});
test('Kalshi rejects invalid prices and non-BTC or expired markets',()=>{assert.equal(price('2'),null);assert.equal(price('NaN'),null);assert.throws(()=>selectKalshi({markets:[{...kalshiMarket,ticker:'OTHER'}]},now));assert.throws(()=>selectKalshi({markets:[{...kalshiMarket,close_time:new Date(now-5000).toISOString()}]},now))});
test('Polymarket discovers the exact current 5m slot and token identity',()=>{const slot=currentSlot(),e=selectPolyEvent(polyFixture(slot),slot,Date.now());assert.equal(e.slug,'btc-updown-5m-'+slot);assert.equal(e.upToken,'12345678901234567890');assert.equal(e.downToken,'98765432109876543210')});
test('Polymarket rejects mismatched slot and missing outcome tokens',()=>{const slot=currentSlot();assert.throws(()=>selectPolyEvent(polyFixture(slot-300),slot,Date.now()));const d=polyFixture(slot);d[0].markets[0].clobTokenIds='[]';assert.throws(()=>selectPolyEvent(d,slot,Date.now()))});
test('venue connector returns live Kalshi public quotes without order submission',async()=>{const fetchImpl=async()=>({ok:true,json:async()=>({markets:[kalshiMarket]})});const feed=createVenueFeeds({fetchImpl,clock:()=>now});const out=await feed.query('Kalshi');assert.equal(out.status,'live');assert.equal(out.yesAsk,0.47);assert.equal(out.venue,'Kalshi')});
test('Polymarket connector separately fetches UP and DOWN public buy prices',async()=>{const t=Date.now(),slot=currentSlot(t);let calls=0;const fetchImpl=async url=>{calls++;if(url.includes('gamma-api'))return {ok:true,json:async()=>polyFixture(slot)};if(url.includes('12345678901234567890'))return {ok:true,json:async()=>({price:'0.62'})};return {ok:true,json:async()=>({price:'0.41'})}};const feed=createVenueFeeds({fetchImpl,clock:()=>t}),out=await feed.query('Polymarket');assert.equal(calls,3);assert.equal(out.status,'live');assert.equal(out.upAsk,0.62);assert.equal(out.downAsk,0.41)});
test('venue connector does not claim success when public APIs are unavailable',async()=>{const feed=createVenueFeeds({fetchImpl:async()=>{throw Error('offline')}});const result=await feed.query('Kalshi');assert.equal(result.status,'unavailable');assert.equal(result.marketId,null)});
test('expired venue quote becomes stale rather than live',async()=>{let t=now;const feed=createVenueFeeds({fetchImpl:async()=>({ok:true,json:async()=>({markets:[kalshiMarket]})}),clock:()=>t});await feed.query('Kalshi');t+=200000;assert.equal(feed.view('Kalshi').status,'stale')});
test('venue connector never accepts arbitrary venue names',async()=>{const feed=createVenueFeeds({fetchImpl:async()=>{throw Error('should not fetch')}});await assert.rejects(feed.query('Other'))});

test('Kalshi only labels two valid public asks as LIVE',()=>{
 const both=selectKalshi({markets:[{...kalshiMarket,no_ask_dollars:'0.54'}]},now);
 assert.equal(both.status,'live');assert.equal(both.yesAsk,0.47);assert.equal(both.noAsk,0.54);
 const partial=selectKalshi({markets:[{...kalshiMarket,no_ask_dollars:null}]},now);
 assert.equal(partial.status,'partial');assert.equal(partial.yesAsk,0.47);
 assert.equal(partial.noAsk,null);
 const reverse=selectKalshi({markets:[{...kalshiMarket,yes_ask_dollars:null,no_ask_dollars:'0.55'}]},now);
 assert.equal(reverse.status,'partial');assert.equal(reverse.yesAsk,null);
 assert.throws(()=>selectKalshi({markets:[{...kalshiMarket,yes_ask_dollars:null,no_ask_dollars:null}]},now),/ask quote/);
});
test('Kalshi rejects listed closed market even with an unexpired close timestamp',()=>{
 assert.throws(()=>selectKalshi({markets:[{...kalshiMarket,status:'closed',no_ask_dollars:'0.54'}]},now),/No current/);
});
test('no usable Kalshi asks returns unavailable rather than green LIVE',async()=>{
 const fetchImpl=async()=>({ok:true,json:async()=>({markets:[{...kalshiMarket,yes_ask_dollars:null,no_ask_dollars:null}]})});
 const result=await createVenueFeeds({fetchImpl,clock:()=>now}).query('Kalshi');
 assert.equal(result.status,'unavailable');assert.equal(result.marketId,null);
});
test('Polymarket requires a full condition ID and distinct outcome tokens before displaying quotes',()=>{
 const slot=currentSlot(now);
 const invalid=polyFixture(slot);
 invalid[0].markets[0].conditionId='0xabc';
 assert.throws(()=>selectPolyEvent(invalid,slot,now),/condition identifier/);
 const duplicate=polyFixture(slot);
 duplicate[0].markets[0].clobTokenIds='["12345678901234567890","12345678901234567890"]';
 assert.throws(()=>selectPolyEvent(duplicate,slot,now),/Duplicate CLOB/);
});

test('Kalshi status=open query returns active market objects, which remain eligible',()=>{
 const active=selectKalshi({markets:[{...kalshiMarket,status:'active'}]},now);
 assert.equal(active.status,'live');
 assert.equal(active.yesAsk,0.47);
 assert.equal(active.noAsk,0.54);
});

test('failed Kalshi refresh remains STALE in cached snapshot, diagnostics and API consumers',async()=>{
 let t=now,failed=false,calls=0;
 const feed=createVenueFeeds({clock:()=>t,fetchImpl:async()=>{
  calls++;if(failed)throw Error('mock Kalshi outage');
  return {ok:true,json:async()=>({markets:[kalshiMarket]})};
 }});
 assert.equal((await feed.query('Kalshi')).status,'live');
 t+=13000;failed=true;
 const result=await feed.query('Kalshi');
 assert.equal(result.status,'stale');assert.equal(result.refreshFailed,true);
 assert.equal(feed.view('Kalshi').status,'stale');
 assert.equal(feed.view('Kalshi').refreshFailedAt,new Date(t).toISOString());
 t+=1000;
 assert.equal((await feed.query('Kalshi')).status,'stale');
 assert.equal(calls,2);
 t+=13000;failed=false;
 const restored=await feed.query('Kalshi');
 assert.equal(restored.status,'live');assert.equal(restored.refreshFailed,false);
 assert.equal(restored.refreshFailedAt,null);
 assert.equal(calls,3);
});
test('failed Polymarket refresh cannot silently recover LIVE until upstream succeeds',async()=>{
 let t=now,failed=false;
 const fetchImpl=async url=>{
  if(failed)throw Error('mock Polymarket outage');
  if(url.includes('gamma-api'))return {ok:true,json:async()=>polyFixture(currentSlot(t))};
  return {ok:true,json:async()=>({price:url.includes('12345678901234567890')?'0.62':'0.41'})};
 };
 const feed=createVenueFeeds({clock:()=>t,fetchImpl});
 assert.equal((await feed.query('Polymarket')).status,'live');
 t+=13000;failed=true;
 assert.equal((await feed.query('Polymarket')).status,'stale');
 assert.equal(feed.view('Polymarket').status,'stale');
 t+=13000;failed=false;
 assert.equal((await feed.query('Polymarket')).status,'live');
});
