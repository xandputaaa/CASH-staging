'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createShadowJournal}=require('../cash-shadow-journal');
const {inspectShadowExchangeArchive,joinExchangeEvidenceToSettlement}=
 require('../cash-shadow-exchange-archive');
const {reconcileShadowPublicFinals}=require('../cash-shadow-settlement-reconciler');
const {runShadowSettlement}=require('../cash-shadow-settlement-runner');
const ASOF=1795038437246,OBS=1795038661399,CLOSE=1795039200000;
const MARKET='KXBTC15M-26NOV181700-00';
const RUN='44405660608';
function temp(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-public-paired-audit-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;
}
function fixture(side='WAIT',run=RUN,observed=OBS,strike=65000){
 const journal=createShadowJournal();
 const event=journal.append({
  modelId:'CASH_SHADOW_SPOT_MOMENTUM_V1',marketId:MARKET,
  side,reason:'TEST_ONLY',asOfMs:ASOF,leadSeconds:(CLOSE-ASOF)/1000,
  strikePrice:strike,features:{testOnly:true},calibrated:false,
  probability:null,executionAllowed:false
 },{recordedAtMs:ASOF+1000});
 const observation={
  version:'CASH_SHADOW_GITHUB_PUBLIC_OBSERVATION_V1',
  provenance:'GITHUB_RUNNER_FETCH_AFTER_NETWORK_RESPONSE',
  sourceUrl:'https://cash-simulation-web-staging.up.railway.app/api/model-lab/shadow/export',
  sourceSha256:'a'.repeat(64),githubRunId:run,
  githubRepository:'xandputaaa/CASH-staging',
  githubCommitSha:'23dd1436dc09bdd7f581810ce7b175281ec029bb',
  observedAtRunner:new Date(observed).toISOString(),
  status:'OBSERVED_PREEXPIRY',observedBeforeExpiryCount:1,
  observedForecasts:[{
   modelId:event.modelId,marketId:event.marketId,side:event.side,
   frozenEventHash:event.hash,observedAtRunnerMs:observed,
   forecastAsOfMs:event.asOfMs,contractClosesAtMs:event.closesAtMs,
   source:'UNVERIFIED_PUBLIC_SHADOW_JOURNAL',independentQualification:false
  }],
  independentlyQualifiedCount:0,realMoneyOrdersAllowed:false,
  note:'GH runner preexpiry source claim, not an outcome.'
 };
 return {observation,snapshot:journal.exportSnapshot(),event};
}
function exchange(obs,{strike=6500000,match=true,at=OBS+1000}={}){
 return {
  version:'CASH_SHADOW_GITHUB_PUBLIC_EXCHANGE_CHECK_V1',
  githubRunId:obs.githubRunId,
  originalWitnessSourceSha256:obs.sourceSha256,
  originalWitnessObservedAtRunner:obs.observedAtRunner,
  sourceJournalSecondFetchSha256:'b'.repeat(64),
  status:'PUBLIC_MARKETS_CHECKED',
  marketChecksAttempted:1,
  preExpiryPublicExchangeMatches:match?1:0,
  comparisonRecords:[{
   marketId:MARKET,
   side:obs.observedForecasts[0].side,
   frozenEventHash:obs.observedForecasts[0].frozenEventHash,
   contractClosesAtMs:CLOSE,
   checkedAtRunner:new Date(at).toISOString(),
   state:match?'MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET':
    'EXCHANGE_STRIKE_OR_RULE_MISMATCH',
   publicFieldsSha256:'c'.repeat(64),
   publicStrikeCents:match?strike:null,
   rule:match?'greater_or_equal':null,
   independentQualification:false
  }],
  independentQualificationCount:0,
  sourceClockIndependentlyAttested:false,
  publishedKalshiBRTIIndependentlyReplicated:false,
  fillsVerified:false,ordersEnabled:false,note:'Unverified public Kalshi fields only'
 };
}
function put(root,doc,xch=null){
 const dir=path.join(root,'public-shadow-witness');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,doc.githubRunId+'.json'),JSON.stringify(doc));
 if(xch){
  const ex=path.join(root,'public-shadow-exchange-checks');
  fs.mkdirSync(ex,{recursive:true});
  fs.writeFileSync(path.join(ex,doc.githubRunId+'.json'),JSON.stringify(xch));
 }
}
test('legacy archive with no companion exchange checks is not treated as matched',t=>{
 const root=temp(t),{observation}=fixture();put(root,observation);
 const x=inspectShadowExchangeArchive(root);
 assert.equal(x.witnessedUniqueContracts,1);
 assert.equal(x.corroborationRunFiles,0);
 assert.equal(x.matchedUniqueContracts,0);
 assert.equal(x.contracts[0].state,'NO_PREEXPIRY_PUBLIC_MARKET_CHECK');
 assert.equal(x.independentlyQualifiedCount,0);
});
test('real-shaped WAIT with direct Kalshi preclose matched fields is corroborated but never scored',t=>{
 const root=temp(t),{observation}=fixture();
 put(root,observation,exchange(observation));
 const x=inspectShadowExchangeArchive(root);
 assert.equal(x.corroborationRunFiles,1);
 assert.equal(x.matchedUniqueContracts,1);
 assert.equal(x.matchedWaits,1);
 assert.equal(x.matchedDirectionalContracts,0);
 assert.equal(x.contracts[0].matchedPublicStrikeCents,6500000);
 assert.equal(x.contracts[0].independentlyQualified,false);
});
test('repeat runs over same frozen WAIT count once with two independently timestamped public reads',t=>{
 const root=temp(t),a=fixture(),b=fixture('WAIT','44405660609',OBS+60000);
 put(root,a.observation,exchange(a.observation));
 put(root,b.observation,exchange(b.observation,{at:OBS+61000}));
 const x=inspectShadowExchangeArchive(root);
 assert.equal(x.witnessedUniqueContracts,1);
 assert.equal(x.matchedUniqueContracts,1);
 assert.equal(x.corroborationRunFiles,2);
 assert.equal(x.contracts[0].matchingRunObservations,2);
 assert.equal(x.contracts[0].firstMatchedAt,new Date(OBS+1000).toISOString());
});
test('same commitment with different public strikes fails closed, not a cherry-picked match',t=>{
 const root=temp(t),a=fixture(),b=fixture('WAIT','44405660609',OBS+60000);
 put(root,a.observation,exchange(a.observation));
 put(root,b.observation,exchange(b.observation,{strike:6500001,at:OBS+61000}));
 assert.throws(()=>inspectShadowExchangeArchive(root),/Inconsistent direct Kalshi/);
});
test('nonmatching public exchange record remains visible without falsifying a match',t=>{
 const root=temp(t),a=fixture();
 put(root,a.observation,exchange(a.observation,{match:false}));
 const x=inspectShadowExchangeArchive(root);
 assert.equal(x.matchedUniqueContracts,0);
 assert.equal(x.uncorroboratedUniqueContracts,1);
 assert.equal(x.contracts[0].state,'PREEXPIRY_PUBLIC_MARKET_NOT_CORROBORATED');
});
test('orphaned public exchange check without the original preclose witness fails closed',t=>{
 const root=temp(t),a=fixture();
 const ex=path.join(root,'public-shadow-exchange-checks');fs.mkdirSync(ex);
 fs.writeFileSync(path.join(ex,RUN+'.json'),JSON.stringify(exchange(a.observation)));
 assert.throws(()=>inspectShadowExchangeArchive(root),/lacks original pre-expiry witness/);
});
test('extra secrets, forged qualification and swapped run IDs fail closed',t=>{
 for(const change of [
  x=>{x.privateKalshiKey='SECRET'},
  x=>{x.independentQualificationCount=1},
  x=>{x.githubRunId='44405660000'},
  x=>{x.originalWitnessSourceSha256='9'.repeat(64)},
  x=>{x.comparisonRecords[0].privateToken='never'}
 ]){
  const root=temp(t),a=fixture(),x=exchange(a.observation);
  change(x);put(root,a.observation,x);
  assert.throws(()=>inspectShadowExchangeArchive(root),/Invalid|Unsafe|mismatch/i);
 }
});
test('late after-contract public read cannot become preexpiry matched evidence',t=>{
 const root=temp(t),a=fixture(),x=exchange(a.observation,{at:CLOSE-12000});
 put(root,a.observation,x);
 assert.throws(()=>inspectShadowExchangeArchive(root),/Invalid/);
});
test('invalid file, symlink and unknown filename are rejected, not skipped',t=>{
 const root=temp(t),a=fixture();put(root,a.observation,exchange(a.observation));
 const dir=path.join(root,'public-shadow-exchange-checks');
 fs.writeFileSync(path.join(dir,'unexpected.txt'),'{}');
 assert.throws(()=>inspectShadowExchangeArchive(root),/Unexpected/);
 fs.unlinkSync(path.join(dir,'unexpected.txt'));
 fs.symlinkSync(path.join(dir,RUN+'.json'),path.join(dir,'44405660609.json'));
 assert.throws(()=>inspectShadowExchangeArchive(root),/Unsafe/);
});
test('join preserves existing provisional public result counts and adds preexpiry evidence tier',async t=>{
 const root=temp(t),a=fixture('YES');put(root,a.observation,exchange(a.observation));
 let clock=CLOSE+60000,network=0;
 const report=await reconcileShadowPublicFinals({archiveRoot:root,sourceSnapshot:a.snapshot},{
  clock:()=>clock,delay:async()=>{clock+=21000},
  fetchImpl:async()=>{
   network++;return {ok:true,text:async()=>JSON.stringify({market:{
    ticker:MARKET,close_time:new Date(CLOSE).toISOString(),
    settlement_ts:new Date(CLOSE+5000).toISOString(),
    status:'settled',is_provisional:false,strike_type:'greater_or_equal',
    floor_strike:65000,expiration_value:65010,result:'yes'
   }})};
  }
 });
 const enhanced=joinExchangeEvidenceToSettlement(
  report,inspectShadowExchangeArchive(root),{sourceSnapshot:a.snapshot});
 assert.equal(network,2);
 assert.equal(report.provisionalHits,1);
 assert.equal(enhanced.provisionalHits,1);
 assert.equal(enhanced.provisionalMisses,0);
 assert.equal(enhanced.preExpiryPublicExchangeCorroboration.provisionalHitsWithPreExpiryMarketMatch,1);
 assert.equal(enhanced.preExpiryPublicExchangeCorroboration.provisionalMissesWithPreExpiryMarketMatch,0);
 assert.equal(enhanced.rows[0].preExpiryPublicMarketEvidence,'PREEXPIRY_PUBLIC_MARKET_MATCHED');
 assert.equal(enhanced.independentlyQualifiedCount,0);
});
test('runner writes joined WAIT evidence from paired files without any Kalshi final request',async t=>{
 const root=temp(t),a=fixture('WAIT');put(root,a.observation,exchange(a.observation));
 const output=path.join(root,'out.json');let count=0;
 const r=await runShadowSettlement({
  archiveRoot:root,outFile:output,clock:()=>CLOSE+60000,
  fetchImpl:async url=>{
   count++;assert.match(url,/api\/model-lab\/shadow\/export$/);
   return {ok:true,text:async()=>JSON.stringify(a.snapshot)};
  }
 });
 assert.equal(count,1);
 assert.equal(r.rows[0].preExpiryPublicMarketEvidence,'PREEXPIRY_PUBLIC_MARKET_MATCHED');
 assert.equal(r.evaluatedDirectional,0);
 assert.equal(r.preExpiryPublicExchangeCorroboration.matchedWaits,1);
 assert.equal(r.independentlyQualifiedCount,0);
 assert.equal(r.realMoneyOrdersAllowed,false);
 assert.equal(JSON.parse(fs.readFileSync(output,'utf8')).rows[0].side,'WAIT');
});
test('missing public snapshot retains original source unavailable status with no new score',async t=>{
 const root=temp(t),a=fixture('WAIT');put(root,a.observation,exchange(a.observation));
 const r=await runShadowSettlement({
  archiveRoot:root,outFile:path.join(root,'out.json'),
  clock:()=>CLOSE+60000,fetchImpl:async()=>{throw Error('outage')}
 });
 assert.equal(r.state,'SOURCE_JOURNAL_UNAVAILABLE');
 assert.equal(r.preExpiryPublicExchangeCorroboration.matchedUniqueContracts,1);
 assert.equal(r.evaluatedDirectional,0);
 assert.equal(r.independentlyQualifiedCount,0);
});
