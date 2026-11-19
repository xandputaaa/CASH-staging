'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {sourceOrigin}=require('../late-observer-origin');
const {buildEntry,archiveOne,inspectArchive,validateSource}=require('../late-observer-archive');
const REPO='xandputaaa/CASH-staging',RUN='44453487857',PARENT='44453463087';
const SHA='f54605cf27e4c86aca2af96521da5803cd484149';
const MODEL='KXBTC15M_LATE_CHECKPOINT_SHADOW_V1';
const EARLY='KXBTC15M_SETTLEMENT_EARLY_V3';
const MID='KXBTC15M-26NOV182045-45';
const CREATED='2026-11-19T03:44:07Z',UPDATED='2026-11-19T03:44:17Z';
const OBS='2026-11-19T03:44:13.408Z',CLOSE='2026-11-19T03:45:00Z';
const FROZEN='2026-11-19T03:41:45Z';
const ENV={
 GITHUB_EVENT_NAME:'workflow_run',GITHUB_REPOSITORY:REPO,
 GITHUB_REF:'refs/heads/main',GITHUB_RUN_ID:RUN,GITHUB_SHA:SHA,
 CASH_PARENT_RUN_ID:PARENT,CASH_PARENT_NAME:'CASH Model Lab shadow public settlement recheck',
 CASH_PARENT_EVENT:'schedule',CASH_PARENT_CONCLUSION:'success',
 CASH_PARENT_HEAD_BRANCH:'main',CASH_PARENT_HEAD_REPOSITORY:REPO
};
function run(event='workflow_run'){
 return {id:Number(RUN),name:'CASH pre-expiry public research observer',
  event,status:'completed',conclusion:'success',head_branch:'main',head_sha:SHA,
  repository:{full_name:REPO},
  created_at:CREATED,updated_at:UPDATED};
}
function parent(){
 return {id:Number(PARENT),name:'CASH Model Lab shadow public settlement recheck',
  event:'schedule',status:'completed',conclusion:'success',head_branch:'main',
  repository:{full_name:REPO},
  created_at:'2026-11-19T03:43:54Z',updated_at:'2026-11-19T03:44:04Z'};
}
const match=(ts='2026-11-19T03:44:13.800Z')=>({
 state:'MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET',source:'KALSHI_DIRECT_PUBLIC_GET_MARKET',
 observedAtRunner:ts,independentValidation:false,isFill:false,
 quoteWasNotFrozenAtPrediction:true,publishedCloseTime:CLOSE,
 publicStrikeAtObserver:63000.25,publicStrikeType:'greater_or_equal',
 publicMarketStatusAtObserver:'active',exchangePublicFieldsSha256:'b'.repeat(64)
});
function item(model,side,at=OBS){
 return {
  model,marketId:MID,frozenSide:side,frozenAt:FROZEN,
  contractClosesAt:CLOSE,journalSequence:model===EARLY?1:2,
  frozenEventHash:model===EARLY?'a'.repeat(64):'c'.repeat(64),
  headHashSeen:'d'.repeat(64),publicProxyOnly:true,
  exchangeAtWitness:match()
 };
}
function observation(origin,items=[item(MODEL,'YES')],observedAt=OBS){
 return {
  version:'CASH_OFFSERVER_OBSERVATION_V1',
  observationClass:'GITHUB_RUNNER_UTC_CLOCK_PROVISIONAL',
  observedAtRunner:observedAt,githubRunId:origin.runId,
  githubRepo:REPO,githubCommitSha:SHA,
  frozenEvidence:items,
  sourcesUnavailableOrInvalid:[],
  claimedIndependentlyQualifiedCount:0,realOrdersEnabled:false,
  calibrated:false,evidenceWitnessedBeforeExpiry:items.length,
  directExchangeComparisons:items.length,
  directExchangeMatches:items.length,
  directExchangeMismatchesOrUnavailable:0,
  independentQualifiedCount:0
 };
}
function summary({n=1,files=1,evidence=1}={}){
 return {
  version:'CASH_SCHEDULED_WITNESS_WATCH_V1',
  attempts:2,stopReason:'LATE_CHECKPOINT_EXTERNALLY_OBSERVED_AND_DIRECTLY_MATCHED',
  validProbes:2,invalidProbes:0,emptyProbes:0,provisionalLateProbes:0,
  directLateProbes:1,captureCompletenessProven:false,
  evidenceRecorded:evidence,additionalImmutableProbeFiles:files,
  probeArchiveIncludesAbstentions:true,
  probeArchiveSelectionBasedOnOutcome:false,
  lateDirectionalRecorded:1,directExchangeMatches:1,
  firstObservedAtRunner:OBS,independentQualifiedCount:0,
  ordersEnabled:false,lastError:null
 };
}
function temp(t){
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'cash-durable-late-test-'));
 t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const artifact=fs.mkdtempSync(path.join(os.tmpdir(),'cash-durable-input-'));
 t.after(()=>fs.rmSync(artifact,{recursive:true,force:true}));
 return {root:d,artifact};
}
function put(p,v){
 fs.mkdirSync(path.dirname(p),{recursive:true});
 fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
}
function fixture(t,{event='workflow_run',probes=true,side='YES'}={}){
 const {root,artifact}=temp(t);
 const origin=sourceOrigin({...ENV,GITHUB_EVENT_NAME:event});
 put(path.join(artifact,'observer-origin.json'),origin);
 put(path.join(artifact,'observer-run-summary.json'),
  summary({files:probes?1:0}));
 const obs=observation(origin,[item(MODEL,side)]);
 put(path.join(artifact,'public-preexpiry-observation.json'),obs);
 if(probes)put(path.join(artifact,'probes','001.json'),obs);
 return {root,artifact,origin,source:run(event),
  parent:event==='workflow_run'?parent():null};
}
function archive(x,overrides={}){
 return archiveOne({
  artifactRoot:x.artifact,archiveRoot:x.root,
  runMeta:x.source,parentMeta:x.parent,
  asOfMs:Date.parse('2026-11-19T03:45:22Z'),...overrides
 });
}
test('scheduled-parent observation is preserved immutably with authentic metadata and no qualification',t=>{
 const x=fixture(t);
 const a=archive(x);
 assert.equal(a.sourceRunEvent,'workflow_run');
 assert.equal(a.parentProvenance,'GITHUB_API_SUCCESSFUL_SCHEDULE_MAIN');
 assert.equal(a.validatedParentRunId,PARENT);
 assert.equal(a.distinctCommitments,1);
 assert.equal(a.lateDirectionalCommitments,1);
 assert.equal(a.abstentionCommitments,0);
 assert.equal(a.independentQualificationCount,0);
 assert.equal(a.ordersAllowed,false);
 const out=inspectArchive(x.root);
 assert.deepEqual(out.originByEvent,{schedule:0,workflow_run:1});
 assert.equal(out.lateDirectional,1);
 assert.equal(out.runs,1);
 const orig=fs.readFileSync(path.join(x.artifact,'probes','001.json'));
 const stored=fs.readFileSync(path.join(x.root,'late-preexpiry-run',RUN,'probes','001.json'));
 assert.equal(Buffer.compare(orig,stored),0);
 assert.throws(()=>archive(x),/already archived/);
});
test('original direct scheduled observer is separately permitted with null parent',t=>{
 const x=fixture(t,{event:'schedule'});
 const a=archive(x);
 assert.equal(a.validatedParentRunId,null);
 assert.equal(a.parentProvenance,'GITHUB_API_DIRECT_SCHEDULE_MAIN');
 assert.deepEqual(inspectArchive(x.root).originByEvent,{schedule:1,workflow_run:0});
});
test('fake parent, changed parent event, failed parent or foreign repo blocks archive',t=>{
 for(const bad of [
  {name:'CASH pre-expiry public research observer'},
  {event:'workflow_dispatch'},
  {conclusion:'failure'},
  {head_branch:'feature'},
  {repository:{full_name:'other/fork'}},
  {id:Number(PARENT)+1},
  {updated_at:'2026-11-19T03:46:00Z'}
 ]){
  const x=fixture(t);
  assert.throws(()=>archive(x,{parentMeta:{...x.parent,...bad}}),
   /Untrusted GitHub parent schedule completion/);
  assert.equal(inspectArchive(x.root).runs,0);
 }
});
test('failed, PR, changed SHA or foreign source run is not accepted',t=>{
 for(const bad of [
  {event:'pull_request'},
  {conclusion:'failure'},
  {status:'in_progress'},
  {head_branch:'feature'},
  {head_sha:'0'.repeat(40)},
  {repository:{full_name:'another/repo'}},
  {id:Number(RUN)+1}
 ]){
  const x=fixture(t);
  assert.throws(()=>archive(x,{runMeta:{...x.source,...bad}}),
    /Untrusted observer GitHub run identity/);
 }
});
test('altered frozen side, late runner clock, changed original GH run or missing file refuses archive',t=>{
 for(const mutation of [
  (d,o)=>{o.frozenEvidence[0].frozenSide='NO';o.githubRunId='44453487858'},
  (d,o)=>{o.observedAtRunner='2026-11-19T03:45:00.001Z'},
  (d,o)=>{o.frozenEvidence[0].contractClosesAt='2026-11-19T03:44:00Z'},
  (d,o)=>{o.githubCommitSha='e'.repeat(40)}
 ]){
  const x=fixture(t),file=path.join(x.artifact,'public-preexpiry-observation.json');
  const o=JSON.parse(fs.readFileSync(file));mutation(x,o);put(file,o);
  assert.throws(()=>archive(x),/run|Pre-expiry|Forecast|outside|witness|match|archive|Unsafe/i);
 }
 const x=fixture(t);
 fs.unlinkSync(path.join(x.artifact,'public-preexpiry-observation.json'));
 assert.throws(()=>archive(x),/Probe archive cannot omit primary/);
});
test('individual historical WAIT remains a separate commitment from later YES in same run',t=>{
 const x=fixture(t);
 const p=path.join(x.artifact,'probes','001.json');
 const early=observation(x.origin,[item(EARLY,'WAIT')]);
 put(p,early);
 const a=archive(x);
 assert.equal(a.distinctCommitments,2);
 assert.equal(a.lateDirectionalCommitments,1);
 assert.equal(a.abstentionCommitments,1);
 const inventory=inspectArchive(x.root);
 assert.equal(inventory.distinctContracts,2);
 assert.equal(inventory.waits,1);
 assert.equal(inventory.lateDirectional,1);
});
test('same model/contract frozen side changing between separate probes is never silently deduplicated',t=>{
 const x=fixture(t),p=path.join(x.artifact,'probes','001.json');
 const first=observation(x.origin,[item(MODEL,'NO')]);
 put(p,first);
 assert.throws(()=>archive(x),/Conflicting prospective claims/);
});
test('no preexpiry forecast remains a counted completed run but no fictitious signal',t=>{
 const x=fixture(t,{probes:false});
 fs.unlinkSync(path.join(x.artifact,'public-preexpiry-observation.json'));
 put(path.join(x.artifact,'observer-run-summary.json'),
  summary({files:0,evidence:0}));
 const a=archive(x);
 assert.equal(a.distinctCommitments,0);
 assert.equal(a.lateDirectionalCommitments,0);
 const inventory=inspectArchive(x.root);
 assert.equal(inventory.runs,1);
 assert.equal(inventory.distinctContracts,0);
});
test('secret-bearing provenance, unexpected probe name or symlink does not archive',t=>{
 const x=fixture(t);
 const f=path.join(x.artifact,'observer-origin.json');
 const o=JSON.parse(fs.readFileSync(f));o.apiKey='SECRET';put(f,o);
 assert.throws(()=>archive(x),/extra provenance/);
 const y=fixture(t);
 put(path.join(y.artifact,'probes','bad.txt'),{x:1});
 assert.throws(()=>archive(y),/Unsafe or excessive GH probe/);
 const z=fixture(t);
 fs.unlinkSync(path.join(z.artifact,'probes','001.json'));
 fs.symlinkSync(path.join(z.artifact,'observer-origin.json'),
  path.join(z.artifact,'probes','001.json'));
 assert.throws(()=>archive(z),/Unsafe public witness/);
});
test('archived file mutation and preexisting conflicting frozen chronology are detected',t=>{
 const x=fixture(t),a=archive(x);
 const p=path.join(x.root,'late-preexpiry-run',RUN,'probes','001.json');
 fs.appendFileSync(p,'\n');
 assert.throws(()=>inspectArchive(x.root),/modified/);
});
test('empty public archive inventory never fabricates qualified evidence',t=>{
 const x=temp(t),r=inspectArchive(x.root);
 assert.equal(r.runs,0);
 assert.equal(r.independentlyQualifiedCount,0);
 assert.equal(r.ordersEnabled,false);
});
test('archive creation refuses the future GitHub source and mismatched event attribution',t=>{
 const x=fixture(t);
 assert.throws(()=>archive(x,{asOfMs:Date.parse(CREATED)-1000}),/cannot predate/);
 assert.throws(()=>validateSource(x.origin,{...x.source,event:'schedule'},x.parent),
  /Untrusted observer GitHub run/);
});
