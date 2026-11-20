'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {privateSessionGate,newToken,checkToken,loginPage}=require('../private-session-gate');
const {privateAccessGate}=require('../private-access-gate');
const secret='unit-test-safari-private-password-123456';
const host='cash-simulation-web-staging.up.railway.app';
function req(method='GET',url='/',headers={},body='',suffix='primary'){
 return {method,url,headers:{host,'user-agent':'cash-auth-test/'+suffix,...headers},
  socket:{remoteAddress:'192.0.2.'+(suffix==='primary'?'5':'6')},
  async *[Symbol.asyncIterator](){if(body)yield Buffer.from(body)}};
}
function res(){
 return {headers:{},status:null,body:'',
  setHeader(k,v){this.headers[k]=v},
  writeHead(status,headers){this.status=status;if(headers)Object.assign(this.headers,headers)},
  end(body=''){this.body+=body}
 };
}
const auth='Basic '+Buffer.from('cash:'+secret).toString('base64');
test('unsigned visitor sees branded password form, not repeating Safari Basic prompt',async()=>{
 const request=req(),reply=res();
 assert.equal(await privateSessionGate(request,reply,secret),true);
 assert.equal(reply.status,200);
 assert.match(reply.body,/Private access\./);
 assert.match(reply.body,/type="password"/);
 assert.match(reply.body,/method="post" action="\/cash-login"/);
 assert.doesNotMatch(JSON.stringify(reply.headers),/WWW-Authenticate/);
 assert.doesNotMatch(reply.body,new RegExp(secret));
 assert.match(reply.headers['Content-Security-Policy'],/form-action 'self'/);
});
test('correct form password establishes signed HttpOnly secure browser session',async()=>{
 const body='password='+encodeURIComponent(secret);
 const login=req('POST','/cash-login',{
  'content-type':'application/x-www-form-urlencoded',
  origin:'https://'+host},body);
 const reply=res();
 assert.equal(await privateSessionGate(login,reply,secret),true);
 assert.equal(reply.status,303);
 assert.equal(reply.headers.Location,'/');
 const cookie=reply.headers['Set-Cookie'];
 assert.match(cookie,/^cash_session=/);
 assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);
 assert.match(cookie,/SameSite=Lax/);
 const session=cookie.split(';')[0];
 const after=req('GET','/',{cookie:session});
 const unlock=res();
 assert.equal(await privateSessionGate(after,unlock,secret),false);
 assert.equal(after.cashPrivateSessionAuthenticated,true);
 assert.equal(privateAccessGate(after,unlock,secret),false);
});
test('previously authorized Basic access still works for startup smoke and API',async()=>{
 const request=req('GET','/api/spot',{authorization:auth});
 assert.equal(await privateSessionGate(request,res(),secret),false);
 assert.equal(privateAccessGate(request,res(),secret),false);
});
test('invalid password yields calm form error, without Basic browser prompt',async()=>{
 const login=req('POST','/cash-login',{'content-type':'application/x-www-form-urlencoded'},
   'password=incorrect');
 const response=res();
 assert.equal(await privateSessionGate(login,response,secret),true);
 assert.equal(response.status,401);
 assert.match(response.body,/Incorrect password/);
 assert.doesNotMatch(JSON.stringify(response.headers),/WWW-Authenticate/);
});
test('unauthorized API and scripts reject without Basic challenge, do not expose content',async()=>{
 for(const route of ['/api/cash-v3/market','/cash-v3.js','/cash-v3.css']){
  const response=res();
  assert.equal(await privateSessionGate(req('GET',route),response,secret),true);
  assert.equal(response.status,401);
  assert.equal(response.body,'{"error":"CASH_LOGIN_REQUIRED"}');
  assert.equal(response.headers['WWW-Authenticate'],undefined);
 }
});
test('signed session rejects expired token, tampering, changed password and junk cookies',async()=>{
 const now=Date.now();
 const token=newToken(secret,now);
 assert.equal(checkToken(token,secret,now+200),true);
 assert.equal(checkToken(token,secret,now+8*86400000),false);
 assert.equal(checkToken(token+'x',secret,now),false);
 assert.equal(checkToken(token,secret+'changed',now),false);
 for(const cookie of ['cash_session=malformed','cash_session='+token+'x']){
  const response=res();
  assert.equal(await privateSessionGate(req('GET','/api/spot',{cookie}),response,secret),true);
  assert.equal(response.status,401);
 }
});
test('cross-site form requests refuse authentication before checking password',async()=>{
 const login=req('POST','/cash-login',{
  'content-type':'application/x-www-form-urlencoded',
  'sec-fetch-site':'cross-site',
  origin:'https://different.example'},'password='+encodeURIComponent(secret));
 const response=res();
 assert.equal(await privateSessionGate(login,response,secret),true);
 assert.equal(response.status,403);
 assert.equal(response.headers['Set-Cookie'],undefined);
});
test('body type and size limits reject unsafe login requests',async()=>{
 const badType=req('POST','/cash-login',{'content-type':'application/json'},
  JSON.stringify({password:secret}));
 const r1=res();assert.equal(await privateSessionGate(badType,r1,secret),true);
 assert.equal(r1.status,415);
 const tooLong=req('POST','/cash-login',{'content-type':'application/x-www-form-urlencoded'},
  'password='+('X'.repeat(3000)));
 const r2=res();assert.equal(await privateSessionGate(tooLong,r2,secret),true);
 assert.equal(r2.status,413);
});
test('logout clears Safari cookie and does not require Basic authentication',async()=>{
 const request=req('POST','/cash-logout');
 const response=res();
 assert.equal(await privateSessionGate(request,response,secret),true);
 assert.equal(response.status,303);
 assert.match(response.headers['Set-Cookie'],/Max-Age=0/);
});
test('repeated invalid form attempts are throttled without popup',async()=>{
 for(let i=0;i<9;i++){
  const response=res();
  const request=req('POST','/cash-login',
   {'content-type':'application/x-www-form-urlencoded'},
   'password=incorrect','throttle');
  assert.equal(await privateSessionGate(request,response,secret),true);
  assert.equal(response.status,i<8?401:429);
  if(i===8){assert.equal(response.headers['Retry-After'],'60');}
 }
});
test('configuration with no private password retains original public research behavior',async()=>{
 assert.equal(await privateSessionGate(req(),res(),undefined),false);
});
