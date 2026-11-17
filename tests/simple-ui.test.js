'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../simple-ui.js'),'utf8');
function boot(payload,mode='simple'){
 const els={},handlers={},events={};
 const names=['cashSimple','simpleMarketStatus','simpleCall','simpleWhy','simpleTimer',
  'simpleTarget','simpleYes','simpleNo','simpleContext','simpleExplainToggle','simpleExplainer'];
 for(const id of names)els[id]={textContent:'',attrs:{},hidden:id==='simpleExplainer',
  setAttribute(k,v){this.attrs[k]=v},
  addEventListener(k,fn){handlers[id+':'+k]=fn}};
 const body={mode,getAttribute(){return this.mode}};
 const document={body,getElementById:id=>els[id]||null,
  addEventListener(k,fn){events[k]=fn}};
 const polls=[],fetches=[];
 const ctx={document,Date,Number,String,AbortController,fetch:async url=>{
  fetches.push(url);return {ok:true,json:async()=>payload}},
  setTimeout:()=>1,clearTimeout:()=>{},setInterval:fn=>polls.push(fn)};
 vm.runInNewContext(script,ctx);
 return {els,handlers,events,body,polls,fetches,
  tick:()=>new Promise(resolve=>setImmediate(resolve))};
}
function report(overrides={}){
 const now=Date.now();
 return {version:'CASH_KALSHI15_TERMINAL_V1',displayState:'PAPER_MONITOR_READY',
  liveDecision:'NO_CALL_MODEL_NOT_VALIDATED',realTradingAuthorized:false,automaticOrdersEnabled:false,
  independentForecastValidation:0,finalization:{realTradingGatePassed:false,officialBrtiFeedAvailable:false},
  clock:{endTime:new Date(now+240000).toISOString(),remainingMs:240000,quoteAgeMs:2000},
  target:{source:'KALSHI_FLOOR_STRIKE',value:85001.5},
  market:{status:'live',refreshFailed:false,yesAsk:0.62,noAsk:0.41},
  ...overrides};
}
test('Simple Mode shows understandable market facts but always declines a verified pick',async()=>{
 const h=boot(report());await h.tick();
 assert.equal(h.els.simpleCall.textContent,'NO VERIFIED PICK');
 assert.equal(h.els.simpleTarget.textContent,'$85,001.50');
 assert.equal(h.els.simpleYes.textContent,'62.0¢');
 assert.equal(h.els.simpleNo.textContent,'41.0¢');
 assert.match(h.els.simpleWhy.textContent,/not proven/i);
 assert.match(h.els.simpleMarketStatus.textContent,/PAPER ONLY/);
 assert.equal(h.fetches[0],'/api/kalshi15');
 h.handlers['simpleExplainToggle:click']();
 assert.equal(h.els.simpleExplainer.hidden,false);
 assert.equal(h.els.simpleExplainToggle.attrs['aria-expanded'],'true');
});
test('no current quotes clears displayed prices instead of showing a false live price',async()=>{
 const h=boot(report({displayState:'NO_CALL',market:{status:'stale',yesAsk:0.8,noAsk:0.2},
  clock:{remainingMs:120000,endTime:new Date(Date.now()+120000).toISOString(),quoteAgeMs:45000}}));
 await h.tick();
 assert.equal(h.els.simpleYes.textContent,'—');
 assert.equal(h.els.simpleNo.textContent,'—');
 assert.equal(h.els.simpleTarget.textContent,'—');
 assert.equal(h.els.simpleCall.textContent,'NO VERIFIED PICK');
});
test('Advanced Mode does not separately poll the hidden beginner UI',async()=>{
 const h=boot(report(),'advanced');await h.tick();
 assert.equal(h.fetches.length,0);
 h.body.mode='simple';
 h.events['cash-mode-change']();
 await h.tick();
 assert.equal(h.fetches.length,1);
});
test('invalid trading authorization payload fails closed rather than showing prices',async()=>{
 const h=boot(report({realTradingAuthorized:true}));await h.tick();
 assert.equal(h.els.simpleYes.textContent,'—');
 assert.equal(h.els.simpleCall.textContent,'NO VERIFIED PICK');
 assert.match(h.els.simpleMarketStatus.textContent,/UNAVAILABLE/);
});
