'use strict';
// iOS/Safari-friendly password form with stateless, HttpOnly signed sessions.
// Existing HTTP Basic clients remain compatible, but no forced browser popup.
const {createHmac,randomBytes,timingSafeEqual}=require('node:crypto');
const {authorized}=require('./private-access-gate');
const COOKIE='cash_session',DURATION=7*24*60*60*1000;
const failures=new Map();

const CSRF_COOKIE='cash_login_csrf',CSRF_TTL=20*60*1000;
function csrfMac(payload,secret){
 return createHmac('sha256',secret).update('CASH_LOGIN_CSRF_V1\0'+payload).digest();
}
function newCsrfToken(secret,now=Date.now()){
 const payload=Buffer.from(JSON.stringify({
  version:1,issued:now,nonce:randomBytes(20).toString('hex')
 })).toString('base64url');
 return payload+'.'+csrfMac(payload,secret).toString('base64url');
}
function verifyCsrfToken(token,secret,now=Date.now()){
 if(typeof token!=='string'||token.length>512||
  !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))return false;
 const [payload,rawMac]=token.split('.');
 let mac,data;
 try{
  mac=Buffer.from(rawMac,'base64url');
  data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
 }catch{return false}
 const expected=csrfMac(payload,secret);
 return mac.length===expected.length&&timingSafeEqual(mac,expected)&&
  data?.version===1&&Number.isSafeInteger(data.issued)&&
  now-data.issued>=-60000&&now-data.issued<=CSRF_TTL&&
  typeof data.nonce==='string'&&/^[0-9a-f]{40}$/.test(data.nonce);
}
function checkLoginCsrf(req,formToken,secret,now=Date.now()){
 const cookieHeader=req.headers.cookie;
 if(typeof cookieHeader!=='string'||cookieHeader.length>8192)return false;
 const cookies=cookieHeader.split(';').map(x=>x.trim()).filter(x=>x.startsWith(CSRF_COOKIE+'='));
 if(cookies.length!==1)return false;
 const cookieToken=cookies[0].slice(CSRF_COOKIE.length+1);
 if(!verifyCsrfToken(formToken,secret,now)||!verifyCsrfToken(cookieToken,secret,now))return false;
 const a=Buffer.from(formToken),b=Buffer.from(cookieToken);
 return a.length===b.length&&timingSafeEqual(a,b);
}

