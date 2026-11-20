'use strict';
// Narrow identity gate: only scheduled, main-branch workflows in THIS repo
// can read three research exports. No password, long-lived GitHub secret,
// dashboard access, order access or general API authorization is granted.
const crypto=require('node:crypto');
const AUD='cash-private-research-witness-v1';
const ISS='https://token.actions.githubusercontent.com';
const JWKS=ISS+'/.well-known/jwks';
const ALLOWED_EXPORTS=new Set([
 '/api/prospective/export','/api/late-checkpoint/export',
 '/api/model-lab/shadow/export'
]);
const ALLOWED_WORKFLOWS=new Set([
 'xandputaaa/CASH-staging/.github/workflows/preexpiry-observer.yml@refs/heads/main',
 'xandputaaa/CASH-staging/.github/workflows/shadow-public-observer.yml@refs/heads/main',
 'xandputaaa/CASH-staging/.github/workflows/research-snapshot.yml@refs/heads/main'
]);
let keyCache={expires:0,keys:null,inflight:null};
function partJSON(part){
 if(typeof part!=='string'||part.length>8000||!/^[A-Za-z0-9_-]+$/.test(part))
  throw Error('Unsafe OIDC token part');
 const raw=Buffer.from(part,'base64url');
 if(raw.length>4096)throw Error('Oversized OIDC claim');
 return JSON.parse(raw.toString('utf8'));
}
async function signingKeys(fetchImpl,now){
 const fromCache=fetchImpl===fetch;
 if(fromCache&&keyCache.keys&&now<keyCache.expires)return keyCache.keys;
 if(fromCache&&keyCache.inflight)return keyCache.inflight;
 const fetchKeys=async()=>{
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),4500);
  try{
   const res=await fetchImpl(JWKS,{signal:ctrl.signal,redirect:'error',
    headers:{Accept:'application/json','User-Agent':'CASH-OIDC-Read-Only/1.0'}});
   if(!res.ok)throw Error('GitHub OIDC key fetch failed');
   const text=await res.text();
   if(Buffer.byteLength(text)>60000)throw Error('GitHub OIDC keyset oversized');
   const body=JSON.parse(text);
   if(!body||!Array.isArray(body.keys)||body.keys.length>25)
    throw Error('GitHub OIDC keyset invalid');
   const keys=body.keys.filter(k=>k?.kty==='RSA'&&typeof k.kid==='string'&&
    /^[A-Za-z0-9_-]{1,160}$/.test(k.kid)&&
    (k.alg===undefined||k.alg==='RS256')&&(k.use===undefined||k.use==='sig')&&
    typeof k.n==='string'&&typeof k.e==='string');
   if(!keys.length)throw Error('No verified GitHub OIDC signing keys');
   if(fromCache)keyCache={keys,expires:Date.now()+300000,inflight:null};
   return keys;
  }finally{clearTimeout(timer)}
 };
 const pending=fetchKeys();
 if(fromCache)keyCache.inflight=pending;
 try{return await pending}
 finally{if(fromCache)keyCache.inflight=null}
}
async function verifiedGithubIdentity(token,{fetchImpl=fetch,now=Date.now()}={}){
 if(typeof token!=='string'||token.length>12000||token.length<120)return null;
 const parts=token.split('.');
 if(parts.length!==3)return null;
 try{
  const header=partJSON(parts[0]),claims=partJSON(parts[1]);
  if(header.alg!=='RS256'||!/^[A-Za-z0-9_-]{1,160}$/.test(header.kid||'')||
   typeof parts[2]!=='string'||parts[2].length>1500)return null;
  const keys=await signingKeys(fetchImpl,now);
  const matching=keys.filter(k=>k.kid===header.kid);
  if(matching.length!==1)return null;
  const pub=crypto.createPublicKey({key:matching[0],format:'jwk'});
  const signature=Buffer.from(parts[2],'base64url');
  if(signature.length<128||signature.length>1024||
   !crypto.verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),pub,signature))
   return null;
  const t=Math.floor(now/1000);
  if(claims.iss!==ISS||claims.aud!==AUD||
   claims.repository!=='xandputaaa/CASH-staging'||
   String(claims.repository_id)!=='1460135200'||
   String(claims.repository_owner_id)!=='353902871'||
   claims.ref!=='refs/heads/main'||claims.event_name!=='schedule'||
   !ALLOWED_WORKFLOWS.has(claims.workflow_ref)||
   !Number.isInteger(claims.iat)||!Number.isInteger(claims.exp)||
   claims.iat>t+60||claims.iat<t-900||claims.exp<=t||
   claims.exp<=claims.iat||claims.exp>claims.iat+900||
   (claims.nbf!==undefined&&(!Number.isInteger(claims.nbf)||claims.nbf>t)))
   return null;
  return {repository:claims.repository,workflow:claims.workflow_ref,
   event:claims.event_name};
 }catch{return null}
}
async function githubReadOnlyAccess(req,{fetchImpl=fetch,now=Date.now()}={}){
 if(req.method!=='GET')return false;
 let route;
 try{route=new URL(req.url,'http://localhost').pathname}catch{return false}
 if(!ALLOWED_EXPORTS.has(route))return false;
 const auth=req.headers.authorization;
 if(typeof auth!=='string'||!auth.startsWith('Bearer ')||
   auth.length>13000)return false;
 return !!await verifiedGithubIdentity(auth.slice(7),{fetchImpl,now});
}
module.exports={AUD,JWKS,ALLOWED_EXPORTS,ALLOWED_WORKFLOWS,
 verifiedGithubIdentity,githubReadOnlyAccess};
