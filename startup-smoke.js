'use strict';
/**
 * Route-level startup smoke check using 127.0.0.1 only.
 * Network feed availability is observed, never invented or made a
 * requirement for the service to start. No public exchange orders or keys.
 */
const http=require('node:http');
function readLocal(port,path,timeoutMs=12000,authorization){
 return new Promise((resolve,reject)=>{
  const req=http.get({hostname:'127.0.0.1',port,path,
   headers:{'User-Agent':'CASH-local-startup-smoke/1.0',
    ...(authorization?{Authorization:authorization}:{})}},res=>{
   let buf='';res.setEncoding('utf8');
   res.on('data',chunk=>{buf+=chunk;if(buf.length>450000)req.destroy(new Error('Oversized response'))});
   res.on('end',()=>resolve({status:res.statusCode,
    type:res.headers['content-type']||'',body:buf}));
  });
  req.setTimeout(timeoutMs,()=>req.destroy(new Error('Local smoke request timeout')));
  req.on('error',reject);
 });
}
async function runStartupSmoke({port=3000,read=readLocal,authorization}={}){
 const routes=[
  {path:'/',accept:x=>x.status===200&&x.body.includes('id="cashSimple"')&&
   x.body.includes('id="modeAdvanced"')&&x.body.includes('id="livePaperLab"')},
  ...['/simple-ui.js','/view-mode.js','/live-paper.js','/kalshi15-ui.js']
   .map(path=>({path,accept:x=>x.status===200&&/javascript/.test(x.type)&&x.body.length>200})),
  {path:'/api/manual-calls',accept:x=>{
   if(x.status!==200)return false;
   const obj=JSON.parse(x.body);
   return obj.version==='CASH_MANUAL_CALLS_V1'&&
    obj.mode==='EXPERIMENTAL_MANUAL_RESEARCH_ONLY'&&
    ['WAIT','ENTER_YES','ENTER_NO'].includes(obj.call)&&
    obj.automaticTradingEnabled===false&&obj.ordersPlaced===0&&
    obj.tradingAuthorization===false&&obj.calibratedWinProbability===null&&
    obj.expectedValue===null;
  }},
  {path:'/health',accept:x=>{
   if(x.status!==200)return false;
   const obj=JSON.parse(x.body);
   return obj.ok===true&&obj.mode==='paper-only'&&obj.qualifyingForecasts===0;
  }},
  {path:'/api/live-check',accept:x=>{
   if(x.status!==200)return false;
   const obj=JSON.parse(x.body);
   return obj.version==='CASH_LIVE_OPERATION_CHECK_V1'&&
    obj.site.online===true&&obj.model.independentValidatedForecasts===0&&
    obj.model.canExecuteRealTrade===false;
  }}
 ];
 const failures=[];let live=null;
 for(const route of routes){
  try{
   const response=await read(port,route.path,12000,authorization);
   if(!route.accept(response))failures.push(route.path+' rejected');
   if(route.path==='/api/live-check'&&response.status===200)
    live=JSON.parse(response.body);
  }catch(e){failures.push(route.path+' unavailable')}
 }
 return {version:'CASH_STARTUP_SMOKE_V1',
  httpRoutesChecked:routes.length,routeChecksPassed:routes.length-failures.length,
  passed:failures.length===0,failedPaths:failures,
  observedDataState:live?.state||'UNKNOWN',
  kalshiQuoteFresh:live?.market?.kalshiQuotesFresh===true,
  noRealTrading:live?.model?.canExecuteRealTrade===false,
  qualificationCount:0,
  note:'Route and source-readiness checks, not proof of 24/7 access or a profitable model.'};
}
module.exports={readLocal,runStartupSmoke};
