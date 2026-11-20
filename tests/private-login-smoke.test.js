'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {privateSessionGate}=require('../private-session-gate');
const {privateAccessGate}=require('../private-access-gate');
const {runPrivateLoginSmoke}=require('../private-login-smoke');
const PASSWORD='cash-login-startup-smoke-password-1234';
async function withServer(fn){
 const server=http.createServer(async(req,res)=>{
  if(await privateSessionGate(req,res,PASSWORD))return;
  if(privateAccessGate(req,res,PASSWORD))return;
  res.setHeader('Cache-Control','private, no-store');
  if(req.url==='/'){
   res.setHeader('Content-Type','text/html; charset=utf-8');
   res.setHeader('Content-Security-Policy',
    "default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self'");
   res.writeHead(200);res.end('<div id="cashV3">CASH</div>');return;
  }
  if(req.url==='/cash-v3.css'){
   res.writeHead(200,{'Content-Type':'text/css'});
   res.end('#cashV3{display:block}');return;
  }
  if(req.url==='/cash-v3.js'){
   res.writeHead(200,{'Content-Type':'application/javascript'});
   res.end('function renderChart(){}');return;
  }
  if(req.url==='/api/cash-v3/market'){
   res.writeHead(200,{'Content-Type':'application/json'});
   res.end(JSON.stringify({version:'CASH_MOBILE_V3_MARKET_V1',
    ordersEnabled:false,executionAuthorized:false,
    chart:{syntheticForecastPath:false}}));return;
  }
  if(req.url==='/api/manual-calls'){
   res.writeHead(200,{'Content-Type':'application/json'});
   res.end(JSON.stringify({version:'CASH_MANUAL_CALLS_V1',
    ordersPlaced:0,automaticTradingEnabled:false}));return;
  }
  res.writeHead(404);res.end();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{return await fn(server.address().port)}
 finally{await new Promise(resolve=>server.close(resolve))}
}
test('iPhone-style signed form and cookie unlock all CASH OS assets and API routes',async()=>{
 await withServer(async port=>{
  const r=await runPrivateLoginSmoke({port,password:PASSWORD});
  assert.equal(r.passed,true,JSON.stringify(r));
  assert.equal(r.checks,7);
  assert.equal(r.steps,7);
  assert.equal(r.state,'AUTHENTICATED_BROWSER_FLOW_OK');
  assert.deepEqual(r.failedSteps,[]);
 });
});
test('a wrong deployment password is detected as login failure without exposing secret',async()=>{
 await withServer(async port=>{
  const r=await runPrivateLoginSmoke({port,password:'different-deployed-password'});
  assert.equal(r.passed,false);
  assert.match(r.state,/UNVERIFIED/);
  assert.ok(r.failedSteps.includes('FORM_AUTH_REDIRECT'));
  assert.doesNotMatch(JSON.stringify(r),/different-deployed-password/);
 });
});
