'use strict';
// GitHub Actions mints short-lived OIDC tokens directly. Keep only in process;
// never log, archive, publish or share tokens. PRs and non-main jobs stay unauthenticated.
const {AUD}=require('./cash-actions-oidc');
let cached={until:0,token:null,inflight:null};
async function githubRunnerReadHeaders({
 env=process.env,fetchImpl=fetch,now=Date.now()
}={}){
 const approvedFollowup=env.GITHUB_EVENT_NAME==='workflow_run'&&
  (env.GITHUB_WORKFLOW==='CASH pre-expiry public research observer'||
   env.GITHUB_WORKFLOW==='CASH Model Lab public shadow pre-expiry witness');
 if(env.GITHUB_ACTIONS!=='true'||
  (env.GITHUB_EVENT_NAME!=='schedule'&&!approvedFollowup)||
  env.GITHUB_REF!=='refs/heads/main'||
  env.GITHUB_REPOSITORY!=='xandputaaa/CASH-staging'||
  !env.ACTIONS_ID_TOKEN_REQUEST_URL||
  !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)return {};
 if(env===process.env&&cached.token&&now<cached.until)
  return {Authorization:'Bearer '+cached.token};
 if(env===process.env&&cached.inflight)return cached.inflight;
 const mint=async()=>{
  let u;
  try{u=new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL)}catch{return {}}
  if(u.protocol!=='https:'||!(
   u.hostname==='actions.githubusercontent.com'||
   u.hostname.endsWith('.actions.githubusercontent.com')))return {};
  u.searchParams.set('audience',AUD);
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),4500);
  try{
   const response=await fetchImpl(u.toString(),{signal:ctrl.signal,
    redirect:'error',headers:{Authorization:'Bearer '+env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
      Accept:'application/json'}});
   if(!response.ok)return {};
   const raw=await response.text();
   if(Buffer.byteLength(raw)>16000)return {};
   const body=JSON.parse(raw);
   const jwt=body?.value;
   if(typeof jwt!=='string'||jwt.length>12000||
    jwt.split('.').length!==3)return {};
   if(env===process.env)cached={until:Date.now()+45000,token:jwt,inflight:null};
   return {Authorization:'Bearer '+jwt};
  }catch{return {}}
  finally{clearTimeout(timer)}
 };
 const pending=mint();
 if(env===process.env)cached.inflight=pending;
 try{return await pending}
 finally{if(env===process.env)cached.inflight=null}
}
module.exports={githubRunnerReadHeaders};
