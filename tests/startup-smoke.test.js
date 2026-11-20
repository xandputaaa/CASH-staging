'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {runStartupSmoke}=require('../startup-smoke');
const good=()=>({version:'CASH_LIVE_OPERATION_CHECK_V1',
 site:{online:true},state:'ONLINE_PARTIAL_DATA',
 market:{kalshiQuotesFresh:false},
 model:{independentValidatedForecasts:0,canExecuteRealTrade:false}});
async function fake(port,path){
 if(path==='/')return {status:200,type:'text/html',body:'id="cashSimple" id="modeAdvanced" id="livePaperLab"'};
 if(path==='/api/manual-calls')return {status:200,type:'application/json',body:JSON.stringify({version:'CASH_MANUAL_CALLS_V1',mode:'EXPERIMENTAL_MANUAL_RESEARCH_ONLY',call:'WAIT',automaticTradingEnabled:false,ordersPlaced:0,tradingAuthorization:false,calibratedWinProbability:null,expectedValue:null})};
 if(path==='/health')return {status:200,type:'application/json',body:JSON.stringify({ok:true,mode:'paper-only',qualifyingForecasts:0})};
 if(path==='/api/live-check')return {status:200,type:'application/json',body:JSON.stringify(good())};
 return {status:200,type:'application/javascript',body:'/* valid script */'.repeat(20)};
}
test('startup route smoke checks homepage, JS, health and live readout without requiring winning predictions',async()=>{
 const r=await runStartupSmoke({port:3000,read:fake});
 assert.equal(r.passed,true);
 assert.equal(r.httpRoutesChecked,8);
 assert.equal(r.routeChecksPassed,8);
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

test('private startup smoke forwards credentials to all eight loopback checks',async()=>{
 const authorization='Basic '+Buffer.from('cash:valid-test-only').toString('base64');
 let calls=0;
 const r=await runStartupSmoke({authorization,read:async(port,path,timeoutMs,passed)=>{
  assert.equal(passed,authorization);
  assert.equal(timeoutMs,12000);
  calls++;
  return fake(port,path);
 }});
 assert.equal(r.passed,true);
 assert.equal(calls,8);
});
test('readLocal transmits optional authorization over loopback only',async()=>{
 const http=require('node:http');
 const {readLocal}=require('../startup-smoke');
 const auth='Basic '+Buffer.from('cash:loopback-only').toString('base64');
 const server=http.createServer((req,res)=>{
  res.writeHead(req.headers.authorization===auth?200:401,
   {'Content-Type':'text/plain'});
  res.end('status');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const port=server.address().port;
  assert.equal((await readLocal(port,'/smoke',3000,auth)).status,200);
  assert.equal((await readLocal(port,'/smoke',3000)).status,401);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
