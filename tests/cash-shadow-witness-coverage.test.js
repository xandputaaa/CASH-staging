'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {inspectShadowWitnessArchive,verifyRecord}=require('../cash-shadow-witness-coverage');
const NOW=1795038661399,CLOSE=1795039200000,ASOF=1795038437246;
const MID='KXBTC15M-26NOV181700-00';
function fixture(run='44405660608',side='WAIT',marketId=MID,hash='a'.repeat(64),time=NOW){
 return {
  version:'CASH_SHADOW_GITHUB_PUBLIC_OBSERVATION_V1',
  provenance:'GITHUB_RUNNER_FETCH_AFTER_NETWORK_RESPONSE',
  sourceUrl:'https://cash-simulation-web-staging.up.railway.app/api/model-lab/shadow/export',
  sourceSha256:'b'.repeat(64),githubRunId:run,
  githubRepository:'xandputaaa/CASH-staging',
  githubCommitSha:'0b93f9d701319b6969c48d90d3ab0c02a21a55e4',
  observedAtRunner:new Date(time).toISOString(),
  status:'OBSERVED_PREEXPIRY',
  observedForecasts:[{
   modelId:'CASH_SHADOW_SPOT_MOMENTUM_V1',
   marketId,side,frozenEventHash:hash,observedAtRunnerMs:time,
   forecastAsOfMs:ASOF,contractClosesAtMs:CLOSE,
   source:'UNVERIFIED_PUBLIC_SHADOW_JOURNAL',independentQualification:false
  }],
  observedBeforeExpiryCount:1,independentlyQualifiedCount:0,
  realMoneyOrdersAllowed:false,note:'Runner UTC observation, not a proven settlement.'
 };
}
function temp(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-shadow-witness-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 return dir;
}
function put(root,doc){
 const dir=path.join(root,'public-shadow-witness');
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,doc.githubRunId+'.json'),JSON.stringify(doc)+'\n');
}
test('empty public shadow branch has zero evidence, not false wins',t=>{
 const r=inspectShadowWitnessArchive(temp(t));
 assert.equal(r.status,'EMPTY_WITNESS_ARCHIVE');
 assert.equal(r.uniqueDirectional,0);
 assert.equal(r.independentlyQualifiedCount,0);
 assert.equal(r.realMoneyOrdersAllowed,false);
});
test('real-shaped first WAIT counts as one witnessed abstention, not an accuracy outcome',t=>{
 const dir=temp(t);put(dir,fixture());
 const r=inspectShadowWitnessArchive(dir);
 assert.equal(r.archivedRunFiles,1);
 assert.equal(r.uniqueContracts,1);
 assert.equal(r.uniqueDirectional,0);
 assert.equal(r.uniqueAbstentions,1);
 assert.equal(r.totalObservedEntries,1);
 assert.equal(r.scoredDirectionalOutcomes,0);
 assert.equal(r.latestUnique[0].firstWitnessRunId,'44405660608');
});
test('repeat GitHub observation preserves original first-run identity and never double counts',t=>{
 const dir=temp(t);put(dir,fixture());
 put(dir,fixture('44405660609','WAIT',MID,'a'.repeat(64),NOW+60000));
 const r=inspectShadowWitnessArchive(dir);
 assert.equal(r.archivedRunFiles,2);
 assert.equal(r.uniqueContracts,1);
 assert.equal(r.uniqueAbstentions,1);
 assert.equal(r.repeatedObservations,1);
 assert.equal(r.latestUnique[0].firstWitnessRunId,'44405660608');
});
test('later independent YES call is a new witnessed directional hypothesis, never an outcome',t=>{
 const dir=temp(t);put(dir,fixture());
 put(dir,fixture('44405660610','YES','KXBTC15M-26NOV181715-00','c'.repeat(64),NOW+30000));
 const r=inspectShadowWitnessArchive(dir);
 assert.equal(r.uniqueContracts,2);
 assert.equal(r.uniqueDirectional,1);
 assert.equal(r.YES,1);
 assert.equal(r.WAIT,1);
 assert.equal(r.scoredDirectionalOutcomes,0);
});
test('conflicting frozen forecast on same market fails closed instead of choosing best answer',t=>{
 const dir=temp(t);put(dir,fixture());
 put(dir,fixture('44405660611','YES',MID,'c'.repeat(64),NOW+30000));
 assert.throws(()=>inspectShadowWitnessArchive(dir),/Conflicting immutable/);
});
test('post-expiry, too-near-close, forged qualification and secret fields are rejected',t=>{
 const dir=temp(t);
 for(const bad of [
  (()=>{const x=fixture();x.observedForecasts[0].observedAtRunnerMs=CLOSE;return x})(),
  (()=>{const x=fixture();x.observedForecasts[0].contractClosesAtMs=NOW+12000;return x})(),
  (()=>{const x=fixture();x.independentlyQualifiedCount=1;return x})(),
  (()=>{const x=fixture();x.ownerToken='SECRET_NOT_FOR_PUBLIC_ARCHIVE';return x})(),
  (()=>{const x=fixture();x.observedForecasts[0].exchangeApiKey='SECRET';return x})()
 ]){
  put(dir,bad);
  assert.throws(()=>inspectShadowWitnessArchive(dir),/Unsafe|Invalid/);
 }
});
test('unexpected files and symlinks cannot be incorporated as witnesses',t=>{
 const dir=temp(t);put(dir,fixture());
 const file=path.join(dir,'public-shadow-witness','not-a-run.json');
 fs.writeFileSync(file,'{}');
 assert.throws(()=>inspectShadowWitnessArchive(dir),/Unexpected file/);
 fs.unlinkSync(file);
 const target=path.join(dir,'public-shadow-witness','44405660609.json');
 fs.symlinkSync(path.join(dir,'public-shadow-witness','44405660608.json'),target);
 assert.throws(()=>inspectShadowWitnessArchive(dir),/Unsafe witness file/);
});
test('direct single-witness validation rejects missing GitHub metadata',()=>{
 const x=fixture();delete x.githubCommitSha;
 assert.throws(()=>verifyRecord(x,x.githubRunId),/Unsafe shadow witness schema/);
});
