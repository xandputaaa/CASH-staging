'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {evaluateSignalLab}=require('../cash-signal-lab');
const END=Date.parse('2026-11-23T10:00:00.000Z');
function bars(closes){
 return closes.map((close,i)=>({
  t:END-(closes.length-i-1)*60000,kind:'CLOSED_1M',
  open:close,high:close+2,low:close-2,close
 }));
}
test('insufficient source history cannot create actionable marker',()=>{
 const x=evaluateSignalLab(bars(Array.from({length:18},(_,i)=>90000+i)),{now:END+1000});
 assert.equal(x.status,'INSUFFICIENT_DATA');
 assert.deepEqual(x.markers,[]);
 assert.equal(x.executionAuthorized,false);
});
test('unavailable and stale OHLC never present a current bias',()=>{
 const data=bars(Array.from({length:50},(_,i)=>90000+i));
 assert.equal(evaluateSignalLab(data,{now:END+1000,sourceAvailable:false}).status,'UNAVAILABLE');
 const old=data.map(b=>({...b,t:b.t-20*60000}));
 const x=evaluateSignalLab(old,{now:END+1000});
 assert.equal(x.status,'STALE');assert.equal(x.bias,'NO CONFIRMATION');
});
test('rejects synthetic, unfinished and discontinuous candles rather than filling gaps',()=>{
 const data=bars(Array.from({length:35},(_,i)=>90000+i));
 data[5].kind='SYNTHETIC';
 assert.equal(evaluateSignalLab(data,{now:END+1000}).sampleCount,29);
 assert.equal(evaluateSignalLab(data,{now:END+1000}).status,'INSUFFICIENT_DATA');
 data[5].kind='CLOSED_1M'; data[18].t-=1;
 assert.equal(evaluateSignalLab(data,{now:END+1000}).status,'INSUFFICIENT_DATA');
});
test('pure trend returns study bias, never a live BUY instruction',()=>{
 const data=bars(Array.from({length:55},(_,i)=>90000+i*4));
 const x=evaluateSignalLab(data,{now:END+1000});
 assert.equal(x.status,'HISTORICAL_STUDY');
 assert.equal(x.bias,'BULLISH BIAS');
 assert.equal(x.independentlyValidated,false);
 assert.deepEqual(x.markers,[]);
 assert.equal(x.latest.rsi14,100);
});
test('historical crossover markers use only already-closed candles',()=>{
 const data=bars(Array.from({length:70},(_,i)=>
  i<35?90000-(i*8):90000-35*8+(i-35)*22));
 const x=evaluateSignalLab(data,{now:END+1000});
 assert.equal(x.status,'HISTORICAL_STUDY');
 assert.ok(x.markers.every(m=>m.t<=END));
 assert.ok(x.markers.every(m=>m.kind==='HISTORICAL_CLOSED_CANDLE_CROSSOVER'));
 assert.ok(x.markers.some(m=>m.side==='BUY'));
});
