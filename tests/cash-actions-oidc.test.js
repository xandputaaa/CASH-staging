'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {AUD,verifiedGithubIdentity,githubReadOnlyAccess}=require('../cash-actions-oidc');
const {githubRunnerReadHeaders}=require('../cash-runner-read-auth');
const NOW=Date.parse('2026-11-20T11:40:00Z');
const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const key={...publicKey.export({format:'jwk'}),kid:'test-kid-001',alg:'RS256',use:'sig'};
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function signed(overrides={}){
 const claims={iss:'https://token.actions.githubusercontent.com',aud:AUD,
  repository:'xandputaaa/CASH-staging',repository_id:'1460135200',
  repository_owner_id:'353902871',ref:'refs/heads/main',
  event_name:'schedule',workflow_ref:
   'xandputaaa/CASH-staging/.github/workflows/preexpiry-observer.yml@refs/heads/main',
  iat:Math.floor(NOW/1000)-20,exp:Math.floor(NOW/1000)+250,...overrides};
 const unsigned=enc({typ:'JWT',alg:'RS256',kid:key.kid})+'.'+enc(claims);
 return unsigned+'.'+crypto.sign('RSA-SHA256',Buffer.from(unsigned),privateKey).toString('base64url');
}
const jwks=async (_url,options)=>{
 assert.equal(options.redirect,'error');
 return {ok:true,text:async()=>JSON.stringify({keys:[key]})};
};
test('valid short-lived scheduled repo identity gets exactly three private export routes',async()=>{
 const token=signed();
 const identity=await verifiedGithubIdentity(token,{fetchImpl:jwks,now:NOW});
 assert.equal(identity.repository,'xandputaaa/CASH-staging');
 for(const url of ['/api/prospective/export','/api/late-checkpoint/export',
  '/api/model-lab/shadow/export']){
  assert.equal(await githubReadOnlyAccess({method:'GET',url,
    headers:{authorization:'Bearer '+token}},{fetchImpl:jwks,now:NOW}),true);
 }
 for(const [method,url] of [['GET','/'],['GET','/cash-v3.css'],
  ['GET','/api/cash-v3/market'],['POST','/api/prospective/export'],
  ['GET','/api/order'],['GET','/api/shadow/export']]){
  assert.equal(await githubReadOnlyAccess({method,url,
   headers:{authorization:'Bearer '+token}},{fetchImpl:jwks,now:NOW}),false,
   method+' '+url);
 }
});
test('untrusted events, branches, repos, workflow paths and expired tokens all fail closed',async()=>{
 const overrides=[
  {aud:'other'},{iss:'https://attacker.example'},
  {repository:'attacker/repo'},{repository_id:'999'},
  {repository_owner_id:'0'},{event_name:'pull_request'},
  {event_name:'workflow_run'},{ref:'refs/heads/feature'},
  {workflow_ref:'xandputaaa/CASH-staging/.github/workflows/evil.yml@refs/heads/main'},
  {iat:Math.floor(NOW/1000)-1300,exp:Math.floor(NOW/1000)+20},
  {exp:Math.floor(NOW/1000)-1},
  {exp:Math.floor(NOW/1000)-20}, // exp equals iat: no positive lifetime
  {exp:Math.floor(NOW/1000)-21}, // exp precedes iat
  {nbf:Math.floor(NOW/1000)+1}, // not yet valid, even within clock tolerance
  {nbf:Math.floor(NOW/1000)+300}
 ];
 for(const o of overrides)assert.equal(await verifiedGithubIdentity(signed(o),{
  fetchImpl:jwks,now:NOW}),null,JSON.stringify(o));
});
test('unsigned forged JWT, unrelated JWKS, redirect and oversized token are rejected',async()=>{
 const token=signed(),bits=token.split('.');
 assert.equal(await verifiedGithubIdentity(bits[0]+'.'+bits[1]+'.'+bits[2].slice(1),{
  fetchImpl:jwks,now:NOW}),null);
 assert.equal(await verifiedGithubIdentity(token,{fetchImpl:async()=>({
  ok:true,text:async()=>JSON.stringify({keys:[{...key,kid:'wrong'}]})}),now:NOW}),null);
 assert.equal(await verifiedGithubIdentity(token,{fetchImpl:async()=>({
  ok:false,status:302,text:async()=>{throw Error('untrusted redirect body')}}),now:NOW}),null);
 assert.equal(await verifiedGithubIdentity('x'.repeat(14000),{fetchImpl:jwks,now:NOW}),null);
});
test('GitHub runner mints only scheduled main-branch identity, never PR identity',async()=>{
 const env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'schedule',
  GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:'xandputaaa/CASH-staging',
  ACTIONS_ID_TOKEN_REQUEST_URL:'https://pipelines.actions.githubusercontent.com/token?id=1',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN:'ephemeral-github-request-token'};
 const fetchImpl=async(url,options)=>{
  const u=new URL(url);
  assert.equal(u.searchParams.get('audience'),AUD);
  assert.equal(u.hostname,'pipelines.actions.githubusercontent.com');
  assert.equal(options.headers.Authorization,'Bearer '+env.ACTIONS_ID_TOKEN_REQUEST_TOKEN);
  assert.equal(options.redirect,'error');
  return {ok:true,text:async()=>JSON.stringify({value:'aa.bb.cc'})};
 };
 assert.deepEqual(await githubRunnerReadHeaders({env,fetchImpl,now:NOW}),{
  Authorization:'Bearer aa.bb.cc'});
 for(const o of [{GITHUB_EVENT_NAME:'pull_request'},{
  GITHUB_REF:'refs/heads/feature'},{GITHUB_REPOSITORY:'other/repo'},{
  ACTIONS_ID_TOKEN_REQUEST_URL:'https://attacker.example/token'}]){
  const result=await githubRunnerReadHeaders({env:{...env,...o},
   fetchImpl:async()=>{throw Error('should not mint')}});
  assert.deepEqual(result,{});
 }
});