function makeMAC(body,secret){
 return createHmac('sha256',secret).update('CASH_PRIVATE_SESSION_V1\0'+body).digest();
}
function newToken(secret,now=Date.now()){
 const payload=Buffer.from(JSON.stringify({
  version:1,issued:now,expires:now+DURATION,
  nonce:randomBytes(16).toString('hex')
 })).toString('base64url');
 return payload+'.'+makeMAC(payload,secret).toString('base64url');
}
function checkToken(token,secret,now=Date.now()){
 if(typeof token!=='string'||token.length>1200||!/^[-A-Za-z0-9_.]+$/.test(token))return false;
 const parts=token.split('.');
 if(parts.length!==2)return false;
 let signature;
 try{signature=Buffer.from(parts[1],'base64url')}catch{return false}
 const expected=makeMAC(parts[0],secret);
 if(signature.length!==expected.length||!timingSafeEqual(signature,expected))return false;
 let payload;
 try{payload=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'))}
 catch{return false}
 return payload?.version===1&&Number.isSafeInteger(payload.issued)&&
  Number.isSafeInteger(payload.expires)&&payload.issued<=now+60000&&
  payload.expires>now&&payload.expires-payload.issued===DURATION&&
  typeof payload.nonce==='string'&&/^[0-9a-f]{32}$/.test(payload.nonce);
}
function sessionCookie(req,secret){
 const cookies=req.headers.cookie;
 if(typeof cookies!=='string'||cookies.length>8192)return false;
 const match=cookies.match(/(?:^|;\s*)cash_session=([^;]+)/);
 return !!(match&&checkToken(match[1],secret));
}
function securityHeaders(res){
 res.setHeader('Cache-Control','no-store, private');
 res.setHeader('Content-Type','text/html; charset=utf-8');
 res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Security-Policy',
  "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
}
function loginPage({error=false,throttled=false,csrfExpired=false,csrfToken=''}={}){
 const notice=throttled?'Too many attempts. Please try again in a minute.':
  csrfExpired?'This sign-in page expired. Reload it and enter your password again.':
  error?'Incorrect password. Check your saved CASH passphrase and try again.':'';
 return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
 '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+
 '<meta name="theme-color" content="#08090c"><title>CASH · Sign in</title>'+
 '<style>*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#08090c;color:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}'+
 'body{min-height:100dvh;display:flex;justify-content:center;align-items:center;padding:22px;background:radial-gradient(ellipse at 50% 8%,#5d687026,transparent 53%),#08090c}'+
 'main{width:100%;max-width:440px;padding:32px 25px 28px;border:1px solid #ffffff26;border-radius:28px;background:linear-gradient(145deg,#ffffff15,#ffffff06);box-shadow:0 25px 100px #0008,inset 0 1px #ffffff19;backdrop-filter:blur(25px)}'+
 '.brand{display:flex;align-items:center;gap:13px}.orb{display:grid;place-items:center;width:45px;height:45px;border:1px solid #ffffff42;border-radius:15px;background:linear-gradient(140deg,#959da6,#353943 39%,#07090d 79%);font-weight:800;font-size:23px;letter-spacing:-2px}'+
 '.name{font-size:20px;font-weight:750;letter-spacing:2px}.sub{font-size:9px;letter-spacing:1.7px;color:#9299a6;margin-top:4px}h1{font-size:35px;letter-spacing:-1.6px;line-height:1.12;margin:37px 0 10px}p{font-size:13px;line-height:1.6;color:#a4acb9;margin:0 0 28px}'+
 'label{display:block;font-size:11px;font-weight:700;letter-spacing:1px;color:#b4bac4;margin-bottom:10px}'+
 'input{display:block;width:100%;min-height:54px;border-radius:14px;background:#090b0f;border:1px solid #ffffff35;color:white;font-size:17px;padding:0 15px;outline:0}input:focus{border-color:#e2e6eb;box-shadow:0 0 0 2px #e2e6eb22}'+
 'button{display:block;width:100%;min-height:54px;border:0;border-radius:14px;background:#ebedf0;color:#17191e;font-size:14px;font-weight:750;margin-top:15px;cursor:pointer}'+
 '.msg{background:#59303333;border:1px solid #d8808f5a;padding:13px;border-radius:12px;color:#ffbec5;margin:0 0 16px;font-size:12px;line-height:1.5}'+
 '.foot{font-size:11px;color:#838995;margin-top:23px;text-align:center;line-height:1.6}</style></head><body><main>'+
 '<div class="brand"><div class="orb">C·</div><div><div class="name">CASH</div><div class="sub">PRIVATE MARKET INTELLIGENCE</div></div></div>'+
 '<h1>Private access.</h1><p>Enter the CASH family-and-friends research passphrase to open your dashboard.</p>'+
 (notice?'<div role="alert" class="msg">'+notice+'</div>':'')+
 '<form method="post" action="/cash-login">'+
 '<input type="hidden" name="csrf" value="'+csrfToken+'">'+
 '<label for="password">CASH PASSWORD</label>'+
 '<input id="password" type="password" name="password" autocomplete="current-password" required maxlength="512" placeholder="Enter your passphrase">'+
 '<button type="submit">Unlock CASH</button></form>'+
 '<div class="foot">Private research only · No automatic trading<br>Secure session · Your password is never displayed</div>'+
 '</main></body></html>';
}
function loginResponse(res,status,options={}){
 securityHeaders(res);
 if(options.throttled)res.setHeader('Retry-After','60');
 const csrfToken=newCsrfToken(options.secret,options.now??Date.now());
 res.setHeader('Set-Cookie',CSRF_COOKIE+'='+csrfToken+
  '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1200');
 res.writeHead(status);res.end(loginPage({...options,csrfToken}));
}
function redirect(res,{setCookie=null}={}){
 res.setHeader('Cache-Control','no-store, private');
 res.setHeader('Location','/');
 if(setCookie!==null)res.setHeader('Set-Cookie',setCookie);
 res.writeHead(303);res.end();
}
function sameOrigin(req){
 if(req.headers['sec-fetch-site']==='cross-site')return false;
 const origin=req.headers.origin;
 if(!origin)return true; // Native Safari form submissions may omit Origin.
 try{
  const url=new URL(origin);
  return url.protocol==='https:'&&url.host===req.headers.host;
 }catch{return false}
}
function failureKey(req){
 const origin=String(req.socket?.remoteAddress||'unknown');
 const agent=String(req.headers['user-agent']||'unknown').slice(0,200);
 return createHmac('sha256','cash-login-throttle').update(origin+'\0'+agent).digest('hex');
}
function tooManyAttempts(req,now){
 const key=failureKey(req),current=failures.get(key);
 return current&&now-current.since<=60000&&current.count>=8;
}
function failedAttempt(req,now){
 for(const [key,state] of failures){
  if(now-state.since>60000)failures.delete(key);
 }
 if(failures.size>1000)failures.clear();
 const key=failureKey(req),current=failures.get(key);
 if(!current||now-current.since>60000)failures.set(key,{since:now,count:1});
 else current.count++;
}
async function privateSessionGate(req,res,secret){
 if(secret===undefined)return false;
 const path=new URL(req.url||'/','http://localhost').pathname;
 const basic=authorized(req.headers.authorization,secret);
 const valid=sessionCookie(req,secret);
 if(path==='/cash-login'&&req.method==='POST'){
  // Safari and embedded browser origin headers vary. Require a browser-bound
  // signed form token instead of rejecting legitimate same-site submissions.
  const now=Date.now();
  if(tooManyAttempts(req,now)){
   loginResponse(res,429,{throttled:true,secret,now});return true;
  }
  if(!/^application\/x-www-form-urlencoded(?:;|$)/i.test(req.headers['content-type']||'')){
   loginResponse(res,415,{error:true,secret,now});return true;
  }
  let text='',overflow=false;
  try{
   for await(const chunk of req){
    text+=chunk.toString('utf8');
    if(text.length>2048){overflow=true;break}
   }
  }catch{overflow=true}
  if(overflow){
   res.setHeader('Cache-Control','no-store');res.writeHead(413);res.end('Request too large');return true;
  }
  const form=new URLSearchParams(text);
  if(!checkLoginCsrf(req,form.get('csrf'),secret,now)){
   loginResponse(res,403,{csrfExpired:true,secret,now});return true;
  }
  const attempted=form.get('password');
  if(typeof attempted==='string'&&attempted.length<=512&&
   authorized('Basic '+Buffer.from('cash:'+attempted).toString('base64'),secret)){
   failures.delete(failureKey(req));
   redirect(res,{setCookie:COOKIE+'='+newToken(secret,now)+
    '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800'});
  }else{
   failedAttempt(req,now);
   loginResponse(res,401,{error:true,secret,now});
  }
  return true;
 }
 if(path==='/cash-logout'&&req.method==='POST'){
  if(!sameOrigin(req)){
   res.writeHead(403);res.end('Forbidden');return true;
  }
  redirect(res,{setCookie:COOKIE+'=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'});
  return true;
 }
 if(basic||valid){
  if(valid)req.cashPrivateSessionAuthenticated=true;
  if(path==='/cash-login'&&req.method==='GET'){
   redirect(res);return true;
  }
  return false;
 }
 if((path==='/'||path==='/cash-login')&&req.method==='GET'){
  loginResponse(res,200,{secret});return true;
 }
 // Do not send WWW-Authenticate: Safari must not reopen a Basic dialog.
 res.setHeader('Cache-Control','no-store, private');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.writeHead(401);res.end('{"error":"CASH_LOGIN_REQUIRED"}');
 return true;
}
module.exports={newToken,checkToken,newCsrfToken,verifyCsrfToken,checkLoginCsrf,loginPage,privateSessionGate};
