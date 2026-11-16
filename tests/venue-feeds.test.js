'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createVenueFeeds,selectKalshi,selectPolyEvent,price}=require('../venue-feeds');
const now=Date.now(),open=new Date(now-60000).toISOString(),close=new Date(now+120000).toISOString();
const kalshiMarket={ticker:'KXBTC15M-26NOV161145-15',title:'Bitcoin Up in next 15m?',status:'open',open_time:open,close_time:close,yes_bid_dollars:'0.4400',yes_ask_dollars:'0.4700'};
function currentSlot(t=Date.now()){return Math.floor(t/300000)*300}
function polyFixture(slot=currentSlot()){
  const slug='btc-updown-5m-'+slot;
  return [{slug,closed:false,title:'Bitcoin Up or Down 5m',markets:[{closed:false,active:true,conditionId:'0xabc',outcomes:'["Up","Down"]',clobTokenIds:'["12345678901234567890","98765432109876543210"]'}]}];
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
