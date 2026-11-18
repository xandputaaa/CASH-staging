'use strict';
/*
 * Read-only archive-to-benchmark inventory. Never infers a missing market
 * from an absent file, never treats self-reported outcomes as official.
 */
const fs=require('node:fs'),path=require('node:path');
const {scanArchive}=require('./public-session-archive');
const {scanPublicLedger}=require('./public-ledger-inspection');
const {auditBenchmarkInputs}=require('./benchmark-evidence-gates');
const KINDS=[['early','early-v3'],['late','late-v1']];
function archiveBenchmarkInventory(sessionRoot,ledgerRoot){
 const source=path.resolve(sessionRoot),witness=path.resolve(ledgerRoot);
 scanArchive(source);scanPublicLedger(witness);
 const sources={early:new Map(),late:new Map()},witnesses={early:new Map(),late:new Map()};
 for(const [kind,folder] of KINDS){
  const root=path.join(source,'public-sessions',folder);
  if(fs.existsSync(root))for(const session of fs.readdirSync(root).sort()){
   const dir=path.join(root,session);
   for(const file of fs.readdirSync(dir).sort()){
    const p=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8')).prediction;
    const existing=sources[kind].get(p.marketId);
    if(existing&&(existing.side!==p.side||
      existing.selfHashedForecastEventSha256!==p.selfHashedForecastEventSha256))
     throw Error('Conflicting source forecast sessions for same market');
    sources[kind].set(p.marketId,p);
   }
  }
 }
 const root=path.join(witness,'public-evidence');
 if(fs.existsSync(root))for(const day of fs.readdirSync(root).sort()){
  for(const market of fs.readdirSync(path.join(root,day)).sort()){
   for(const [kind,folder] of KINDS){
    const file=path.join(root,day,market,folder+'.json');
    if(!fs.existsSync(file))continue;
    const record=JSON.parse(fs.readFileSync(file,'utf8'));
    if(witnesses[kind].has(market))throw Error('Duplicate witnessed market');
    witnesses[kind].set(market,record);
   }
  }
 }
 const marketIds=new Set([...sources.early.keys(),...sources.late.keys(),
  ...witnesses.early.keys(),...witnesses.late.keys()]);
 const rows={early:[],late:[]};
 const missingForecasts={early:0,late:0};
 let missingBothModels=0,conflictingSettlement=0;
 for(const marketId of [...marketIds].sort()){
  const a=witnesses.early.get(marketId)?.directlyRecheckedFinal?.winner;
  const b=witnesses.late.get(marketId)?.directlyRecheckedFinal?.winner;
  if(a&&b&&a!==b)conflictingSettlement++;
  const winner=a&&b&&a===b?a:null;
  for(const kind of ['early','late']){
   const src=sources[kind].get(marketId),wit=witnesses[kind].get(marketId);
   if(!src&&!wit)missingForecasts[kind]++;
   rows[kind].push({marketId,side:src?.side||wit?.prediction.side||'MISSING',
    winner,sourcePresent:!!src,witnessPresent:!!wit,
    sourceFrozenHash:src?.selfHashedForecastEventSha256||null,
    witnessFrozenHash:wit?.prediction.frozenEventSha256||null,
    directPrecloseCorroborated:!!wit?.observations.some(o=>
     o.githubRunEvent==='schedule'&&o.directKalshiActiveMarketCorroborated===true),
    directTwoReadSettlementVerified:!!(a&&b&&a===b&&wit?.directlyRecheckedFinal)});
  }
  if(!sources.early.has(marketId)&&!sources.late.has(marketId))
   missingBothModels++;
 }
 const audit=auditBenchmarkInputs({baseline:rows.early,candidate:rows.late});
 return {...audit,version:'CASH_READONLY_ARCHIVE_BENCHMARK_INVENTORY_V1',
  unionArchivedMarkets:marketIds.size,
  sourceOnlyOrWitnessOnlyMarkets:[...marketIds].filter(m=>
   !sources.early.has(m)||!sources.late.has(m)||
   !witnesses.early.has(m)||!witnesses.late.has(m)).length,
  missingBothModels,conflictingSettlement,
  missingForecasts,
  missingForecastsExcludedFromWaitCounts:true,
  missingForecastsReportedAsMissingSide:true,
  sourceRecordCounts:{early:sources.early.size,late:sources.late.size},
  witnessedRecordCounts:{early:witnesses.early.size,late:witnesses.late.size},
  eligibleMarketUniverseKnown:false,benchmarkQualificationAllowed:false,
  note:'Union of archived records only, NOT complete chronological eligible markets. A paired settlement is reported only when BOTH witnessed models have matching directly rechecked finals. Missing model forecasts are represented as MISSING, not WAIT, and remain in the archived-union denominator.'};
}
if(require.main===module){
 if(process.argv.length!==4)throw Error('Usage: node archive-benchmark-inventory.js SESSION_ROOT LEDGER_ROOT');
 console.log(JSON.stringify(archiveBenchmarkInventory(process.argv[2],process.argv[3]),null,2));
}
module.exports={archiveBenchmarkInventory};
