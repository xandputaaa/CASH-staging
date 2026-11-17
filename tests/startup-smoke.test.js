'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {runStartupSmoke}=require('../startup-smoke');
const good=()=>({version:'CASH_LIVE_OPERATION_CHECK_V1',
 site:{online:true},state:'ONLINE_PARTIAL_DATA',
 market:{kalshiQuotesFresh:false},
 model:{independentValidatedForecasts:0,canExecuteRealTrade:false}});
async function fake(port,path){
 if(path==='/')return {status:200,type:'text/html',body:'id="cashSimple" id="modeAdvanced" id="livePaperLab"'};
 if(path==='/health')return {status:200,type:'application/json',body:JSON.stringify({ok:true,mode:'paper-only',qualifyingForecasts:0})};
 if(path==='/api/live-check')return {status:200,type:'application/json',body:JSON.stringify(good())};
 return {status:200,type:'application/javascript',body:'/* valid script */'.repeat(20)};
}
test('startup route smoke checks homepage, JS, health and live readout without requiring winning predictions',async()=>{
 const r=await runStartupSmoke({port:3000,read:fake});
 assert.equal(r.passed,true);
 assert.equal(r.httpRoutesChecked,7);
 assert.equal(r.routeChecksPassed,7);
 assert.equal(r.observedDataState,'ONLINE_PARTIAL_DATA');
 assert.equal(r.noRealTrading,true);
 assert.equal(r.qualificationCount,0);
});
test('missing script and forged trading gate fail startup smoke independently of upstream feed',async()=>{
 const r=await runStartupSmoke({read:async(port,path)=>{
  if(path==='/live-paper.js')return {status:404,type:'text/plain',body:'Not found'};
  if(path==='/api/live-check')return {status:200,type:'application/json',
   body:JSON.stringify({...good(),model:{independentValidatedForecasts:4,canExecuteRealTrade:true}})};
  return fake(port,path);
 }});
 assert.equal(r.passed,false);
 assert.ok(r.failedPaths.some(x=>x.includes('/live-paper.js')));
 assert.ok(r.failedPaths.some(x=>x.includes('/api/live-check')));
});
