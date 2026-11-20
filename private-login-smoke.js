'use strict';
const http=require('node:http');
const ROUTES=['/','/cash-v3.css','/cash-v3.js',
 '/api/cash-v3/market','/api/manual-calls'];
function request(port,route,{method='GET',headers={},body='',timeout=10000}={}){
 return new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port,path:route,method,
   headers:{'User-Agent':'CASH-private-browser-loopback-smoke/1.0',...headers}},
   res=>{
    const chunks=[];let size=0;
    res.on('data',chunk=>{size+=chunk.length;
     if(size>1000000)req.destroy(Error('Auth smoke oversized')) ;
     else chunks.push(chunk)});
    res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,
     body:Buffer.concat(chunks).toString('utf8')}));
   });
  req.setTimeout(timeout,()=>req.destroy(Error('Auth smoke timeout')));
  req.on('error',reject);
  req.end(body);
 });
}
async function runPrivateLoginSmoke({port=3000,password,requestImpl=request}={}){
 if(password===undefined)return {passed:true,steps:0,checks:0,
  state:'NO_PASSWORD_CONFIGURED',failedSteps:[]};
 const failed=[];let steps=0;
 function check(label,ok){steps++;if(!ok)failed.push(label)}
 try{
  const login=await requestImpl(port,'/');
  const csrf=login.body.match(/name="csrf" value="([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)"/)?.[1];
  const csrfCookie=(login.headers['set-cookie']||[]).find(x=>x.startsWith('cash_login_csrf='));
  check('UNSIGNED_LOGIN_FORM',login.status===200&&!!csrf&&
   !!csrfCookie&&/Private access/.test(login.body)&&
   !Object.hasOwn(login.headers,'www-authenticate'));
  if(!csrf||!csrfCookie)throw Error('Missing browser form token');
  const submit='csrf='+encodeURIComponent(csrf)+
   '&password='+encodeURIComponent(password);
  const response=await requestImpl(port,'/cash-login',{method:'POST',
   headers:{'content-type':'application/x-www-form-urlencoded',
    cookie:csrfCookie.split(';')[0],
    // Intentionally mismatched forwarded Origin to replicate the previous
    // iPhone/Railway rejection. Signed same-site cookie remains required.
    origin:'https://cash-simulation-web-staging.up.railway.app:443',
    'sec-fetch-site':'cross-site'},
   body:submit});
  const sessionCookie=(response.headers['set-cookie']||[])
   .find(x=>x.startsWith('cash_session='));
  check('FORM_AUTH_REDIRECT',response.status===303&&
   response.headers.location==='/'&&!!sessionCookie&&
   !Object.hasOwn(response.headers,'www-authenticate'));
  if(!sessionCookie)throw Error('No session cookie returned');
  const cookie={cookie:sessionCookie.split(';')[0]};
  const page=await requestImpl(port,'/',{headers:cookie});
  check('SIGNED_SESSION_DASHBOARD',page.status===200&&
   page.body.includes('id="cashV3"')&&
   /style-src 'self' 'unsafe-inline'/.test(page.headers['content-security-policy']||''));
  const css=await requestImpl(port,'/cash-v3.css',{headers:cookie});
  check('AUTH_STYLESHEET',css.status===200&&
   /text\/css/.test(css.headers['content-type']||'')&&css.body.includes('#cashV3'));
  const js=await requestImpl(port,'/cash-v3.js',{headers:cookie});
  check('AUTH_MOBILE_CLIENT',js.status===200&&
   /javascript/.test(js.headers['content-type']||'')&&js.body.includes('renderChart'));
  const chart=await requestImpl(port,'/api/cash-v3/market',{headers:cookie});
  let market=null;
  try{market=JSON.parse(chart.body)}catch{}
  check('AUTH_CHART_API',chart.status===200&&
   market?.version==='CASH_MOBILE_V3_MARKET_V1'&&
   market?.ordersEnabled===false&&market?.executionAuthorized===false&&
   market?.chart?.syntheticForecastPath===false);
  const calls=await requestImpl(port,'/api/manual-calls',{headers:cookie});
  let report=null;
  try{report=JSON.parse(calls.body)}catch{}
  check('AUTH_MANUAL_CALLS',calls.status===200&&
   report?.version==='CASH_MANUAL_CALLS_V1'&&
   report?.ordersPlaced===0&&report?.automaticTradingEnabled===false);
 }catch{if(!failed.length)failed.push('AUTH_FLOW_TRANSPORT_UNAVAILABLE')}
 return {passed:failed.length===0&&steps===7,steps,checks:7,
  state:failed.length===0&&steps===7?'AUTHENTICATED_BROWSER_FLOW_OK':'LOGIN_FLOW_UNVERIFIED',
  failedSteps:failed};
}
module.exports={runPrivateLoginSmoke,request};
