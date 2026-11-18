'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {audit}=require('./chronological-ledger-coverage');
const {scanPublicLedger}=require('./public-ledger-inspection');
const {auditWitnessedPaperEconomics}=require('./witnessed-paper-economics');
const date='2026-11-18',hash='a'.repeat(64),commit='b'.repeat(40);
function fixture(root,market,kind,side,winner=null,corroborated=true){
 const dir=path.join(root,'public-evidence',date,market);
 fs.mkdirSync(dir,{recursive:true});
 const record={
  version:'CASH_PUBLIC_GITHUB_WITNESS_LEDGER_V1',
  prediction:{model:kind==='early-v3'?'KXBTC15M_SETTLEMENT_EARLY_V3':'KXBTC15M_LATE_CHECKPOINT_SHADOW_V1',marketId:market,side,contractClosesAt:'2026-11-18T16:00:00.000Z',frozenEventSha256:hash},
  observations:[{githubObserverRunId:'44339205278',githubObserverHeadSha:commit,observedAtRunner:'2026-11-18T15:47:46.605Z',githubRunCreatedAt:'2026-11-18T15:44:59.000Z',githubRunEvent:'schedule',directKalshiActiveMarketCorroborated:corroborated}],
  firstReconciliation:{githubRunId:'44346830636',headSha:commit,reportSha256:hash},
  directlyRecheckedFinal:winner===null?null:{winner,directKalshiTwoReadStatus:'DIRECT_FINAL_TWO_READ_JOURNAL_HASH_MATCH',officialPublicFieldsSha256:hash,cashJournalPublicFieldsSha256:hash,directReadSeparationMs:21283,provenanceReconciliationGitHubRunId:'44346830636'},
  conditionalPaper:null,independentQualification:0,ordersEnabled:false,
  provenanceLimitations:'Public GitHub witness is not exchange-signed and cannot certify independent forecasting accuracy, genuine historical inputs, actual fills, or real profits.'
 };
 fs.writeFileSync(path.join(dir,kind+'.json'),JSON.stringify(record));
 return record;
}
function withTemp(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cash-ledger-'));
 try{fn(root)}finally{fs.rmSync(root,{recursive:true,force:true})}
}
test('empty ledger is not interpreted as zero model forecasts',()=>withTemp(root=>{
 const r=audit(root);
 assert.equal(r.archivedRecords,0);
 assert.equal(r.fullFrozenForecastDenominatorKnown,false);
 assert.equal(r.independentlyQualifiedCount,0);
}));
test('separates early WAIT and late hits misses unresolved with same market',()=>withTemp(root=>{
 const a='KXBTC15M-26NOV181100-00',b='KXBTC15M-26NOV181115-15',c='KXBTC15M-26NOV181130-30';
 fixture(root,a,'early-v3','WAIT');
 fixture(root,a,'late-v1','YES','YES');
 fixture(root,b,'late-v1','NO','YES');
 fixture(root,c,'late-v1','YES',null,false);
 const r=audit(root),inspected=scanPublicLedger(root),paper=auditWitnessedPaperEconomics(root);
 assert.equal(r.archivedRecords,4);
 assert.deepEqual([r.models.early.wait,r.models.late.hits,r.models.late.misses,r.models.late.unresolved,r.models.late.missingPrecloseCorroboration],[1,1,1,1,1]);
 assert.equal(inspected.fileCount,r.archivedRecords);
 assert.equal(paper.lateDirectionalDirectHits,r.models.late.hits);
 assert.equal(paper.lateDirectionalDirectMisses,r.models.late.misses);
 assert.equal(r.ordersEnabled,false);
}));
test('rejects duplicated market/model across dated folders',()=>withTemp(root=>{
 const market='KXBTC15M-26NOV181100-00';
 const record=fixture(root,market,'late-v1','YES','YES');
 const other=path.join(root,'public-evidence','2026-11-19',market);
 fs.mkdirSync(other,{recursive:true});
 fs.writeFileSync(path.join(other,'late-v1.json'),JSON.stringify(record));
 assert.throws(()=>audit(root));
}));
test('rejects invalid settlement winner rather than silently scoring',()=>withTemp(root=>{
 const market='KXBTC15M-26NOV181100-00';
 const record=fixture(root,market,'late-v1','YES','YES');
 record.directlyRecheckedFinal.winner='WAIT';
 fs.writeFileSync(path.join(root,'public-evidence',date,market,'late-v1.json'),JSON.stringify(record));
 assert.throws(()=>audit(root),/Unsupported direct Kalshi final/);
}));
