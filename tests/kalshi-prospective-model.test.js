'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {evaluateProspective,NAME}=require('../kalshi-prospective-model');
const now=Date.parse('2026-11-16T23:20:00Z'),iso=x=>new Date(x).toISOString();
function fixture({delta=500,nowMs=now,lead=180000}={}){
 const history=Array.from({length:25},(_,i)=>({
  time:iso(nowMs-(24-i)*15000),
  price:85000+(i*1.1)+delta-26.4,
  source:'Kraken BTC/USD'
 }));
 return {now:nowMs,
  quote:{venue:'Kalshi',marketId:'KXBTC15M-26NOV161630-30',
   status:'live',refreshFailed:false,openTime:iso(nowMs-700000),
   fetchedAt:iso(nowMs-2000),endTime:iso(nowMs+lead),
   targetPrice:85000,targetSource:'KALSHI_FLOOR_STRIKE',
   strikeType:'greater_or_equal',tieGoesToYes:true,
   contractRuleStatus:'BRTI_60S_RULE_TEXT_PRESENT',
   yesAsk:.51,noAsk:.5},
  spot:{status:'live',source:'Kraken BTC/USD',
   price:history.at(-1).price,fetchedAt:history.at(-1).time,history}
 };
}
test('prospective YES and NO forecasts use only pre-expiry independent spot and official strike',()=>{
 for(const [delta,expected] of [[500,'YES'],[-500,'NO']]){
  const args=fixture({delta}),result=evaluateProspective(args);
  assert.equal(result.model,NAME);assert.equal(result.state,'PROVISIONAL_DIRECTION');
  assert.equal(result.side,expected);
  assert.equal(result.calibratedProbability,null);
  assert.equal(result.expectedValue,null);
  assert.equal(result.realMoneyAuthorized,false);
  assert.equal(result.validation,'UNVALIDATED_PROXY_MODEL');
  assert.equal(result.sampleWindow.length,24);
  assert.match(result.sampleWindowSha256,/^[0-9a-f]{64}$/);
 }
});
test('a high ASK or low ASK never flips the independent directional side',()=>{
 const a=fixture();
 const yes=evaluateProspective(a);
 a.quote.yesAsk=.9;a.quote.noAsk=.11;
 const b=evaluateProspective(a);
 assert.equal(yes.side,b.side);
 assert.equal(yes.signalZ,b.signalZ);
 assert.notEqual(yes.inputSha256,'');
});
test('near strike produces a frozen WAIT instead of a forced bet',()=>{
 const a=fixture({delta:2});
 const result=evaluateProspective(a);
 assert.equal(result.state,'WAIT');
 assert.equal(result.reason,'EDGE_UNCLEAR_VS_VOLATILITY');
 assert.equal(result.side,null);
 assert.equal(result.expectedValue,null);
});
test('missing official target, wrong series, stale quotes, mixed source or insufficient history abstains',()=>{
 for(const patch of [
  a=>a.quote.marketId='KXETH15M-FAKE',
  a=>a.quote.targetPrice=null,
  a=>a.quote.strikeType='greater',
  a=>a.quote.contractRuleStatus='RULE_TEXT_NOT_CONFIRMED',
  a=>a.quote.fetchedAt=iso(now-30000),
  a=>a.spot.history=a.spot.history.slice(-4),
  a=>a.spot.history[5].time=a.spot.history[4].time,
  a=>a.spot.history[12].source='Coinbase Exchange BTC-USD'
 ]){
  const a=fixture();patch(a);
  const b=evaluateProspective(a);
  assert.equal(b.side,null);
  assert.equal(b.realMoneyAuthorized,false);
 }
});
test('prediction window blocks early hindsight and last-second speculative calls',()=>{
 for(const lead of [60000,300000,-1000]){
  const r=evaluateProspective(fixture({lead}));
  assert.equal(r.side,null);assert.equal(r.reason,'OUTSIDE_FROZEN_PREDICTION_WINDOW');
 }
});

test('explicit official BRTI history has a separate unvalidated provenance from proxy forecasts',()=>{
 const f=fixture();
 f.spot.source='CF Benchmarks BRTI via Kalshi read-only';
 f.spot.history=f.spot.history.map(x=>({...x,source:f.spot.source}));
 const r=evaluateProspective(f);
 assert.equal(r.side,'YES');
 assert.equal(r.validation,'UNVALIDATED_BRTI_MODEL');
 assert.equal(r.indexSourceType,'OFFICIAL_BRTI_LIVE');
 assert.equal(r.calibratedProbability,null);
 assert.equal(r.realMoneyAuthorized,false);
});

test('high-frequency 5-second Kraken polling retains 3+ minutes of history after bucket normalization',()=>{
 const n=now,a=fixture({delta:500});
 a.spot.history=Array.from({length:72},(_,i)=>({
  time:iso(n-(71-i)*5000),price:85000+500+i*0.05,source:'Kraken BTC/USD'
 }));
 a.spot.price=a.spot.history.at(-1).price;
 a.spot.fetchedAt=a.spot.history.at(-1).time;
 const result=evaluateProspective(a);
 assert.equal(result.state,'PROVISIONAL_DIRECTION');
 assert.equal(result.side,'YES');
 assert.ok(result.sampleWindow.length>=14&&result.sampleWindow.length<=24);
 assert.ok(Date.parse(result.sampleWindow.at(-1).time)-
  Date.parse(result.sampleWindow[0].time)>=180000);
 assert.equal(result.calibratedProbability,null);
});
test('chronological holes and source splices do not become fabricated signals during downsampling',()=>{
 const a=fixture({delta:500});
 a.spot.history[8].time=a.spot.history[7].time;
 assert.equal(evaluateProspective(a).reason,'NON_CHRONOLOGICAL_SPOT_HISTORY');
 const b=fixture({delta:500});
 b.spot.history[9].price=NaN;
 assert.equal(evaluateProspective(b).reason,'INVALID_SPOT_SAMPLE');
});
