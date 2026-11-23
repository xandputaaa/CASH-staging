'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
class FakeNode{
 constructor(doc,tag='div'){this.doc=doc;this.tag=tag;this.id='';this.attrs={};this.dataset={};this.children=[];this.listeners={};this.textContent='';this.innerHTML='';}
 setAttribute(name,value){this.attrs[name]=String(value);if(name==='id')this.id=String(value)}
 appendChild(node){this.children.push(node);return node}
 replaceChildren(...nodes){this.children=[...nodes]}
 addEventListener(name,fn){this.listeners[name]=fn}
 after(node){
  this.doc._nodes[node.id]=node;
  for(const [,name] of node.innerHTML.matchAll(/id="([^"]+)"/g)){
   this.doc._nodes[name]=new FakeNode(this.doc);
   this.doc._nodes[name].id=name;
  }
 }
 click(){this.listeners.click?.()}
}
function boot(){
 const doc={_nodes:{},getElementById(id){return this._nodes[id]||null},
  createElement(tag){return new FakeNode(this,tag)},
  createElementNS(ns,tag){return new FakeNode(this,tag)}};
 doc._nodes.v3MarketChart=new FakeNode(doc,'article');
 const listeners={};
 const window={addEventListener(name,fn){listeners[name]=fn}};
 const file=fs.readFileSync(path.join(__dirname,'..','cash-signal-lab-ui.js'),'utf8');
 vm.runInNewContext(file,{document:doc,window,Date,Number,Array,Object,Math,Map,String});
 return {doc,emit:data=>listeners['cash:v3:market']({detail:data})};
}
function sample(){
 const now=Math.floor(Date.now()/60000)*60000;
 const candles=Array.from({length:45},(_,i)=>{
  const close=90100+i*2;
  return {t:now-(44-i)*60000,open:close-1,high:close+4,low:close-3,close,kind:'CLOSED_1M'};
 });
 const lab={version:'CASH_SIGNAL_LAB_V1',status:'HISTORICAL_STUDY',
  executionAuthorized:false,independentlyValidated:false,bias:'BULLISH BIAS',
  lastClosedAt:new Date(now).toISOString(),
  latest:{emaFast:90180,emaSlow:90160,rsi14:64.2},sampleCount:45,
  reason:'Historical technical study, not a forecast.',
  markers:[{t:candles[36].t,v:candles[36].close,side:'BUY',kind:'HISTORICAL_CLOSED_CANDLE_CROSSOVER'}]};
 return {version:'CASH_MOBILE_V3_MARKET_V1',ordersEnabled:false,
  executionAuthorized:false,chart:{version:'CASH_V3_CHART_V1',
   btc:{source:'Kraken BTC/USD',status:'LIVE',candles,signalLab:lab}}};
}
test('Signal Lab initializes safely with no market data and creates one original panel',()=>{
 const {doc}=boot();
 assert.equal(doc.getElementById('v3SignalLab').tag,'article');
 assert.equal(doc.getElementById('slBias').textContent,'NO CONFIRMATION');
 assert.equal(doc.getElementById('slCandles').children.length,0);
});
test('historical verified candles render correctly; toggle removes only visual markers',()=>{
 const {doc,emit}=boot(),x=sample();emit(x);
 assert.equal(doc.getElementById('slBias').textContent,'BULLISH BIAS');
 assert.equal(doc.getElementById('slRsi').textContent,'64.2');
 assert.equal(doc.getElementById('slCount').textContent,'45');
 assert.equal(doc.getElementById('slFast').textContent,'$90,180.00');
 const svg=doc.getElementById('slCandles');
 assert.ok(svg.children.some(n=>n.tag==='rect'),'actual candles rendered');
 assert.ok(svg.children.some(n=>n.textContent==='BUY'),'historic marker rendered');
 doc.getElementById('slToggle').click();
 assert.equal(doc.getElementById('slToggle').attrs['aria-pressed'],'false');
 assert.ok(!svg.children.some(n=>n.textContent==='BUY'),'markers hidden');
 assert.ok(svg.children.some(n=>n.tag==='rect'),'candles remain');
});
test('missing, stale or reauthorized data fail closed and clear prior drawing',()=>{
 const {doc,emit}=boot();emit(sample());
 const svg=doc.getElementById('slCandles');assert.ok(svg.children.length>10);
 emit(null);
 assert.equal(doc.getElementById('slBias').textContent,'NO CONFIRMATION');
 assert.equal(svg.children.length,0);
 const x=sample();x.executionAuthorized=true;emit(x);
 assert.equal(svg.children.length,0,'unexpected authorization never renders');
 const old=sample();old.chart.btc.signalLab.lastClosedAt=new Date(Date.now()-600000).toISOString();
 emit(old);
 assert.equal(svg.children.length,0,'stale study never renders');
});
