'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {scanPublicLedger,inspectEntry}=require('../public-ledger-inspection');
const {applyReportToDirectory}=require('../public-evidence-ledger');
const MARKET='KXBTC15M-26NOV172050-50';
const CLOSE='2026-11-18T03:50:00.000Z';
const folder=()=>fs.mkdtempSync(path.join(os.tmpdir(),'cash-ledger-integrity-'));
const meta={event:'schedule',repository:'xandputaaa/CASH-staging',
 runId:'44234000001',headSha:'e'.repeat(40),headBranch:'main',
 createdAt:'2026-11-18T03:59:00Z'};
const expectedPath=d=>path.join(d,'public-evidence','2026-11-18',MARKET,'late-v1.json');
const report=(rows)=>({
 version:'CASH_PROVISIONAL_EXTERNAL_WITNESS_RECONCILIATION_V1',
 matched:rows,independentQualifiedCount:0,executionVerified:false,
 ordersEnabled:false,secondSourceFinalAudit:{independentQualifiedCount:0},
 witnessCoverage:{independentlyQualifiedCount:0,archivalCompletenessProven:false}
});
function row(extra={}){
 return {
  model:'KXBTC15M_LATE_CHECKPOINT_SHADOW_V1',marketId:MARKET,
  witnessedSide:'NO',contractClosesAt:CLOSE,
  directlyCheckedPublicMarket:true,
  observedAtRunner:'2026-11-18T03:46:40.000Z',
  observerGithubRunCreatedAt:'2026-11-18T03:46:10.000Z',
  observerGithubEvent:'schedule',
  observerGithubRunHeadSha:'f'.repeat(40),
  witnessGitHubRunId:'44233000001',
  observedCommitmentHash:'a'.repeat(64),
  state:'OBSERVED_DIRECTIONAL_HIT',
  directFinalStatus:'DIRECT_FINAL_TWO_READ_JOURNAL_HASH_MATCH',
  settlementEvidenceSha256:'b'.repeat(64),publicWinner:'NO',
  directFinal:{directWinner:'NO',
   directPublicEvidenceSha256:'b'.repeat(64),
   finalResultCorroborated:true,sourceReadSeparationMs:22000},
  witnessedPaper:{
   state:'WITNESSED_QUOTED_COUNTERFACTUAL_ONLY',
   observedAsk:.995,netAfterFees:{lower:-.005,upper:.0046},
   actualFillConfirmed:false,actualProfitVerified:false
  },
  ...extra
 };
}
function initialize(d,items=[row()]){
 applyReportToDirectory(report(items),meta,d,{sourceReportSha256:'d'.repeat(64)});
}
test('before-first-scheduled-write empty ledger returns zero with no fabricated qualifications',()=>{
 const d=folder();try{
  const r=scanPublicLedger(d);
  assert.equal(r.fileCount,0);
  assert.equal(r.earlyCount,0);assert.equal(r.lateCount,0);
  assert.equal(r.independentlyQualifiedCount,0);
  assert.equal(r.ordersEnabled,false);
  assert.equal(r.archiveCompletenessGuaranteed,false);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('trusted archiver output passes strict complete file inspection and preserves losing paper win',()=>{
 const d=folder();try{
  initialize(d);
  const r=scanPublicLedger(d);
  assert.equal(r.fileCount,1);
  assert.equal(r.scheduledWitnesses,1);
  assert.equal(r.lateCount,1);
  assert.equal(r.directionalCount,1);
  assert.equal(r.directFinalCount,1);
  assert.equal(r.directionalFinalHits,1);
  assert.equal(r.directionalFinalMisses,0);
  assert.equal(r.conditionalPaperPriced,1);
  assert.equal(r.correctButNonpositiveConservativePaper,1);
  assert.equal(r.independentlyQualifiedCount,0);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('WAIT records remain archive evidence but not scored as directional wins',()=>{
 const d=folder();try{
  initialize(d,[row({
   model:'KXBTC15M_SETTLEMENT_EARLY_V3',
   witnessedSide:'WAIT',state:'OBSERVED_WAIT_RESOLVED',
   witnessedPaper:undefined,directFinal:undefined,
   directFinalStatus:'NOT_A_SCORED_DIRECTIONAL_SETTLEMENT'
  })]);
  const r=scanPublicLedger(d);
  assert.equal(r.earlyCount,1);
  assert.equal(r.waitCount,1);
  assert.equal(r.directionalCount,0);
  assert.equal(r.directFinalCount,0);
  assert.equal(r.conditionalPaperPriced,0);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('any secret-like extra field is rejected without printing its value',()=>{
 const d=folder();try{
  initialize(d);
  const file=expectedPath(d),obj=JSON.parse(fs.readFileSync(file));
  obj.privateAPIKey='NEVER_PRINT_MY_KEY';
  fs.writeFileSync(file,JSON.stringify(obj));
  assert.throws(()=>scanPublicLedger(d),/Unexpected or missing entry fields/);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('tampered frozen hash, pre-expiry witness, future outcome or access flags fail closed',()=>{
 const d=folder();try{
  initialize(d);
  const file=expectedPath(d),original=JSON.parse(fs.readFileSync(file));
  const mutations=[
   x=>{x.prediction.frozenEventSha256='BAD'},
   x=>{x.prediction.side='UP'},
   x=>{x.observations[0].observedAtRunner='2026-11-18T03:50:05.000Z'},
   x=>{x.observations[0].githubRunEvent='pull_request'},
   x=>{x.firstReconciliation.reportSha256='oops'},
   x=>{x.independentQualification=100},
   x=>{x.ordersEnabled=true},
   x=>{x.conditionalPaper.actualFillConfirmed=true},
   x=>{x.conditionalPaper.actualProfitVerified=true},
   x=>{x.directlyRecheckedFinal.winner='WAIT'},
   x=>{x.directlyRecheckedFinal.directReadSeparationMs=5000},
  ];
  for(const f of mutations){
   const copy=structuredClone(original);f(copy);
   fs.writeFileSync(file,JSON.stringify(copy));
   assert.throws(()=>scanPublicLedger(d));
  }
  fs.writeFileSync(file,JSON.stringify(original));
  assert.equal(scanPublicLedger(d).fileCount,1);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('symlinks, nested directory paths, wrong filename and unknown extra files rejected',()=>{
 const d=folder();try{
  initialize(d);
  const dir=path.dirname(expectedPath(d));
  fs.symlinkSync(expectedPath(d),path.join(dir,'bad-extra.json'));
  assert.throws(()=>scanPublicLedger(d),/symlink/);
  fs.unlinkSync(path.join(dir,'bad-extra.json'));
  fs.writeFileSync(path.join(dir,'something.txt'),'hello');
  assert.throws(()=>scanPublicLedger(d),/Unexpected public ledger file/);
  fs.unlinkSync(path.join(dir,'something.txt'));
  fs.mkdirSync(path.join(dir,'extra'));
  assert.throws(()=>scanPublicLedger(d),/nested ledger/);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('caps the number of public ledger files; never claims scorecard qualification',()=>{
 const d=folder();try{
  initialize(d);
  assert.throws(()=>scanPublicLedger(d,{maxFiles:0}),/maximum ledger scan/);
  assert.throws(()=>scanPublicLedger(d,{maxFiles:99999}),/maximum ledger scan/);
  assert.equal(scanPublicLedger(d,{maxFiles:1}).independentlyQualifiedCount,0);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('source entry must match stored file date, market, model and expiry',()=>{
 const d=folder();try{
  initialize(d);
  const obj=JSON.parse(fs.readFileSync(expectedPath(d),'utf8'));
  assert.throws(()=>inspectEntry(obj,{
    date:'2026-11-17',market:MARKET,kind:'late-v1'}),/Frozen forecast identity/);
  assert.throws(()=>inspectEntry(obj,{
    date:'2026-11-18',market:'KXBTC15M-OTHER-MARKET',kind:'late-v1'}),
     /Frozen forecast identity/);
  assert.throws(()=>inspectEntry(obj,{
    date:'2026-11-18',market:MARKET,kind:'early-v3'}),
     /Frozen forecast identity/);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
