'use strict';
/*
 * Append-only, PUBLIC-ONLY late/early GitHub observer artifact archive.
 * Authoritative source-run and scheduled-parent metadata are fetched from
 * GitHub Actions REST API by a trusted default-branch workflow. Preserve the
 * exact original pre-expiry public artifacts, not reconstructed predictions.
 *
 * GitHub provenance is stronger than a short-lived artifact but IS NOT a
 * cryptographic third-party timestamp, licensed BRTI oracle, order or profit.
 */
const fs=require('node:fs'),path=require('node:path');
const crypto=require('node:crypto');
const {validObservation}=require('./observed-settlement-reconciler');
const {VERSION:ORIGIN_VERSION,REPO,SOURCE,PARENTS,ID,SHA}=
 require('./late-observer-origin');
const ROOT='late-preexpiry-run';
const VERSION='CASH_DURABLE_GITHUB_LATE_OBSERVER_ARCHIVE_V1';
const MAX_RECORD=200000,MAX_PROBES=20;
const hex=x=>crypto.createHash('sha256').update(x).digest('hex');
const parseTime=s=>Date.parse(s);
function mustPlain(x){
 if(!x||typeof x!=='object'||Array.isArray(x))
  throw Error('Unsafe source provenance object');
}
function strictKeys(x,keys){
 mustPlain(x);
 if(Object.keys(x).length!==keys.length||
    keys.some(k=>!Object.hasOwn(x,k)))
  throw Error('Unexpected sensitive or extra provenance fields');
}
function safeFile(name,max=MAX_RECORD){
 const st=fs.lstatSync(name);
 if(!st.isFile()||st.isSymbolicLink()||st.size<5||st.size>max)
  throw Error('Unsafe public witness archive source file');
 const bytes=fs.readFileSync(name);
 return {bytes,json:JSON.parse(bytes.toString('utf8'))};
}
function repoName(obj){
 return obj?.head_repository?.full_name||
  obj?.repository?.full_name||null;
}
function validateSource(origin,run,parent){
 strictKeys(origin,[
  'version','sourceWorkflow','runId','event','repository','headBranch',
  'headSha','parent','independentlyQualifiedCount','ordersEnabled','note'
 ]);
 mustPlain(run);
 if(origin.version!==ORIGIN_VERSION||origin.sourceWorkflow!==SOURCE||
    origin.repository!==REPO||origin.headBranch!=='main'||
    !ID.test(origin.runId)||!SHA.test(origin.headSha)||
    !['schedule','workflow_run'].includes(origin.event)||
    origin.independentlyQualifiedCount!==0||origin.ordersEnabled!==false||
    typeof origin.note!=='string'||origin.note.length>500||
    String(run.id)!==origin.runId||run.name!==SOURCE||
    run.event!==origin.event||run.conclusion!=='success'||
    run.status!=='completed'||run.head_branch!=='main'||
    run.head_sha!==origin.headSha||repoName(run)!==REPO)
  throw Error('Untrusted observer GitHub run identity');
 const created=parseTime(run.created_at),updated=parseTime(run.updated_at);
 if(!Number.isFinite(created)||!Number.isFinite(updated)||updated<created)
  throw Error('Invalid GitHub runner time bounds');
 if(origin.event==='schedule'){
  if(origin.parent!==null||parent!==null)
   throw Error('Direct scheduled observer cannot claim a parent run');
 }else{
  strictKeys(origin.parent,[
   'id','name','event','conclusion','headBranch','headRepository'
  ]);
  mustPlain(parent);
  const p=origin.parent;
  if(!ID.test(p.id)||!PARENTS.includes(p.name)||
     p.event!=='schedule'||p.conclusion!=='success'||
     p.headBranch!=='main'||p.headRepository!==REPO||
     String(parent.id)!==p.id||parent.name!==p.name||
     parent.event!==p.event||parent.conclusion!==p.conclusion||
     parent.status!=='completed'||
     parent.head_branch!==p.headBranch||repoName(parent)!==REPO||
     !Number.isFinite(parseTime(parent.created_at))||
     !Number.isFinite(parseTime(parent.updated_at))||
     parseTime(parent.updated_at)<parseTime(parent.created_at)||
     parseTime(parent.created_at)>created||
     parseTime(parent.updated_at)>created+60000)
    throw Error('Untrusted GitHub parent schedule completion');
 }
 return {created,updated};
}
function validateSummary(summary){
 const hasEligibility=Object.hasOwn(summary,'eligibilityPolls');
 const summaryKeys=[
  'version','attempts','stopReason','validProbes','invalidProbes',
  'emptyProbes','provisionalLateProbes','directLateProbes',
  'captureCompletenessProven','evidenceRecorded',
  'additionalImmutableProbeFiles','probeArchiveIncludesAbstentions',
  'probeArchiveSelectionBasedOnOutcome','lateDirectionalRecorded',
  'directExchangeMatches','firstObservedAtRunner',
  'independentQualifiedCount','ordersEnabled','lastError'
 ];
 // Existing original archives predate the new optional diagnostic. Do not
 // retroactively rewrite them or silently reinterpret missing data as zero.
 strictKeys(summary,hasEligibility?[...summaryKeys,'eligibilityPolls']:summaryKeys);
 if(summary.version!=='CASH_SCHEDULED_WITNESS_WATCH_V1'||
    !Number.isInteger(summary.attempts)||summary.attempts<1||
    summary.attempts>20||!Number.isInteger(summary.validProbes)||
    summary.validProbes<0||summary.validProbes>summary.attempts||
    !Number.isInteger(summary.invalidProbes)||summary.invalidProbes<0||
    summary.invalidProbes>summary.attempts||
    summary.validProbes+summary.invalidProbes!==summary.attempts||
    !Number.isInteger(summary.additionalImmutableProbeFiles)||
    summary.additionalImmutableProbeFiles<0||
    summary.additionalImmutableProbeFiles>MAX_PROBES||
    !Number.isInteger(summary.evidenceRecorded)||summary.evidenceRecorded<0||
    summary.evidenceRecorded>6||
    summary.independentQualifiedCount!==0||
    summary.ordersEnabled!==false||
    summary.captureCompletenessProven!==false||
    summary.probeArchiveIncludesAbstentions!==true||
    summary.probeArchiveSelectionBasedOnOutcome!==false||
    typeof summary.stopReason!=='string'||
    (summary.lastError!==null&&
      (typeof summary.lastError!=='string'||summary.lastError.length>200)))
  throw Error('Inconsistent late watcher summary');
 if(hasEligibility){
  strictKeys(summary.eligibilityPolls,['early','late']);
  const keys=['validSourcePolls','unavailableSourcePolls','invalidSourcePolls',
   'eligibleForecastPolls','expiredOnlyPolls','otherIneligiblePolls',
   'emptyJournalPolls'];
  for(const kind of ['early','late']){
   const x=summary.eligibilityPolls[kind];
   strictKeys(x,keys);
   if(keys.some(k=>!Number.isInteger(x[k])||x[k]<0||
      x[k]>summary.attempts)||
      x.validSourcePolls+x.unavailableSourcePolls+x.invalidSourcePolls>
        summary.attempts||
      x.eligibleForecastPolls+x.expiredOnlyPolls+
      x.otherIneligiblePolls+x.emptyJournalPolls!==x.validSourcePolls)
    throw Error('Inconsistent public eligibility poll summary');
  }
 }
}
function checkObservation(obs,origin,bounds){
 validObservation(obs);
 if(obs.githubRunId!==origin.runId||
    obs.githubCommitSha!==origin.headSha||
    obs.githubRepo!==REPO)
  throw Error('Archive observation does not match original GitHub run');
 const observed=parseTime(obs.observedAtRunner);
 if(!Number.isFinite(observed)||
    observed<bounds.created-5000||
    observed>bounds.updated+180000)
  throw Error('Pre-expiry observation outside authenticated workflow bounds');
 const match=obs.frozenEvidence.filter(e=>
  e.exchangeAtWitness?.state==='MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET');
 return {lateDirectional:obs.frozenEvidence.filter(e=>
  e.model==='KXBTC15M_LATE_CHECKPOINT_SHADOW_V1'&&
  ['YES','NO'].includes(e.frozenSide)).length,
  directMatches:match.length,
  observations:obs.frozenEvidence.length,
  timestamp:obs.observedAtRunner};
}
function collectArtifactFiles(dir,origin,bounds){
 const root=path.resolve(dir);
 const originFile=safeFile(path.join(root,'observer-origin.json'),4000);
 if(JSON.stringify(originFile.json)!==JSON.stringify(origin))
  throw Error('Origin passed to archive differs from source artifact');
 const summaryFile=safeFile(path.join(root,'observer-run-summary.json'),8000);
 validateSummary(summaryFile.json);
 const top=path.join(root,'public-preexpiry-observation.json');
 const haveTop=fs.existsSync(top),files=[];
 const probesRoot=path.join(root,'probes');
 let probes=[];
 if(fs.existsSync(probesRoot)){
  const st=fs.lstatSync(probesRoot);
  if(!st.isDirectory()||st.isSymbolicLink())
   throw Error('Unsafe probe directory');
  probes=fs.readdirSync(probesRoot).sort();
  if(probes.length>MAX_PROBES||
     probes.some(p=>!/^0(?:0[1-9]|1[0-9]|20)\.json$/.test(p)))
   throw Error('Unsafe or excessive GH probe files');
 }
 if(!haveTop&&probes.length)
  throw Error('Probe archive cannot omit primary observation');
 if(haveTop)files.push({
  rel:'public-preexpiry-observation.json',...safeFile(top)
 });
 for(const f of probes)files.push({
  rel:'probes/'+f,...safeFile(path.join(probesRoot,f))
 });
 if(summaryFile.json.additionalImmutableProbeFiles!==probes.length||
    (summaryFile.json.evidenceRecorded>0)!==haveTop)
  throw Error('Missing or inconsistent original watcher artifact files');
 const uniq=new Map(),details=[];
 // Parse all chronological raw observations, but never replace the
 // original earlier claim with a later or more favorable side.
 for(const item of files.slice().sort((a,b)=>
  parseTime(a.json.observedAtRunner)-parseTime(b.json.observedAtRunner))){
  const row=checkObservation(item.json,origin,bounds);
  details.push(row);
  for(const x of item.json.frozenEvidence){
   const key=x.model+':'+x.marketId,prior=uniq.get(key);
   if(prior&&(prior.hash!==x.frozenEventHash||
      prior.side!==x.frozenSide||
      prior.frozenAt!==x.frozenAt||
      prior.closesAt!==x.contractClosesAt))
    throw Error('Conflicting prospective claims in public GH observer files');
   if(!prior)uniq.set(key,{
    hash:x.frozenEventHash,side:x.frozenSide,
    frozenAt:x.frozenAt,closesAt:x.contractClosesAt,
    model:x.model,marketId:x.marketId
   });
  }
 }
 return {files,originFile,summaryFile,probes:probes.length,
  details,unique:[...uniq.values()]};
}
function buildEntry({artifactRoot,runMeta,parentMeta=null,asOfMs=Date.now()}){
 if(!Number.isSafeInteger(asOfMs))
  throw Error('Invalid archival runner time');
 const origin=safeFile(path.join(artifactRoot,'observer-origin.json'),4000).json;
 const bounds=validateSource(origin,runMeta,parentMeta);
 if(asOfMs<bounds.created)
  throw Error('Archive cannot predate source run');
 const x=collectArtifactFiles(artifactRoot,origin,bounds);
 const all=[{rel:'observer-origin.json',...x.originFile},
  {rel:'observer-run-summary.json',...x.summaryFile},...x.files];
 const manifest={
  version:VERSION,
  sourceRunId:origin.runId,
  sourceWorkflow:SOURCE,
  sourceRunEvent:origin.event,
  sourceRepository:REPO,
  sourceHeadSha:origin.headSha,
  sourceRunCreatedAt:runMeta.created_at,
  sourceRunFinishedAt:runMeta.updated_at,
  validatedParentRunId:origin.parent?.id||null,
  parentProvenance:origin.parent?
   'GITHUB_API_SUCCESSFUL_SCHEDULE_MAIN':'GITHUB_API_DIRECT_SCHEDULE_MAIN',
  sourceArtifactFiles:all.map(a=>({file:a.rel,sha256:hex(a.bytes),
   sizeBytes:a.bytes.length})),
  distinctCommitments:x.unique.length,
  directionalCommitments:x.unique.filter(v=>
   ['YES','NO'].includes(v.side)).length,
  lateDirectionalCommitments:x.unique.filter(v=>
   v.model==='KXBTC15M_LATE_CHECKPOINT_SHADOW_V1'&&
   ['YES','NO'].includes(v.side)).length,
  abstentionCommitments:x.unique.filter(v=>v.side==='WAIT').length,
  publicKalshiDirectComparisons:x.details.reduce((s,r)=>s+r.directMatches,0),
  archivedAtGitHubRunner:new Date(asOfMs).toISOString(),
  independentQualificationCount:0,ordersAllowed:false,
  limitation:'Commit captures past GitHub Actions public witness artifacts after direct GitHub API run and parent verification. Run creation/completion times are GitHub metadata, NOT a cryptographic third-party timestamp, a independently authenticated BRTI index, forecast accuracy, order fill or profit.'
 };
 return {origin,files:all,manifest,unique:x.unique};
}
function archiveOne({artifactRoot,archiveRoot,runMeta,parentMeta=null,
 asOfMs=Date.now()}){
 const prepared=buildEntry({artifactRoot,runMeta,parentMeta,asOfMs});
 const dir=path.join(path.resolve(archiveRoot),ROOT,
  prepared.origin.runId);
 if(fs.existsSync(dir))
  throw Error('Append-only late witness run already archived');
 const base=path.join(path.resolve(archiveRoot),ROOT);
 fs.mkdirSync(base,{recursive:true});
 fs.mkdirSync(dir,{recursive:false});
 for(const item of prepared.files){
  const dest=path.join(dir,item.rel);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,item.bytes,{flag:'wx',mode:0o600});
 }
 fs.writeFileSync(path.join(dir,'manifest.json'),
  JSON.stringify(prepared.manifest,null,2)+'\n',{
   flag:'wx',mode:0o600
  });
 console.log('CASH_LATE_DURABLE_ORIGIN='+prepared.origin.event);
 console.log('CASH_LATE_DURABLE_UNIQUE='+prepared.manifest.distinctCommitments);
 console.log('CASH_LATE_DURABLE_DIRECTIONAL='+prepared.manifest.lateDirectionalCommitments);
 console.log('CASH_LATE_DURABLE_QUALIFIED=0');
 console.log('CASH_LATE_DURABLE_ORDERS=false');
 return prepared.manifest;
}
function inspectArchive(root,{maxRuns=20000}={}){
 if(!Number.isInteger(maxRuns)||maxRuns<1||maxRuns>20000)
  throw Error('Archive inventory limit invalid');
 const dir=path.join(path.resolve(root),ROOT);
 const rows=[],unique=new Map();
 if(!fs.existsSync(dir))return {runs:0,distinctContracts:0,
  directional:0,lateDirectional:0,waits:0,originByEvent:{schedule:0,workflow_run:0},
  independentlyQualifiedCount:0,ordersEnabled:false};
 const st=fs.lstatSync(dir);
 if(!st.isDirectory()||st.isSymbolicLink())
  throw Error('Unsafe public late archive base directory');
 const ids=fs.readdirSync(dir).sort();
 if(ids.length>maxRuns)throw Error('Public late archive limit exceeded');
 for(const id of ids){
  if(!ID.test(id))throw Error('Invalid late public archive run identity');
  const folder=path.join(dir,id),stat=fs.lstatSync(folder);
  if(!stat.isDirectory()||stat.isSymbolicLink())
   throw Error('Unsafe late public archive run directory');
  const manifest=safeFile(path.join(folder,'manifest.json'),12000).json;
  if(manifest.version!==VERSION||manifest.sourceRunId!==id||
     manifest.sourceWorkflow!==SOURCE||manifest.sourceRepository!==REPO||
     !SHA.test(manifest.sourceHeadSha)||manifest.independentQualificationCount!==0||
     manifest.ordersAllowed!==false||
     !Array.isArray(manifest.sourceArtifactFiles)||
     manifest.sourceArtifactFiles.length>MAX_PROBES+3)
   throw Error('Invalid archived public run manifest');
  for(const f of manifest.sourceArtifactFiles){
   if(!f||typeof f.file!=='string'||
      !['observer-origin.json','observer-run-summary.json',
       'public-preexpiry-observation.json'].includes(f.file)&&
        !/^probes\/0(?:0[1-9]|1[0-9]|20)\.json$/.test(f.file)||
      !/^[a-f0-9]{64}$/.test(f.sha256||'')||
      !Number.isInteger(f.sizeBytes)||f.sizeBytes<5||
      f.sizeBytes>MAX_RECORD)
    throw Error('Invalid archived public artifact file declaration');
   const item=safeFile(path.join(folder,f.file));
   if(hex(item.bytes)!==f.sha256||item.bytes.length!==f.sizeBytes)
    throw Error('Archived original late evidence was modified');
  }
  const origin=safeFile(path.join(folder,'observer-origin.json'),4000).json;
  if(origin.runId!==id||origin.sourceWorkflow!==SOURCE||
     origin.independentlyQualifiedCount!==0||origin.ordersEnabled!==false||
     origin.event!==manifest.sourceRunEvent)
   throw Error('Archived run origin mismatch');
  const pseudoRun={id,name:SOURCE,event:origin.event,conclusion:'success',
   status:'completed',head_branch:'main',head_sha:origin.headSha,
   repository:{full_name:REPO},created_at:manifest.sourceRunCreatedAt,
   updated_at:manifest.sourceRunFinishedAt};
  const pseudoParent=origin.parent?{
   id:origin.parent.id,name:origin.parent.name,event:'schedule',
   conclusion:'success',status:'completed',head_branch:'main',
   repository:{full_name:REPO},
   created_at:manifest.sourceRunCreatedAt,
   updated_at:manifest.sourceRunCreatedAt
  }:null;
  const rechecked=buildEntry({
   artifactRoot:folder,runMeta:pseudoRun,parentMeta:pseudoParent,
   asOfMs:parseTime(manifest.archivedAtGitHubRunner)
  });
  // Archive recomputation remains stable even when original API
  // metadata cannot be independently re-fetched offline at this moment.
  for(const key of ['distinctCommitments','directionalCommitments',
    'lateDirectionalCommitments','abstentionCommitments',
    'publicKalshiDirectComparisons']){
   if(manifest[key]!==rechecked.manifest[key])
    throw Error('Archived public research counts were altered');
  }
  for(const x of rechecked.unique){
   const key=x.model+':'+x.marketId,prior=unique.get(key);
   if(prior&&(prior.hash!==x.hash||prior.side!==x.side||
      prior.frozenAt!==x.frozenAt||prior.closesAt!==x.closesAt))
    throw Error('Contradictory historical frozen public witness across runs');
   unique.set(key,x);
  }
  rows.push(manifest);
 }
 const counts={schedule:rows.filter(x=>x.sourceRunEvent==='schedule').length,
  workflow_run:rows.filter(x=>x.sourceRunEvent==='workflow_run').length};
 const vals=[...unique.values()];
 return {runs:rows.length,distinctContracts:unique.size,
  directional:vals.filter(x=>x.side!=='WAIT').length,
  lateDirectional:vals.filter(x=>
   x.model==='KXBTC15M_LATE_CHECKPOINT_SHADOW_V1'&&
   x.side!=='WAIT').length,
  waits:vals.filter(x=>x.side==='WAIT').length,
  originByEvent:counts,
  independentlyQualifiedCount:0,ordersEnabled:false};
}
function main(argv=process.argv.slice(2)){
 const [artifactRoot,runFile,parentFile,archiveRoot]=argv;
 if(!artifactRoot||!runFile||!parentFile||!archiveRoot)
  throw Error('Usage: node late-observer-archive.js SOURCE RUN.json PARENT.json ARCHIVE');
 const runMeta=safeFile(runFile,50000).json;
 const parentMeta=parentFile==='NONE'?null:safeFile(parentFile,50000).json;
 const before=inspectArchive(archiveRoot);
 console.log('CASH_LATE_DURABLE_RUNS_BEFORE='+before.runs);
 const record=archiveOne({artifactRoot,archiveRoot,runMeta,parentMeta});
 const after=inspectArchive(archiveRoot);
 console.log('CASH_LATE_DURABLE_RUNS_AFTER='+after.runs);
 if(after.runs!==before.runs+1)
  throw Error('Append-only public archive run count mismatch');
 return record;
}
if(require.main===module){
 try{main()}
 catch(e){console.error('CASH late witness archive refused: '+
  String(e?.message||'Unknown').replace(/[^a-zA-Z0-9_ :.-]/g,'').slice(0,220));
  process.exitCode=1}
}
module.exports={ROOT,VERSION,buildEntry,archiveOne,inspectArchive,validateSource,
 validateSummary,main};
