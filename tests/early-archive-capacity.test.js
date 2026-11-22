'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {digest}=require('../kalshi-prospective-model');
const {createProspectiveMonitor}=require('../prospective-monitor');
const {archiveSources}=require('../public-session-archive');
const {assessEarlyArchiveCapacity,runReport}=require('../early-archive-capacity');
const SHA=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const iso=t=>new Date(t).toISOString();
const T=Date.parse('2026-11-18T12:00:00Z');
const market=i=>'KXBTC15M-26NOV18'+String(i).padStart(4,'0')+'-30';
function setup(count,{pending=0,archive=true}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cash-early-capacity-'));
 const events=[];let lastHash='GENESIS';
 const put=(type,payload,at)=>{
  const body={sequence:events.length+1,recordedAt:iso(at),
   type,payload,previousHash:lastHash};
  const event={...body,hash:SHA(body)};lastHash=event.hash;events.push(event);
 };
 for(let i=0;i<count;i++){
  const at=T+i*900000;
  put('FORECAST',{marketId:market(i),model:'KXBTC15M_SETTLEMENT_EARLY_V3',
   at:iso(at),endTime:iso(at+180000),side:null,targetPrice:85000,
   sampleWindow:[],sampleWindowSha256:digest([]),
   validation:'UNVALIDATED_PROXY_MODEL',indexSourceType:'SINGLE_EXCHANGE_PROXY',
   realMoneyAuthorized:false,calibratedProbability:null,expectedValue:null},at);
 }
 const later=T+(count+1)*900000;
 for(let i=0;i<count-pending;i++){
  const snapshot={venue:'Kalshi',ticker:market(i),status:'settled',result:'void',
   floor_strike:85000,expiration_value:null,strike_type:'greater_or_equal',
   is_provisional:false};
  put('OUTCOME',{marketId:market(i),winner:'VOID',evidence:{
   status:'verified',venue:'Kalshi',marketId:market(i),winner:'VOID',
   checkedAt:iso(later+30000),firstObservedAt:iso(later+5000),
   confirmationCount:2,evidenceSnapshot:snapshot,evidenceSha256:SHA(snapshot),
   evidenceSourceUrl:'https://external-api.kalshi.com/trade-api/v2/markets/'+market(i)
  }},later+60000);
 }
 const early=createProspectiveMonitor({quotes:{},spot:{},results:{},
  clock:()=>later+120000,store:{mode:'FILESYSTEM_JOURNAL_UNVERIFIED',
    events,append(){}}}).exportSession();
 if(archive&&count>0){
  archiveSources({early,late:null,root,
   source:{repository:'xandputaaa/CASH-staging',event:'schedule',headBranch:'main',
    headSha:'a'.repeat(40),runId:'44983844925',
    createdAt:iso(later+90000),completedAt:iso(later+110000)},
   earlyBytes:Buffer.from(JSON.stringify(early))});
 }
 return {early,root,first:events[0]?.hash,
  cleanup(){fs.rmSync(root,{recursive:true,force:true})}};
}
test('archives source claims without giving abstaining research any validation credit',()=>{
 const x=setup(307,{pending:1});try{
  const z=assessEarlyArchiveCapacity({early:x.early,archiveRoot:x.root});
  assert.equal(z.status,'EARLY_CAPACITY_LOW_SOURCE_ARCHIVED');
  assert.equal(z.sourceRecords,307);assert.equal(z.sourceOutcomes,306);
  assert.equal(z.remainingSlots,13);
  assert.equal(z.archiveForecastsMatched,307);
  assert.equal(z.archiveOutcomesMatched,306);
  assert.equal(z.archiveMissingForecasts,0);
  assert.equal(z.archiveMissingOutcomes,0);
  assert.equal(z.operatorOfflineReviewCandidate,false);
  assert.equal(z.safeToRotateOrRestartRailway,false);
  assert.equal(z.independentlyQualifiedCount,0);
 }finally{x.cleanup()}
});
test('only complete 320 frozen + 320 resolved with exact archive copy is offline review candidate',()=>{
 const x=setup(320);try{
  const z=assessEarlyArchiveCapacity({early:x.early,archiveRoot:x.root});
  assert.equal(z.status,'FULLY_ARCHIVED_SOURCE_READY_FOR_SEPARATE_DISK_PREFLIGHT');
  assert.equal(z.archiveForecastsMatched,320);
  assert.equal(z.archiveOutcomesMatched,320);
  assert.equal(z.operatorOfflineReviewCandidate,true);
  assert.equal(z.fullDiskPreflightPerformed,false);
  assert.equal(z.safeToRotateOrRestartRailway,false);
  assert.equal(z.ordersEnabled,false);
 }finally{x.cleanup()}
});
test('journal at hard cap with pending market is never declared ready for rollover',()=>{
 const x=setup(320,{pending:1});try{
  const z=assessEarlyArchiveCapacity({early:x.early,archiveRoot:x.root});
  assert.equal(z.status,'EARLY_JOURNAL_FULL_PENDING_SETTLEMENT');
  assert.equal(z.remainingSlots,0);
  assert.equal(z.sourcePending,1);
  assert.equal(z.operatorOfflineReviewCandidate,false);
 }finally{x.cleanup()}
});
test('one missing archive forecast or resolved outcome refuses complete coverage claim',()=>{
 const x=setup(320);try{
  const file=path.join(x.root,'public-sessions','early-v3',
   x.first,market(0)+'.json');
  fs.unlinkSync(file);
  let z=assessEarlyArchiveCapacity({early:x.early,archiveRoot:x.root});
  assert.equal(z.status,'ARCHIVE_INCOMPLETE_OR_SOURCE_SNAPSHOT_STALE');
  assert.equal(z.archiveMissingForecasts,1);
  assert.equal(z.operatorOfflineReviewCandidate,false);
  // Now restore a validated entry but remove its source-reported outcome.
  // Cannot silently replace a later archive outcome with an empty object.
  const y=setup(1);try{
   const f=path.join(y.root,'public-sessions','early-v3',y.first,market(0)+'.json');
   const rec=JSON.parse(fs.readFileSync(f,'utf8'));
   rec.outcome=null;
   fs.writeFileSync(f,JSON.stringify(rec));
   z=assessEarlyArchiveCapacity({early:y.early,archiveRoot:y.root});
   assert.equal(z.archiveMissingForecasts,0);
   assert.equal(z.archiveMissingOutcomes,1);
  }finally{y.cleanup()}
 }finally{x.cleanup()}
});
test('tampered archived forecast and redacted source never authorize rollover',()=>{
 const x=setup(1);try{
  const f=path.join(x.root,'public-sessions','early-v3',x.first,market(0)+'.json');
  const rec=JSON.parse(fs.readFileSync(f,'utf8'));
  rec.prediction.selfHashedForecastEventSha256='f'.repeat(64);
  fs.writeFileSync(f,JSON.stringify(rec));
  assert.throws(()=>assessEarlyArchiveCapacity({early:x.early,archiveRoot:x.root}));
  const redacted={...x.early,format:'CASH_PROSPECTIVE_REDACTED_COMMITMENTS_V1',
   events:x.early.events.map(({hash,sequence,type,previousHash,recordedAt})=>({
    hash,sequence,type,previousHash,recordedAt}))};
  const z=assessEarlyArchiveCapacity({early:redacted,archiveRoot:x.root});
  assert.equal(z.status,'REDACTED_SOURCE_ARCHIVE_COVERAGE_NOT_PROVABLE');
  assert.equal(z.archiveForecastsMatched,null);
  assert.equal(z.operatorOfflineReviewCandidate,false);
 }finally{x.cleanup()}
});
test('empty new cohort is safe to report, with no false archive requirement',()=>{
 const early=createProspectiveMonitor({
  quotes:{},spot:{},results:{},store:{mode:'VOLATILE_SERVER_SESSION',
   events:[],append(){}}
 }).exportSession();
 const report=assessEarlyArchiveCapacity({early,archiveRoot:'/unused/does/not/exist'});
 assert.equal(report.status,'EMPTY_EARLY_COHORT');
 assert.equal(report.sourceRecords,0);
 assert.equal(report.remainingSlots,320);
});
test('CLI report never prints market IDs, prices, paths or secrets',()=>{
 const x=setup(1);try{
  const file=path.join(x.root,'early-source.json');
  fs.writeFileSync(file,JSON.stringify(x.early));
  const before=fs.readdirSync(x.root).sort();
  const orig=console.log,logs=[];
  console.log=(...args)=>logs.push(args.join(' '));
  try{runReport(file,x.root)}finally{console.log=orig}
  assert.match(logs.join('\n'),/CASH_EARLY_ARCHIVE_RECORDS=1/);
  assert.match(logs.join('\n'),/CASH_EARLY_INDEPENDENTLY_QUALIFIED=0/);
  assert.doesNotMatch(logs.join('\n'),/KXBTC15M-|85000|source\.json/);
  assert.deepEqual(fs.readdirSync(x.root).sort(),before);
 }finally{x.cleanup()}
});
