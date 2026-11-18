'use strict';
/*
 * CASH research BACKUP continuity, NOT an independently witnessed sample.
 *
 * Trusted GitHub schedule-only workflow_run consumes a successful public
 * twice-hourly snapshot artifact and appends self-reported, source-hashed
 * FORECAST identities plus subsequently recorded OUTCOME hashes to a
 * dedicated Git branch. Never exposes raw Kraken history, CF licensed
 * BRTI, positions, credentials, balances, or sample feature prices.
 *
 * The ledger is NOT an exchange attest, a trusted freeze clock, a
 * simulator's result oracle or a replacement for real server storage.
 */
const crypto=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const {verifiedJournal}=require('./preexpiry-observer');
const MODELS={
 early:{model:'KXBTC15M_SETTLEMENT_EARLY_V3',folder:'early-v3',
  format:'CASH_PROSPECTIVE_HASHED_SESSION_V1',leads:[90000,780000]},
 late:{model:'KXBTC15M_LATE_CHECKPOINT_SHADOW_V1',folder:'late-v1',
  format:'CASH_LATE_CHECKPOINT_UNVERIFIED_HASH_CHAIN_V1',leads:[150000,210000]}
};
const SHA=/^[a-f0-9]{64}$/,COMMIT=/^[a-f0-9]{40}$/,
 RUN=/^\d{8,16}$/,MARKET=/^KXBTC15M-[A-Za-z0-9-]{6,70}$/;
