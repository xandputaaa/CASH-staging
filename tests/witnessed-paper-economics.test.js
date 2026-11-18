'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {auditWitnessedPaperEconomics,wilson95Lower}=require('../witnessed-paper-economics');
const {applyReportToDirectory}=require('../public-evidence-ledger');
const sha=x=>x.repeat(64);
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'cash-paper-aggregate-'));
const META={event:'schedule',repository:'xandputaaa/CASH-staging',
 runId:'44334049917',headSha:'d'.repeat(40),headBranch:'main',
 createdAt:'2026-11-18T15:18:12.000Z'};
const MODEL='KXBTC15M_LATE_CHECKPOINT_SHADOW_V1';
const ID=i=>'KXBTC15M-26NOV180'+String(i).padStart(3,'0')+'-00';
function row(i,{side='NO',winner='NO',ask=.995,low=-.005,high=.0046,
 final=true,paper=true,wait=false}={}){
 const r={
  model:MODEL,marketId:ID(i),witnessedSide:wait?'WAIT':side,
  contractClosesAt:'2026-11-18T15:15:00.000Z',
  directlyCheckedPublicMarket:true,
  observedAtRunner:'2026-11-18T15:12:00.000Z',
  observerGithubRunCreatedAt:'2026-11-18T15:11:00.000Z',
  observerGithubEvent:'schedule',observerGithubRunHeadSha:'f'.repeat(40),
  witnessGitHubRunId:String(44332973399+i),
  observedCommitmentHash:sha('a'),
  state:wait?'OBSERVED_WAIT_RESOLVED':
   !final?'OUTCOME_PENDING':winner===side?'OBSERVED_DIRECTIONAL_HIT':'OBSERVED_DIRECTIONAL_MISS',
  directFinalStatus:final?'DIRECT_FINAL_TWO_READ_JOURNAL_HASH_MATCH':'NOT_RECHECKED',
  settlementEvidenceSha256:sha('b'),publicWinner:winner
 };
 if(final&&!wait)r.directFinal={directWinner:winner,
  directPublicEvidenceSha256:sha('b'),
  finalResultCorroborated:true,sourceReadSeparationMs:21000};
 if(final&&paper&&!wait)r.witnessedPaper={
  state:'WITNESSED_QUOTED_COUNTERFACTUAL_ONLY',observedAsk:ask,
  netAfterFees:{lower:low,upper:high},
  actualFillConfirmed:false,actualProfitVerified:false
 };
 return r;
}
function load(d,rows){
 const report={
  version:'CASH_PROVISIONAL_EXTERNAL_WITNESS_RECONCILIATION_V1',
  independentQualifiedCount:0,executionVerified:false,ordersEnabled:false,
  matched:rows,secondSourceFinalAudit:{independentQualifiedCount:0},
  witnessCoverage:{independentlyQualifiedCount:0,archivalCompletenessProven:false}
 };
 applyReportToDirectory(report,META,d,{sourceReportSha256:sha('c')});
 return auditWitnessedPaperEconomics(d);
}
test('empty public witness branch means unknown edge, not 0% or a tradeable strategy',()=>{
 const d=temp();try{
  const x=auditWitnessedPaperEconomics(d);
  assert.equal(x.ledgerRecords,0);
  assert.equal(x.lateDirectionalWilson95Lower,null);
  assert.equal(x.lateConservativePaperNetUSD,null);
  assert.equal(x.sampleRequirementMet,false);
  assert.equal(x.realOrdersEnabled,false);
  assert.equal(x.independentQualifiedCount,0);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('8/8 success yields descriptive Wilson lower bound far below 85% and no independent qualification',()=>{
 const x=wilson95Lower(8,8);
 assert.ok(x>.67&&x<.69);
 assert.ok(wilson95Lower(100,100)>.96);
 assert.equal(wilson95Lower(0,0),null);
 assert.throws(()=>wilson95Lower(9,8),/Invalid/);
 assert.throws(()=>wilson95Lower(-1,8),/Invalid/);
});
test('successful direction but high purchase price can produce negative paper return',()=>{
 const d=temp();try{
  const x=load(d,[
   row(1),row(2,{side:'YES',winner:'NO',ask:.22,low:-.23,high:-.22}),
   row(3,{wait:true,final:false,paper:false})
  ]);
  assert.equal(x.ledgerRecords,3);
  assert.equal(x.ledgerWaitRecords,1);
  assert.equal(x.lateDirectionalWitnessed,2);
  assert.equal(x.lateDirectionalDirectFinals,2);
  assert.equal(x.lateDirectionalDirectHits,1);
  assert.equal(x.lateDirectionalDirectMisses,1);
  assert.equal(x.lateDirectFinalsWithCounterfactualAsk,2);
  assert.equal(x.lateCorrectButNonpositiveConservativePaper,1);
  assert.equal(x.lateConservativePaperNetUSD,-.235);
  assert.equal(x.lateCentiCentFeePaperNetUSD,-.2154);
  assert.equal(x.actualFillsVerified,0);
  assert.equal(x.prospectiveIIDHoldoutEstablished,false);
  assert.equal(x.sampleRequirementMet,false);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('unsettled direct final and unpriced direct final stay in different denominators',()=>{
 const d=temp();try{
  const x=load(d,[row(1,{final:false,paper:false}),
   row(2,{final:true,paper:false}),
   row(3,{wait:true,final:false,paper:false})]);
  assert.equal(x.lateDirectionalWitnessed,2);
  assert.equal(x.lateDirectionalWithoutDirectFinal,1);
  assert.equal(x.lateDirectFinalsWithCounterfactualAsk,0);
  assert.equal(x.lateDirectFinalsWithoutCounterfactualAsk,1);
  assert.equal(x.lateConservativePaperNetUSD,null);
  assert.equal(x.actualFillsVerified,0);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('forged >gross hypothetical payoff is rejected even with syntactically valid ledger',()=>{
 const d=temp();try{
  const x=load(d,[row(1)]);
  assert.equal(x.lateDirectionalDirectHits,1);
  const file=path.join(d,'public-evidence','2026-11-18',ID(1),'late-v1.json');
  const entry=JSON.parse(fs.readFileSync(file,'utf8'));
  entry.conditionalPaper.assumedNetOneContractUSDRoundedCentiCentFee=.98;
  fs.writeFileSync(file,JSON.stringify(entry,null,2));
  assert.throws(()=>auditWitnessedPaperEconomics(d),/Impossible or inflated/);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('private or forged qualification fields cannot be used as paper research proof',()=>{
 const d=temp();try{
  load(d,[row(1)]);
  const file=path.join(d,'public-evidence','2026-11-18',ID(1),'late-v1.json');
  const entry=JSON.parse(fs.readFileSync(file,'utf8'));
  entry.apiKey='SECRET';
  fs.writeFileSync(file,JSON.stringify(entry,null,2));
  assert.throws(()=>auditWitnessedPaperEconomics(d),/Unexpected or missing/);
  delete entry.apiKey;entry.independentQualification=100;
  fs.writeFileSync(file,JSON.stringify(entry,null,2));
  assert.throws(()=>auditWitnessedPaperEconomics(d),/Ledger attempted/);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
