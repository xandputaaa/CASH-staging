'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseKrakenOHLC,parseKalshiCandles,createCashV3ChartFeed}=require('../cash-v3-chart-feed');
const NOW=Date.parse('2026-11-19T20:12:18.000Z');
const iso=ms=>new Date(ms).toISOString();
const TICKER='KXBTC15M-26NOV192000';
function kraken(rows=20){
 const minute=Math.floor(NOW/60000)*60000;
 const candles=Array.from({length:rows},(_,i)=>{
  const t=minute-(rows-i-1)*60000;
  const p=90100+i*1.25;
  return [t/1000,String(p),String(p+2),String(p-2),String(p+.7),'0','1.0',3];
 });
 return {error:[],result:{XXBTZUSD:candles,last:1234}};
}
function kalshi(){
 const period=Math.floor(NOW/60000)*60000;
 return {ticker:TICKER,candlesticks:Array.from({length:9},(_,i)=>({
  end_period_ts:(period-(8-i)*60000)/1000,
  yes_bid:{close_dollars:(.37+i*.01).toFixed(4)},
  yes_ask:{close_dollars:(.41+i*.01).toFixed(4)}
 }))};
}
function quote(){return {venue:'Kalshi',marketId:TICKER,status:'live',
 fetchedAt:iso(NOW-1000),endTime:iso(NOW+162000),openTime:iso(NOW-12*60000),
 yesAsk:.52,noAsk:.49}};
function spot(){return {status:'live',source:'Kraken BTC/USD',price:90125,
 fetchedAt:iso(NOW-1000),history:[
  {time:iso(NOW-11000),price:90124,source:'Kraken BTC/USD'},
  {time:iso(NOW-1000),price:90125,source:'Kraken BTC/USD'}
 ]};}
test('Kraken parser reads true closed one-minute candles but excludes uncommitted final bar',()=>{
 const candles=parseKrakenOHLC(kraken(),NOW);
 assert.equal(candles.length,19);
 assert.equal(candles.at(-1).kind,'CLOSED_1M');
 assert.equal(candles.at(-1).t,Math.floor(NOW/60000)*60000);
 assert.ok(candles.every(c=>c.high>=c.close&&c.low<=c.close));
});
test('Kraken parser rejects ambiguous, malformed or invalid source data',()=>{
 assert.throws(()=>parseKrakenOHLC({},NOW),/invalid/);
 assert.throws(()=>parseKrakenOHLC({error:['API offline'],result:{}},NOW),/invalid/);
 assert.throws(()=>parseKrakenOHLC({error:[],result:{a:[],b:[]}},NOW),/ambiguous/);
});
test('Kalshi historical NO series is disclosed as complement of YES bid, not a real NO quote',()=>{
 const out=parseKalshiCandles(kalshi(),TICKER,NOW);
 assert.equal(out.yes.length,9);
 assert.equal(out.no.length,9);
 assert.equal(out.yes[0].v,.41);
 assert.equal(out.no[0].v,.63);
 assert.equal(out.no[0].kind,'DERIVED_FROM_KALSHI_YES_BID');
 assert.throws(()=>parseKalshiCandles(kalshi(),'KXBTC15M-NOT-THE-SAME',NOW),/ticker mismatch/);
});
test('CASH chart only appends actual same-source post-candle spot ticks and newest live quote ticks',async()=>{
 let calls=0;
 const fetchImpl=async url=>{
  calls++;
  return {ok:true,json:async()=>url.includes('kraken.com')?kraken():kalshi()};
 };
 const feed=createCashV3ChartFeed({fetchImpl,clock:()=>NOW});
 const result=await feed.query({quote:quote(),spot:spot()});
 assert.equal(result.version,'CASH_V3_CHART_V1');
 assert.equal(result.btc.status,'LIVE');
 assert.equal(result.btc.points.at(-1).t,NOW-1000);
 assert.equal(result.btc.points.at(-1).v,90125);
 assert.equal(result.btc.points.at(-1).kind,'KRAKEN_OBSERVED_TICK');
 assert.equal(result.yes.points.at(-1).kind,'OBSERVED_KALSHI_QUOTE');
 assert.equal(result.no.points.at(-1).kind,'OBSERVED_KALSHI_QUOTE');
 assert.equal(result.inventedTicks,0);
 assert.equal(result.syntheticForecastPath,false);
 assert.equal(result.btc.signalLab.version,'CASH_SIGNAL_LAB_V1');
 assert.equal(result.btc.signalLab.status,'INSUFFICIENT_DATA');
 assert.equal(result.btc.signalLab.executionAuthorized,false);
 assert.ok(result.btc.candles.every(c=>c.kind==='CLOSED_1M'));
 assert.equal(result.realOrdersEnabled,false);
 assert.equal(calls,2);
 await feed.query({quote:quote(),spot:spot()});
 assert.equal(calls,2,'45-second source history cache avoids upstream hammering');
});
test('Coinbase fallback cannot silently become a plotted Kraken price',async()=>{
 const feed=createCashV3ChartFeed({fetchImpl:async url=>({ok:true,json:async()=>url.includes('kraken.com')?kraken():kalshi()}),clock:()=>NOW});
 const s={...spot(),source:'Coinbase Exchange BTC-USD',price:88700,
  history:[{time:iso(NOW-1000),price:88700,source:'Coinbase Exchange BTC-USD'}]};
 const x=await feed.query({quote:quote(),spot:s});
 assert.notEqual(x.btc.status,'LIVE');
 assert.equal(x.btc.points.some(p=>p.v===88700),false);
 assert.equal(x.btc.points.some(p=>p.kind==='KRAKEN_OBSERVED_TICK'),false);
});
test('source failure is explicit, does not manufacture chart history',async()=>{
 const feed=createCashV3ChartFeed({fetchImpl:async()=>{throw Error('offline')},clock:()=>NOW});
 const x=await feed.query({quote:quote(),spot:{status:'unavailable',history:[]}});
 assert.equal(x.btc.status,'OHLC_UNAVAILABLE');
 assert.equal(x.btc.points.length,0);
 assert.deepEqual(x.btc.candles,[]);
 assert.equal(x.btc.signalLab.status,'UNAVAILABLE');
 assert.deepEqual(x.btc.signalLab.markers,[]);
 assert.equal(x.yes.status,'CANDLES_UNAVAILABLE');
 assert.equal(x.no.status,'CANDLES_UNAVAILABLE');
 assert.equal(x.syntheticForecastPath,false);
});
test('contract rollover discards old YES/NO quote samples instead of joining different markets',async()=>{
 const feed=createCashV3ChartFeed({fetchImpl:async url=>({ok:true,json:async()=>url.includes('kraken.com')?kraken():kalshi()}),clock:()=>NOW});
 await feed.query({quote:quote(),spot:spot()});
 const q2={...quote(),marketId:'KXBTC15M-26NOV192015',yesAsk:.77,noAsk:.24};
 const x=await feed.query({quote:q2,spot:spot()});
 assert.equal(x.marketId,q2.marketId);
 assert.equal(x.yes.points.some(p=>p.kind==='OBSERVED_KALSHI_QUOTE'&&p.v===.52),false);
 assert.equal(x.yes.points.at(-1).v,.77);
});
