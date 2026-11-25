'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {privateSessionGate,newToken,checkToken,newCsrfToken,verifyCsrfToken}=require('../private-session-gate');
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
async function browserForm(suffix='primary'){
 const response=res();
 assert.equal(await privateSessionGate(req('GET','/',{},'',suffix),response,secret),true);
 assert.equal(response.status,200);
 const token=response.body.match(/name="csrf" value="([^"]+)"/)?.[1];
 assert.ok(token,'GET / must include login form token');
 const cookie=response.headers['Set-Cookie'].split(';')[0];
 assert.equal(cookie,'cash_login_csrf='+token);
 return {token,cookie,response};
}
function postForm({token,cookie},password,headers={},suffix='primary'){
 return req('POST','/cash-login',{
  'content-type':'application/x-www-form-urlencoded',cookie,
  ...headers
 },'csrf='+encodeURIComponent(token)+'&password='+encodeURIComponent(password),suffix);
}
test('unsigned Safari visitor gets branded form with signed, browser-bound CSRF token',async()=>{
 const {token,response}=await browserForm();
 assert.match(response.body,/Private access\./);
 assert.match(response.body,/type="password"/);
 assert.match(response.body,/method="post" action="\/cash-login"/);
 assert.doesNotMatch(JSON.stringify(response.headers),/WWW-Authenticate/);
 assert.doesNotMatch(response.body,new RegExp(secret));
 assert.match(response.headers['Content-Security-Policy'],/form-action 'self'/);
 assert.match(response.headers['Set-Cookie'],/HttpOnly/);
 assert.match(response.headers['Set-Cookie'],/Secure/);
 assert.match(response.headers['Set-Cookie'],/SameSite=Lax/);
 assert.equal(verifyCsrfToken(token,secret),true);
});
test('valid cookie-bound form succeeds despite forwarded Safari origin and fetch metadata mismatches',async()=>{
 const form=await browserForm();
 const login=postForm(form,secret,{
  origin:'https://cash-simulation-web-staging.up.railway.app:443',
  'sec-fetch-site':'cross-site',host:'railway-internal-host:3000'
 });
 const response=res();
 assert.equal(await privateSessionGate(login,response,secret),true);
 assert.equal(response.status,303,'a legitimate form must not be rejected on Origin/Host');
 assert.equal(response.headers.Location,'/');
 const cookie=response.headers['Set-Cookie'];
 assert.match(cookie,/^cash_session=/);
 assert.match(cookie,/HttpOnly/);
 assert.match(cookie,/Secure/);
 assert.match(cookie,/SameSite=Lax/);
 const after=req('GET','/',{cookie:cookie.split(';')[0]});
 const unlock=res();
 assert.equal(await privateSessionGate(after,unlock,secret),false);
 assert.equal(after.cashPrivateSessionAuthenticated,true);
 assert.equal(privateAccessGate(after,unlock,secret),false);
});
test('Basic authentication remains available for private smoke probes',async()=>{
 const request=req('GET','/api/spot',{authorization:auth});
 assert.equal(await privateSessionGate(request,res(),secret),false);
 assert.equal(privateAccessGate(request,res(),secret),false);
});
test('incorrect password returns a calm form error and fresh CSRF, not a browser challenge',async()=>{
 const form=await browserForm();
 const response=res();
 assert.equal(await privateSessionGate(postForm(form,'incorrect'),response,secret),true);
 assert.equal(response.status,401);
 assert.match(response.body,/Incorrect password/);
 assert.match(response.body,/name="csrf" value="/);
 assert.match(response.headers['Set-Cookie'],/^cash_login_csrf=/);
 assert.equal(response.headers['WWW-Authenticate'],undefined);
});
test('unauthed assets and API routes stay private without Basic challenge',async()=>{
 for(const route of ['/api/cash-v3/market','/cash-v3.js','/cash-v3.css',
  '/cash-signal-lab.css','/cash-signal-lab-ui.js']){
  const response=res();
  assert.equal(await privateSessionGate(req('GET',route),response,secret),true);
  assert.equal(response.status,401);
  assert.equal(response.body,'{"error":"CASH_LOGIN_REQUIRED"}');
  assert.equal(response.headers['WWW-Authenticate'],undefined);
 }
});
test('session rejects expired, tampered or wrong-secret signed cookies',async()=>{
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
test('a forged cross-site request without a matching CSRF cookie or form token fails closed',async()=>{
 const form=await browserForm();
 for(const variation of [
  postForm({...form,cookie:''},secret,{
   origin:'https://evil.example','sec-fetch-site':'cross-site'}),
  postForm({...form,token:newCsrfToken(secret)},secret,{
   origin:'https://evil.example','sec-fetch-site':'cross-site'}),
  postForm({...form,cookie:'cash_login_csrf=forged'},secret),
  postForm({...form,cookie:form.cookie+'; cash_login_csrf=duplicate'},secret)
 ]){
  const response=res();
  assert.equal(await privateSessionGate(variation,response,secret),true);
  assert.equal(response.status,403);
  assert.match(response.body,/This sign-in page expired/);
  assert.equal(response.headers['cash_session'],undefined);
  assert.equal(response.headers['WWW-Authenticate'],undefined);
 }
});
test('CSRF signing enforces expiry, bounded token length and secret rotation',()=>{
 const now=Date.now(),token=newCsrfToken(secret,now);
 assert.equal(verifyCsrfToken(token,secret,now),true);
 assert.equal(verifyCsrfToken(token,secret,now+20*60*1000+1),false);
 assert.equal(verifyCsrfToken(token,secret+'changed',now),false);
 assert.equal(verifyCsrfToken(token+'x',secret,now),false);
 assert.equal(verifyCsrfToken('broken',secret,now),false);
 assert.equal(verifyCsrfToken('x'.repeat(1000),secret,now),false);
});
test('invalid content types and oversized bodies reject before checking credentials',async()=>{
 const badType=req('POST','/cash-login',{'content-type':'application/json'},
  JSON.stringify({password:secret}));
 const r1=res();assert.equal(await privateSessionGate(badType,r1,secret),true);
 assert.equal(r1.status,415);
 const form=await browserForm();
 const tooLong=postForm(form,'X'.repeat(3000));
 const r2=res();assert.equal(await privateSessionGate(tooLong,r2,secret),true);
 assert.equal(r2.status,413);
});
test('logout clears valid session cookie',async()=>{
 const request=req('POST','/cash-logout');
 const response=res();
 assert.equal(await privateSessionGate(request,response,secret),true);
 assert.equal(response.status,303);
 assert.match(response.headers['Set-Cookie'],/Max-Age=0/);
});
test('repeated invalid form password attempts are throttled',async()=>{
 const form=await browserForm('throttle');
 for(let i=0;i<9;i++){
  const response=res();
  const request=postForm(form,'incorrect',{},'throttle');
  assert.equal(await privateSessionGate(request,response,secret),true);
  assert.equal(response.status,i<8?401:429);
  if(i===8)assert.equal(response.headers['Retry-After'],'60');
 }
});
test('unset private password leaves original research behavior',async()=>{
 assert.equal(await privateSessionGate(req(),res(),undefined),false);
});
