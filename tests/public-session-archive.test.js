'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {archiveSources,scanArchive,mergeEntry,sourceMeta}=require('../public-session-archive');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const MID='KXBTC15M-26NOV180700-00';
const EARLY='KXBTC15M_SETTLEMENT_EARLY_V3',
 LATE='KXBTC15M_LATE_CHECKPOINT_SHADOW_V1';
function event(type,p,sequence,prev){
 const e={sequence,recordedAt:type==='FORECAST'?p.at:
  '2026-11-18T14:05:00.000Z',type,payload:p,previousHash:prev};
 e.hash=hash(e);return e;
}
function journal(kind,{side='NO',outcome=null,marker='a',publicSource=true}={}){
 const early=kind==='early',at=early?'2026-11-18T13:32:14.000Z':
  '2026-11-18T13:41:33.000Z';
 const p={model:early?EARLY:LATE,marketId:MID,side:early?null:side,
  at,endTime:'2026-11-18T13:45:00.000Z',
  indexSourceType:publicSource?'SINGLE_EXCHANGE_PROXY':'OFFICIAL_BRTI_LIVE',
  spotPrice:64502.11,featureSamples:[{licensedBRTI:99999}],
  visibleMark:'SHOULD_NOT_APPEAR_'+marker};
 const first=event('FORECAST',p,1,'GENESIS');
 const events=[first];
 if(outcome!==null)events.push(event('OUTCOME',{
  marketId:MID,winner:outcome,publishedSource:'Kalshi',
  privateUserBalance:25000
 },2,first.hash));
 const head=events.at(-1).hash;
 return {
  version:early?'CASH_PROSPECTIVE_KALSHI_V1':'CASH_LATE_CHECKPOINT_SHADOW_V1',
  format:early?'CASH_PROSPECTIVE_HASHED_SESSION_V1':
   'CASH_LATE_CHECKPOINT_UNVERIFIED_HASH_CHAIN_V1',
  events,headHash:head,records:1,pending:outcome===null?1:0,
  ...(early?{qualifiedCount:0,independentlyTimeAttested:false,
   tradingAuthorized:false,automatedOrdersEnabled:false}:
   {independentQualification:0,independentlyTimeAttested:false,
    realMoneyAuthorized:false,canExecuteOrders:false})
 };
}
const meta=(run='44319000000')=>({
 repository:'xandputaaa/CASH-staging',event:'schedule',
 headBranch:'main',headSha:'e'.repeat(40),runId:run,
 createdAt:'2026-11-18T13:59:00Z',completedAt:'2026-11-18T14:01:00Z'
});
const get=d=>fs.readdirSync(path.join(d,'public-sessions','late-v1'))[0];
const file=d=>path.join(d,'public-sessions','late-v1',get(d),MID+'.json');
function apply(d,{early=journal('early'),late=journal('late'),source=meta()}={}){
 return archiveSources({early,late,source,root:d,
  earlyBytes:Buffer.from(JSON.stringify(early)),
  lateBytes:Buffer.from(JSON.stringify(late))});
}
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'cash-sessions-'));
test('hash-checks two public journals but archives only safe unverified forecast identity',()=>{
 const d=temp();
 try{
  const r=apply(d);
  assert.equal(r.newOrUpdatedRecordFiles,2);
  assert.equal(r.totalUnverifiedRecordsInRepository,2);
  assert.equal(r.models.early,'VERIFIED_PUBLIC_PROXY_JOURNAL');
  assert.equal(r.models.late,'VERIFIED_PUBLIC_PROXY_JOURNAL');
  const data=JSON.parse(fs.readFileSync(file(d),'utf8'));
  assert.equal(data.prediction.side,'NO');
  assert.equal(data.provenanceClass,
   'UNVERIFIED_RAILWAY_JOURNAL_EXPORTED_DURING_GITHUB_SCHEDULE');
  assert.equal(data.outcome,null);
  assert.equal(data.independentQualifiedCount,0);
  assert.equal(data.actualFillsVerified,0);
  assert.equal(data.ordersEnabled,false);
  const all=fs.readFileSync(file(d),'utf8');
  for(const value of ['spotPrice','licensedBRTI','privateUserBalance','featureSamples',
   'SHOULD_NOT_APPEAR','64502.11','25000'])
   assert.equal(all.includes(value),false);
  assert.equal(scanArchive(d).fileCount,2);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('repeated read-only snapshot does not rewrite original commitments or source metadata',()=>{
 const d=temp();
 try{
  const first=apply(d),old=fs.readFileSync(file(d),'utf8');
  const second=apply(d,{source:meta('44319000001')});
  assert.equal(first.newOrUpdatedRecordFiles,2);
  assert.equal(second.newOrUpdatedRecordFiles,0);
  assert.equal(fs.readFileSync(file(d),'utf8'),old);
  assert.equal(JSON.parse(old).firstReadOnlyBackup.runId,'44319000000');
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('later self-reported outcome may be appended WITHOUT changing original frozen prediction',()=>{
 const d=temp();
 try{
  apply(d);
  const old=JSON.parse(fs.readFileSync(file(d)));
  const updated=apply(d,{early:journal('early',{outcome:'NO'}),
   late:journal('late',{outcome:'NO'}),source:meta('44319000002')});
  const fresh=JSON.parse(fs.readFileSync(file(d)));
  assert.equal(updated.newOrUpdatedRecordFiles,2);
  assert.deepEqual(fresh.prediction,old.prediction);
  assert.deepEqual(fresh.firstReadOnlyBackup,old.firstReadOnlyBackup);
  assert.equal(fresh.outcome.internallyReportedWinner,'NO');
  assert.equal(fresh.outcome.firstSeenBackupRunId,'44319000002');
  assert.equal(scanArchive(d).internallyRecordedOutcomes,2);
  assert.equal(updated.independentlyQualifiedCount,0);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('corrupted final winner, outcome event hash or original event hash is rejected without rewrite',()=>{
 const d=temp();
 try{
  apply(d,{early:journal('early',{outcome:'NO'}),
   late:journal('late',{outcome:'NO'})});
  const prior=fs.readFileSync(file(d),'utf8');
  for(const altered of [
   journal('late',{outcome:'YES'}),
   journal('late',{outcome:'NO',marker:'b'})
  ]){
   assert.throws(()=>apply(d,{
    early:journal('early',{outcome:'NO'}),late:altered,
    source:meta('44319000002')}),/conflict/);
   assert.equal(fs.readFileSync(file(d),'utf8'),prior);
  }
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('new service session gets a DIFFERENT first-event hash and cannot overwrite previous session',()=>{
 const d=temp();
 try{
  apply(d);
  const r=apply(d,{early:journal('early',{marker:'restart'}),
    late:journal('late',{marker:'restart'}),
    source:meta('44319000002')});
  assert.equal(r.newOrUpdatedRecordFiles,2);
  assert.equal(scanArchive(d).fileCount,4);
  assert.equal(fs.readdirSync(path.join(d,'public-sessions','late-v1')).length,2);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('invalid existing file with any secret/new field fails before writing additional records',()=>{
 const d=temp();
 try{
  apply(d);
  const p=file(d),data=JSON.parse(fs.readFileSync(p));
  data.privateOrderToken='no_public_storage';
  fs.writeFileSync(p,JSON.stringify(data));
  assert.throws(()=>apply(d),/Invalid self-reported record schema/);
  assert.throws(()=>scanArchive(d),/schema/);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('server source cannot claim forecast made after GH snapshot completion or outside frozen lead window',()=>{
 const d=temp();
 try{
  const late=journal('late');late.events[0].payload.at='2026-11-18T14:05:00Z';
  late.events[0].recordedAt='2026-11-18T14:05:00Z';
  late.events[0].hash=hash((({hash,...body})=>body)(late.events[0]));
  late.headHash=late.events[0].hash;
  assert.throws(()=>apply(d,{late}),/freeze clocks inconsistent|Invalid self-reported forecast identity/);
  assert.equal(fs.existsSync(path.join(d,'public-sessions')),false);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('unknown source, private licensed full payload, forged write trigger and tampered SHA all fail closed',()=>{
 const d=temp();
 try{
  assert.throws(()=>apply(d,{source:{...meta(),event:'pull_request'}}),/scheduled/);
  assert.throws(()=>apply(d,{source:{...meta(),headBranch:'other'}}),/scheduled/);
  assert.throws(()=>apply(d,{late:journal('late',{publicSource:false})}),/licensed\/private/);
  const late=journal('late');
  late.events[0].payload.side='YES';
  assert.throws(()=>apply(d,{late}),/checksum/);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('license-redacted early is skipped and unredacted late source is preserved',()=>{
 const d=temp();
 try{
  const early={version:'CASH_PROSPECTIVE_KALSHI_V1',
   format:'CASH_PROSPECTIVE_REDACTED_COMMITMENTS_V1'};
  const r=apply(d,{early});
  assert.equal(r.models.early,'LICENSED_OR_REDACTED_SKIPPED');
  assert.equal(r.models.late,'VERIFIED_PUBLIC_PROXY_JOURNAL');
  assert.equal(r.newOrUpdatedRecordFiles,1);
  assert.equal(scanArchive(d).fileCount,1);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
test('empty invalid or missing source cannot be misrepresented as independent archival success',()=>{
 const d=temp();
 try{
  assert.throws(()=>archiveSources({early:null,late:null,
   earlyBytes:null,lateBytes:null,source:meta(),root:d}),/No public proxy/);
  assert.throws(()=>sourceMeta({...meta(),headSha:'fake'}),/successful scheduled/);
  assert.equal(scanArchive(d).independentQualifiedCount,0);
  assert.equal(scanArchive(d).actualFillsVerified,0);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});