const hash=buf=>crypto.createHash('sha256').update(buf).digest('hex');
const ms=s=>typeof s==='string'?Date.parse(s):NaN;
const iso=s=>Number.isFinite(ms(s))?new Date(ms(s)).toISOString():null;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function exactKeys(v,keys,label){
 if(!v||typeof v!=='object'||Array.isArray(v)||
  !same(Object.keys(v).sort(),keys.slice().sort()))
  throw Error('Invalid '+label+' schema or unknown fields');
}
function sourceMeta(m){
 if(!m||m.repository!=='xandputaaa/CASH-staging'||
   m.event!=='schedule'||m.headBranch!=='main'||
   !RUN.test(String(m.runId))||!COMMIT.test(m.headSha||'')||
   !iso(m.createdAt)||!iso(m.completedAt)||
   ms(m.completedAt)<ms(m.createdAt)||
   ms(m.completedAt)-ms(m.createdAt)>45*60000)
  throw Error('Public session source must be a successful scheduled main-branch GitHub snapshot');
 return {runId:String(m.runId),headSha:m.headSha,
  createdAt:iso(m.createdAt),completedAt:iso(m.completedAt)};
}
function scanArchive(root,{maxFiles=25000}={}){
 if(!Number.isInteger(maxFiles)||maxFiles<1||maxFiles>50000)
  throw Error('Invalid public session archive scan limit');
 const dir=path.join(path.resolve(root),'public-sessions');
 const stats={fileCount:0,directional:0,waits:0,
  internallyRecordedOutcomes:0,independentQualifiedCount:0,
  actualFillsVerified:0,ordersEnabled:false};
 if(!fs.existsSync(dir))return stats;
 function visit(d,parts){
  const meta=fs.lstatSync(d);
  if(meta.isSymbolicLink()||!meta.isDirectory())
   throw Error('Invalid public session archive directory');
  for(const name of fs.readdirSync(d).sort()){
   if(!/^[A-Za-z0-9_.-]{1,90}$/.test(name)||name==='.'||name==='..')
    throw Error('Unsafe public session archive path');
   const p=path.join(d,name),st=fs.lstatSync(p);
   if(st.isSymbolicLink())throw Error('Untrusted public session archive symlink');
   if(st.isDirectory()){
    if(parts.length>=2)throw Error('Unexpected session archive nesting');
    visit(p,[...parts,name]);
   }else{
    if(!st.isFile()||parts.length!==2||
       !['early-v3','late-v1'].includes(parts[0])||
       !SHA.test(parts[1])||
       !/^KXBTC15M-[A-Za-z0-9-]{6,70}\.json$/.test(name)||
       st.size<200||st.size>14000)
     throw Error('Invalid public session archive file');
    if(++stats.fileCount>maxFiles)throw Error('Public session archive file cap reached');
    const data=JSON.parse(fs.readFileSync(p,'utf8'));
    validateEntry(data,{modelFolder:parts[0],sessionHash:parts[1],
      marketId:name.slice(0,-5)});
    if(data.prediction.side==='WAIT')stats.waits++;
    else stats.directional++;
    if(data.outcome!==null)stats.internallyRecordedOutcomes++;
   }
  }
 }
 visit(dir,[]);
 return stats;
}
function validateEntry(x,{modelFolder,sessionHash,marketId}){
 exactKeys(x,['version','provenanceClass','prediction','outcome',
  'firstReadOnlyBackup','limitations','independentQualifiedCount',
  'ordersEnabled','actualFillsVerified'],'self-reported record');
 if(x.version!=='CASH_PUBLIC_UNWITNESSED_SESSION_RECORD_V1'||
   x.provenanceClass!=='UNVERIFIED_RAILWAY_JOURNAL_EXPORTED_DURING_GITHUB_SCHEDULE'||
   x.independentQualifiedCount!==0||x.ordersEnabled!==false||
   x.actualFillsVerified!==0||typeof x.limitations!=='string'||
   !x.limitations.includes('not proof of pre-expiry GitHub witnessing'))
  throw Error('Unsafe or falsely certified self-reported record');
 exactKeys(x.prediction,['sessionFirstEventSha256','model',
  'marketId','side','claimedFrozenAt','contractClosesAt',
  'selfHashedForecastEventSha256','selfHashedForecastSequence',
  'sourceType'],'forecast');
 const p=x.prediction;
 const spec=Object.values(MODELS).find(v=>v.folder===modelFolder);
 if(!spec||p.model!==spec.model||!MARKET.test(p.marketId||'')||
   p.marketId!==marketId||p.sourceType!=='SINGLE_EXCHANGE_PROXY'||
   !['YES','NO','WAIT'].includes(p.side)||
   !SHA.test(p.sessionFirstEventSha256||'')||
   p.sessionFirstEventSha256!==sessionHash||
   !SHA.test(p.selfHashedForecastEventSha256||'')||
   !Number.isSafeInteger(p.selfHashedForecastSequence)||
   p.selfHashedForecastSequence<1||!iso(p.claimedFrozenAt)||
   !iso(p.contractClosesAt)||
   ms(p.contractClosesAt)-ms(p.claimedFrozenAt)<spec.leads[0]||
   ms(p.contractClosesAt)-ms(p.claimedFrozenAt)>spec.leads[1])
  throw Error('Invalid self-reported forecast identity');
 exactKeys(x.firstReadOnlyBackup,['runId','headSha',
  'createdAt','completedAt','snapshotExportSha256'],'GitHub backup origin');
 const b=x.firstReadOnlyBackup;
 if(!RUN.test(b.runId||'')||!COMMIT.test(b.headSha||'')||
   !SHA.test(b.snapshotExportSha256||'')||
   !iso(b.createdAt)||!iso(b.completedAt)||
   ms(b.createdAt)>ms(b.completedAt)||
   ms(p.claimedFrozenAt)>ms(b.completedAt)+5000)
  throw Error('Invalid original backup metadata or future forecast');
 if(x.outcome!==null){
  exactKeys(x.outcome,['selfHashedOutcomeEventSha256',
   'selfHashedOutcomeSequence','internallyReportedWinner',
   'firstSeenBackupRunId'],'self-reported outcome');
  if(!SHA.test(x.outcome.selfHashedOutcomeEventSha256||'')||
    !Number.isSafeInteger(x.outcome.selfHashedOutcomeSequence)||
    x.outcome.selfHashedOutcomeSequence<=p.selfHashedForecastSequence||
    ![null,'YES','NO'].includes(x.outcome.internallyReportedWinner)||
    !RUN.test(x.outcome.firstSeenBackupRunId||''))
   throw Error('Invalid self-reported outcome');
 }
 return x;
}
function samePrediction(a,b){return same(a.prediction,b.prediction)}
function mergeEntry(old,newValue){
 if(!old)return newValue;
 const p=old.prediction;
 validateEntry(old,{
  modelFolder:p.model===MODELS.early.model?'early-v3':'late-v1',
  sessionHash:p.sessionFirstEventSha256,marketId:p.marketId
 });
 if(!samePrediction(old,newValue))
  throw Error('Immutable original forecast commitment conflict');
 if(old.outcome&&newValue.outcome&&
   !same({...old.outcome,firstSeenBackupRunId:null},
      {...newValue.outcome,firstSeenBackupRunId:null}))
  throw Error('Self-reported outcome hash or winner conflict, manual review required');
 if(old.outcome||!newValue.outcome)return old;
 return {...old,outcome:newValue.outcome};
}
function sourceJournal(j,kind){
 const spec=MODELS[kind];
 if(!j)return {state:'MISSING',accepted:[]};
 if(j.format==='CASH_PROSPECTIVE_REDACTED_COMMITMENTS_V1'){
  if(kind!=='early'||j.version!=='CASH_PROSPECTIVE_KALSHI_V1')
   throw Error('Unexpected source redaction');
  return {state:'LICENSED_OR_REDACTED_SKIPPED',accepted:[]};
 }
 if(j.format!==spec.format)throw Error('Unexpected public session source format');
 return {state:'VERIFIED_PUBLIC_PROXY_JOURNAL',accepted:verifiedJournal(j,kind)};
}
function prepareForecasts(j,kind,metadata,digest){
 const {state,accepted}=sourceJournal(j,kind);
 const spec=MODELS[kind],outcomeByMarket=new Map(),prepared=[];
 if(state!=='VERIFIED_PUBLIC_PROXY_JOURNAL')
  return {state,prepared,excluded:0};
 for(const e of j.events){
  if(e.type!=='OUTCOME')continue;
  const id=e.payload.marketId;
  if(outcomeByMarket.has(id))throw Error('Multiple outcome events for same market');
  const src=accepted.find(x=>x.p.marketId===id)?.p;
  if(!MARKET.test(id||'')||![null,'YES','NO'].includes(e.payload?.winner)||
     !src||!iso(e.recordedAt)||
     ms(e.recordedAt)<ms(src.endTime)||
     ms(e.recordedAt)>ms(metadata.completedAt)+5000)
   throw Error('Unsafe or future self-reported outcome');
  outcomeByMarket.set(id,e);
 }
 const first=accepted[0]?.e.hash;
 let excluded=0;
 for(const {e,p} of accepted){
  if(p.indexSourceType!=='SINGLE_EXCHANGE_PROXY'){
   // The presence of licensed/private inputs in a full public payload
   // is unexpected. Refuse the entire archival update (not leak fields).
   throw Error('Cannot archive public source with licensed/private model inputs');
  }
  if(!SHA.test(first||''))throw Error('Missing original session commitment');
  if(!iso(p.at)||!iso(p.endTime)||!iso(e.recordedAt)||
     Math.abs(ms(e.recordedAt)-ms(p.at))>5000||
     ms(p.at)>ms(metadata.completedAt)+5000)
   throw Error('Source journal freeze clocks inconsistent with snapshot time');
  const date=p.side===null?'WAIT':p.side;
  const outcome=outcomeByMarket.get(p.marketId);
  const obj={
   version:'CASH_PUBLIC_UNWITNESSED_SESSION_RECORD_V1',
   provenanceClass:'UNVERIFIED_RAILWAY_JOURNAL_EXPORTED_DURING_GITHUB_SCHEDULE',
   prediction:{
    sessionFirstEventSha256:first,model:spec.model,marketId:p.marketId,
    side:date,claimedFrozenAt:iso(p.at),
    contractClosesAt:iso(p.endTime),
    selfHashedForecastEventSha256:e.hash,
    selfHashedForecastSequence:e.sequence,
    sourceType:'SINGLE_EXCHANGE_PROXY'
   },
   outcome:outcome?{
    selfHashedOutcomeEventSha256:outcome.hash,
    selfHashedOutcomeSequence:outcome.sequence,
    internallyReportedWinner:outcome.payload.winner,
    firstSeenBackupRunId:metadata.runId
   }:null,
   firstReadOnlyBackup:{
    ...metadata,snapshotExportSha256:digest
   },
   limitations:'Server-generated hash chain and claimed freeze timestamp, not proof of pre-expiry GitHub witnessing, exact CF BRTI, original market input integrity, tradeable odds, fill, or independently qualified accuracy.',
   independentQualifiedCount:0,ordersEnabled:false,actualFillsVerified:0
  };
  validateEntry(obj,{modelFolder:spec.folder,sessionHash:first,
   marketId:p.marketId});
  prepared.push({relativePath:path.posix.join('public-sessions',spec.folder,
   first,p.marketId+'.json'),value:obj});
 }
 return {state,prepared,excluded};
}
function archiveSources({
 early,late,source,root,
 earlyBytes,lateBytes
}){
 const m=sourceMeta(source);
 const models=[
  ['early',early,earlyBytes],
  ['late',late,lateBytes]
 ];
 const candidates=[],status={};
 for(const [kind,j,raw] of models){
  if(j&&(!raw||!Buffer.isBuffer(raw)||
     raw.length>2621440))
   throw Error('Source bytes missing or too large');
  const digest=j?hash(raw):null;
  const data=prepareForecasts(j,kind,m,digest);
  status[kind]=data.state;
  candidates.push(...data.prepared);
 }
 if(!candidates.length)
  throw Error('No public proxy FORECAST events to archive');
 const rootDir=path.resolve(root),pending=new Map();
 scanArchive(rootDir); // reject unsafe existing public records first
 for(const {relativePath,value} of candidates){
  const file=path.resolve(rootDir,relativePath);
  if(!file.startsWith(rootDir+path.sep)||pending.has(file))
   throw Error('Unsafe or duplicated session archive destination');
  const existing=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
  const merged=mergeEntry(existing,value);
  if(!same(existing,merged))pending.set(file,merged);
 }
 // All field and history checks must pass before ANY mutation.
 for(const [file,item] of pending){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const tmp=file+'.incoming';
  fs.writeFileSync(tmp,JSON.stringify(item,null,2)+'\n',{mode:0o644});
  fs.renameSync(tmp,file);
 }
 const inspected=scanArchive(rootDir);
 const output={
  version:'CASH_PUBLIC_UNWITNESSED_SESSION_ARCHIVE_RESULT_V1',
  sourceRunId:m.runId,models:status,
  originalSessionForecastsSeen:candidates.length,
  newOrUpdatedRecordFiles:pending.size,
  totalUnverifiedRecordsInRepository:inspected.fileCount,
  independentlyQualifiedCount:0,ordersEnabled:false,
  disclaimer:'Self-reported server journal hashes, not externally witnessed pre-expiry forecasts. Separate from the schedule-only GH pre-expiry evidence ledger. No permanent Railway persistence or trading unlock.'
 };
 console.log('CASH_SELF_REPORT_ARCHIVE_NEW_OR_UPDATED='+output.newOrUpdatedRecordFiles);
 console.log('CASH_SELF_REPORT_ARCHIVE_TOTAL='+output.totalUnverifiedRecordsInRepository);
 console.log('CASH_SELF_REPORT_ARCHIVE_EARLY='+output.models.early);
 console.log('CASH_SELF_REPORT_ARCHIVE_LATE='+output.models.late);
 console.log('CASH_SELF_REPORT_ARCHIVE_INDEPENDENT_QUALIFIED=0');
 return output;
}
function archiveFiles(earlyPath,latePath,root,meta){
 const earlyBytes=fs.existsSync(earlyPath)?fs.readFileSync(earlyPath):null;
 const lateBytes=fs.existsSync(latePath)?fs.readFileSync(latePath):null;
 return archiveSources({
  early:earlyBytes?JSON.parse(earlyBytes):null,
  late:lateBytes?JSON.parse(lateBytes):null,
  earlyBytes,lateBytes,root,source:meta
 });
}
if(require.main===module){
 const [earlyPath,latePath,root]=process.argv.slice(2);
 if(!earlyPath||!latePath||!root)
  throw Error('Usage: node public-session-archive.js EARLY_JSON LATE_JSON ARCHIVE_ROOT');
 archiveFiles(earlyPath,latePath,root,{
  repository:process.env.GITHUB_REPOSITORY,
  event:process.env.CASH_SOURCE_EVENT,
  headBranch:process.env.CASH_SOURCE_BRANCH,
  headSha:process.env.CASH_SOURCE_HEAD_SHA,
  runId:process.env.CASH_SOURCE_RUN_ID,
  createdAt:process.env.CASH_SOURCE_CREATED_AT,
  completedAt:process.env.CASH_SOURCE_COMPLETED_AT
 });
}
module.exports={sourceMeta,scanArchive,validateEntry,mergeEntry,
 prepareForecasts,archiveSources,archiveFiles};
