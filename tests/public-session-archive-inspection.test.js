'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {inspectPublicSessionArchive}=require('../public-session-archive-inspection');
const dir=()=>fs.mkdtempSync(path.join(os.tmpdir(),'cash-session-inspection-'));
const sha=ch=>ch.repeat(64),market='KXBTC15M-26NOV180700-00';
const LIMIT='Source-generated event hashes are not proof of pre-expiry GitHub witnessing or independent qualification.';
function save(root,{model='late',session='a',side='YES',marketId=market,winner=null,firstRun='44319187125'}={}){
  const folder=model==='late'?'late-v1':'early-v3',head=sha(session);
  const entry={
    version:'CASH_PUBLIC_UNWITNESSED_SESSION_RECORD_V1',
    provenanceClass:'UNVERIFIED_RAILWAY_JOURNAL_EXPORTED_DURING_GITHUB_SCHEDULE',
    prediction:{
      sessionFirstEventSha256:head,
      model:model==='late'?'KXBTC15M_LATE_CHECKPOINT_SHADOW_V1':'KXBTC15M_SETTLEMENT_EARLY_V3',
      marketId,side,claimedFrozenAt:model==='late'?'2026-11-18T13:41:33.000Z':'2026-11-18T13:32:14.000Z',
      contractClosesAt:'2026-11-18T13:45:00.000Z',selfHashedForecastEventSha256:sha('b'),
      selfHashedForecastSequence:1,sourceType:'SINGLE_EXCHANGE_PROXY'
    },
    outcome:winner===null?null:{
      selfHashedOutcomeEventSha256:sha('c'),selfHashedOutcomeSequence:2,
      internallyReportedWinner:winner,firstSeenBackupRunId:firstRun
    },
    firstReadOnlyBackup:{
      runId:'44319187125',headSha:'9'.repeat(40),
      createdAt:'2026-11-18T13:58:18.000Z',
      completedAt:'2026-11-18T13:58:31.000Z',
      snapshotExportSha256:sha('f')
    },
    limitations:LIMIT,independentQualifiedCount:0,
    ordersEnabled:false,actualFillsVerified:0
  };
  const p=path.join(root,'public-sessions',folder,head,marketId+'.json');
  fs.mkdirSync(path.dirname(p),{recursive:true});
  fs.writeFileSync(p,JSON.stringify(entry,null,2)+'\n');
  return p;
}
test('initialized empty archive is never called a successful scheduled data commit',()=>{
  const root=dir();
  try{
    const r=inspectPublicSessionArchive(root);
    assert.equal(r.status,'NO_SCHEDULED_SESSION_DATA_COMMIT_VERIFIED');
    assert.equal(r.forecastRecordFiles,0);
    assert.equal(r.independentQualifiedCount,0);
    assert.equal(r.ordersEnabled,false);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('source-reported outcomes and WAITs remain nonqualifying and distinct by model',()=>{
  const root=dir();
  try{
    save(root,{model:'late',side:'NO',winner:'NO'});
    save(root,{model:'early',side:'WAIT'});
    const r=inspectPublicSessionArchive(root);
    assert.equal(r.status,'UNVERIFIED_PUBLIC_SESSION_RECORDS_PRESENT');
    assert.equal(r.forecastRecordFiles,2);
    assert.equal(r.sourceReportedOutcomes,1);
    assert.equal(r.pendingOutcomesInArchivedCopies,1);
    assert.equal(r.models.early.waits,1);
    assert.equal(r.models.late.directional,1);
    assert.equal(r.crossSessionMarketDuplicates,0);
    assert.equal(r.externallyWitnessedPreExpiryCount,null);
    assert.equal(r.independentQualifiedCount,0);
    assert.equal(r.actualFillsVerified,0);
    assert.equal(r.ordersEnabled,false);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('same contract in a new server session is counted as overlap, never a new independent market',()=>{
  const root=dir();
  try{
    save(root,{session:'a'});
    save(root,{session:'d'});
    const r=inspectPublicSessionArchive(root);
    assert.equal(r.models.late.sessions,2);
    assert.equal(r.models.late.forecastRecords,2);
    assert.equal(r.models.late.uniqueMarketIds,1);
    assert.equal(r.models.late.acrossSessionDuplicates,1);
    assert.equal(r.crossSessionMarketDuplicates,1);
    assert.equal(r.independentQualifiedCount,0);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('corrupt, private or falsely qualifying public archive is rejected before producing a report',()=>{
  const root=dir();
  try{
    const f=save(root,{winner:'YES'});
    const x=JSON.parse(fs.readFileSync(f,'utf8'));
    x.privateBalance=100000;
    fs.writeFileSync(f,JSON.stringify(x));
    assert.throws(()=>inspectPublicSessionArchive(root),/schema/);
    delete x.privateBalance;x.independentQualifiedCount=1;
    fs.writeFileSync(f,JSON.stringify(x));
    assert.throws(()=>inspectPublicSessionArchive(root),/falsely certified/);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('outcome first-seen GH run ID cannot predate the original first GH backup',()=>{
  const root=dir();
  try{
    const f=save(root,{winner:'YES',firstRun:'44318000000'});
    assert.throws(()=>inspectPublicSessionArchive(root),/backdated/);
    const x=JSON.parse(fs.readFileSync(f,'utf8'));
    x.outcome.firstSeenBackupRunId='44319187125';
    fs.writeFileSync(f,JSON.stringify(x));
    assert.equal(inspectPublicSessionArchive(root).sourceReportedOutcomes,1);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
