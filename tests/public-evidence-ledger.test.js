'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {safeMeta,applyReportToDirectory,archiveFile}=require('../public-evidence-ledger');
const MARKET='KXBTC15M-26NOV172050-50';
const CLOSE='2026-11-18T03:50:00.000Z';
const SHA='a'.repeat(64),EX='b'.repeat(64),REPORT='d'.repeat(64);
function meta(id='44234000001'){
 return {event:'schedule',repository:'xandputaaa/CASH-staging',
  runId:id,headSha:'e'.repeat(40),headBranch:'main',
  createdAt:'2026-11-18T03:59:00Z'};
}
function witness(patch={}){
 return {
  model:'KXBTC15M_LATE_CHECKPOINT_SHADOW_V1',
  marketId:MARKET,witnessedSide:'NO',
  contractClosesAt:CLOSE,
  directExchangeAtWitness:'MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET',
  directlyCheckedPublicMarket:true,
  observedAtRunner:'2026-11-18T03:46:40Z',
  observerGithubRunCreatedAt:'2026-11-18T03:46:10Z',
  observerGithubEvent:'schedule',
  observerGithubRunHeadSha:'f'.repeat(40),
  witnessGitHubRunId:'44233000001',
  observedCommitmentHash:SHA,
  state:'OBSERVED_DIRECTIONAL_HIT',
  directFinalStatus:'DIRECT_FINAL_TWO_READ_JOURNAL_HASH_MATCH',
  settlementEvidenceSha256:EX,publicWinner:'NO',
  directFinal:{
   directWinner:'NO',directPublicEvidenceSha256:EX,
   finalResultCorroborated:true,sourceReadSeparationMs:21000
  },
  witnessedPaper:{
   state:'WITNESSED_QUOTED_COUNTERFACTUAL_ONLY',
   observedAsk:.995,netAfterFees:{lower:-.005,upper:.0046},
   actualFillConfirmed:false,actualProfitVerified:false
  },
  ...patch
 };
}
function report(rows=[witness()]){
 return {version:'CASH_PROVISIONAL_EXTERNAL_WITNESS_RECONCILIATION_V1',
  matched:rows,independentQualifiedCount:0,executionVerified:false,
  ordersEnabled:false,
  secondSourceFinalAudit:{independentQualifiedCount:0},
  witnessCoverage:{independentlyQualifiedCount:0,archivalCompletenessProven:false}};
}
const dir=()=>fs.mkdtempSync(path.join(os.tmpdir(),'cash-ledger-'));
const file=d=>path.join(d,'public-evidence','2026-11-18',MARKET,'late-v1.json');
test('writes only a sanitized scheduled pre-expiry witness with public no-fill research result',()=>{
 const d=dir();
 try{
  const input=witness({apiKey:'PRIVATE_KEY_SHOULD_NEVER_APPEAR',
   licensedBRTI:999999,bankBalance:3,privateBlob:'SUPERSECRET'});
  const r=applyReportToDirectory(report([input]),meta(),d,
   {sourceReportSha256:REPORT});
  assert.equal(r.archivedOrUpdated,1);
  assert.equal(r.scheduledWitnessesConsidered,1);
  const raw=fs.readFileSync(file(d),'utf8'),obj=JSON.parse(raw);
  assert.equal(obj.prediction.side,'NO');
  assert.equal(obj.prediction.frozenEventSha256,SHA);
  assert.equal(obj.prediction.contractClosesAt,CLOSE);
  assert.equal(obj.observations.length,1);
  assert.equal(obj.observations[0].directKalshiActiveMarketCorroborated,true);
  assert.equal(obj.directlyRecheckedFinal.winner,'NO');
  assert.equal(obj.directlyRecheckedFinal.directReadSeparationMs,21000);
  assert.equal(obj.conditionalPaper.assumedNetOneContractUSDConservativeCentFee,-.005);
  assert.equal(obj.conditionalPaper.actualFillConfirmed,false);
  assert.equal(obj.independentQualification,0);
  assert.equal(obj.ordersEnabled,false);
  for(const x of ['PRIVATE_KEY_SHOULD_NEVER_APPEAR','SUPERSECRET',
   'licensedBRTI','bankBalance','privateBlob'])
   assert.equal(raw.includes(x),false);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('idempotent report replay creates no second change or data rewrite',()=>{
 const d=dir();
 try{
  const first=applyReportToDirectory(report(),meta(),d,{sourceReportSha256:REPORT});
  const a=fs.readFileSync(file(d),'utf8');
  const again=applyReportToDirectory(report(),meta(),d,{sourceReportSha256:REPORT});
  assert.equal(first.archivedOrUpdated,1);
  assert.equal(again.archivedOrUpdated,0);
  assert.equal(fs.readFileSync(file(d),'utf8'),a);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('scheduled pre-expiry witness is immutable while final result may be added later',()=>{
 const d=dir();
 try{
  const pending=witness({state:'OUTCOME_PENDING',publicWinner:undefined,
   settlementEvidenceSha256:undefined,directFinal:undefined,
   directFinalStatus:'DIRECT_FINAL_NOT_CHECKED',witnessedPaper:undefined});
  const first=applyReportToDirectory(report([pending]),meta('44234000001'),d,
    {sourceReportSha256:REPORT});
  assert.equal(first.archivedOrUpdated,1);
  assert.equal(JSON.parse(fs.readFileSync(file(d))).directlyRecheckedFinal,null);
  const updated=applyReportToDirectory(report(),meta('44234000002'),d,
    {sourceReportSha256:'e'.repeat(64)});
  assert.equal(updated.archivedOrUpdated,1);
  const full=JSON.parse(fs.readFileSync(file(d)));
  assert.equal(full.prediction.frozenEventSha256,SHA);
  assert.equal(full.firstReconciliation.githubRunId,'44234000001');
  assert.equal(full.directlyRecheckedFinal.winner,'NO');
  assert.equal(full.directlyRecheckedFinal.provenanceReconciliationGitHubRunId,'44234000002');
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('new GitHub preclose observation for the SAME frozen model adds a witness without rewriting prediction',()=>{
 const d=dir();
 try{
  applyReportToDirectory(report(),meta(),d,{sourceReportSha256:REPORT});
  const second=witness({
   witnessGitHubRunId:'44233000002',
   observedAtRunner:'2026-11-18T03:47:20Z',
   observerGithubRunCreatedAt:'2026-11-18T03:47:00Z'
  });
  const out=applyReportToDirectory(report([second]),meta('44234000002'),d,
   {sourceReportSha256:'c'.repeat(64)});
  assert.equal(out.archivedOrUpdated,1);
  const full=JSON.parse(fs.readFileSync(file(d)));
  assert.equal(full.observations.length,2);
  assert.deepEqual(full.observations.map(x=>x.githubObserverRunId),
   ['44233000001','44233000002']);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('conflicting frozen event hash, winner and original paper ask are never silently overwritten',()=>{
 const d=dir();
 try{
  applyReportToDirectory(report(),meta(),d,{sourceReportSha256:REPORT});
  const old=fs.readFileSync(file(d),'utf8');
  const cases=[
   witness({observedCommitmentHash:'c'.repeat(64)}),
   witness({publicWinner:'YES',state:'OBSERVED_DIRECTIONAL_MISS',
    directFinal:{...witness().directFinal,directWinner:'YES'}}),
   witness({witnessedPaper:{...witness().witnessedPaper,observedAsk:.992}})
  ];
  for(const bad of cases){
   assert.throws(()=>applyReportToDirectory(report([bad]),meta('44234000009'),d,
    {sourceReportSha256:REPORT}),/conflict/);
   assert.equal(fs.readFileSync(file(d),'utf8'),old);
  }
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('rejects after-close GitHub observation, malformed market, altered origin and non-scheduled writer',()=>{
 const d=dir();
 try{
  const bad=[
   witness({observedAtRunner:'2026-11-18T03:50:01Z'}),
   witness({marketId:'../ESCAPE'}),
   witness({observedCommitmentHash:'BAD'}),
   witness({observerGithubRunCreatedAt:'2026-11-18T03:49:00Z',
    observedAtRunner:'2026-11-18T03:46:40Z'}),
   witness({state:'OBSERVED_DIRECTIONAL_HIT',publicWinner:'YES'}),
  ];
  for(const x of bad)
   assert.throws(()=>applyReportToDirectory(report([x]),meta(),d,
    {sourceReportSha256:REPORT}));
  assert.equal(fs.existsSync(path.join(d,'public-evidence')),false);
  assert.throws(()=>safeMeta({...meta(),event:'pull_request'}));
  assert.throws(()=>safeMeta({...meta(),headBranch:'evil-branch'}));
  assert.throws(()=>applyReportToDirectory(report(),{...meta(),repository:'other/repo'},
   d,{sourceReportSha256:REPORT}));
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('PR/manual observations are omitted instead of being promoted into schedule-only longitudinal evidence',()=>{
 const d=dir();
 try{
  const x=applyReportToDirectory(report([witness({
   observerGithubEvent:'pull_request'
  })]),meta(),d,{sourceReportSha256:REPORT});
  assert.equal(x.archivedOrUpdated,0);
  assert.equal(x.omittedNonScheduled,1);
  assert.equal(fs.existsSync(path.join(d,'public-evidence')),false);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('WAIT witness is preserved but never scored as an executable YES/NO order',()=>{
 const d=dir();
 try{
  const x=applyReportToDirectory(report([witness({
   model:'KXBTC15M_SETTLEMENT_EARLY_V3',
   witnessedSide:'WAIT',state:'OBSERVED_WAIT_RESOLVED',
   witnessedPaper:undefined,
   directFinalStatus:'NOT_A_SCORED_DIRECTIONAL_SETTLEMENT',
   directFinal:undefined
  })]),meta(),d,{sourceReportSha256:REPORT});
  assert.equal(x.archivedOrUpdated,1);
  const f=path.join(d,'public-evidence','2026-11-18',MARKET,'early-v3.json');
  const got=JSON.parse(fs.readFileSync(f));
  assert.equal(got.prediction.side,'WAIT');
  assert.equal(got.directlyRecheckedFinal,null);
  assert.equal(got.conditionalPaper,null);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('full source report validation always rejects any automatic qualification or order permission',()=>{
 const d=dir();
 try{
  assert.throws(()=>applyReportToDirectory({...report(),independentQualifiedCount:100},
   meta(),d,{sourceReportSha256:REPORT}));
  assert.throws(()=>applyReportToDirectory({...report(),ordersEnabled:true},
   meta(),d,{sourceReportSha256:REPORT}));
  assert.throws(()=>applyReportToDirectory({...report(),
    witnessCoverage:{archivalCompletenessProven:true,independentlyQualifiedCount:0}},
    meta(),d,{sourceReportSha256:REPORT}));
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('actual serialized exact report bytes establish source SHA, not arbitrary rounded values',()=>{
 const d=dir();
 try{
  const source=path.join(d,'public-report.json');
  fs.writeFileSync(source,JSON.stringify(report([witness()]),null,2));
  const out=archiveFile(source,d,meta());
  assert.equal(out.archivedOrUpdated,1);
  assert.match(out.sourceSha256,/^[a-f0-9]{64}$/);
  assert.equal(out.independentQualification,0);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
