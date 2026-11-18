'use strict';
// Compare two separately validated GitHub archives by model/market identity.
// This is a coverage diagnostic, NOT proof of independent qualification.
const fs=require('node:fs'),path=require('node:path');
const {scanArchive}=require('./public-session-archive');
const {scanPublicLedger}=require('./public-ledger-inspection');
const MODEL=[['early','early-v3'],['late','late-v1']];
function compareArchives(sessionRoot,ledgerRoot){
 const source=path.resolve(sessionRoot),witness=path.resolve(ledgerRoot);
 const s=scanArchive(source),w=scanPublicLedger(witness);
 const report={version:'CASH_CROSS_ARCHIVE_IDENTITY_AUDIT_V1',models:{},
  sourceRecordFiles:s.fileCount,witnessRecordFiles:w.fileCount,
  independentlyQualifiedCount:0,actualFillsVerified:0,ordersEnabled:false,
  archivalCompletenessProven:false,
  caveat:'Matching a source record to a GitHub witness by market and frozen event hash is a coverage cross-check only. It does not establish a complete denominator, exchange-signed inputs, or independent prediction accuracy.'};
 for(const [kind,folder] of MODEL){
  const sources=new Map(),witnesses=new Map();
  const base=path.join(source,'public-sessions',folder);
  if(fs.existsSync(base))for(const session of fs.readdirSync(base).sort()){
   for(const file of fs.readdirSync(path.join(base,session)).sort()){
    const x=JSON.parse(fs.readFileSync(path.join(base,session,file),'utf8'));
    const key=x.prediction.marketId;
    if(!sources.has(key))sources.set(key,[]);
    sources.get(key).push(x.prediction);
   }
  }
  const ledger=path.join(witness,'public-evidence');
  if(fs.existsSync(ledger))for(const date of fs.readdirSync(ledger).sort()){
   for(const market of fs.readdirSync(path.join(ledger,date)).sort()){
    const file=path.join(ledger,date,market,folder+'.json');
    if(!fs.existsSync(file))continue;
    const x=JSON.parse(fs.readFileSync(file,'utf8'));
    if(witnesses.has(x.prediction.marketId))throw Error('Duplicate witnessed model/market');
    witnesses.set(x.prediction.marketId,x.prediction);
   }
  }
  const result={sourceFiles:0,uniqueSourceMarkets:sources.size,
   witnessedMarkets:witnesses.size,sourceMarketsWithWitness:0,
   sourceMarketsWithoutWitness:0,witnessMarketsWithoutSource:0,
   exactFrozenHashMatches:0,frozenHashConflicts:0,
   sourceMarketWithMultipleSessions:0,sourceIdentityConflicts:0};
  for(const [market,predictions] of sources){
   result.sourceFiles+=predictions.length;
   if(predictions.length>1)result.sourceMarketWithMultipleSessions++;
   if(predictions.some(p=>p.side!==predictions[0].side||
     p.selfHashedForecastEventSha256!==predictions[0].selfHashedForecastEventSha256||
     p.claimedFrozenAt!==predictions[0].claimedFrozenAt))
    result.sourceIdentityConflicts++;
   const observed=witnesses.get(market);
   if(!observed){result.sourceMarketsWithoutWitness++;continue}
   result.sourceMarketsWithWitness++;
   if(predictions.some(p=>p.selfHashedForecastEventSha256===observed.frozenEventSha256&&
     p.side===observed.side&&p.contractClosesAt===observed.contractClosesAt))
    result.exactFrozenHashMatches++;
   else result.frozenHashConflicts++;
  }
  for(const market of witnesses.keys())if(!sources.has(market))result.witnessMarketsWithoutSource++;
  if(result.sourceFiles!==[...sources.values()].reduce((n,a)=>n+a.length,0)||
     result.sourceMarketsWithWitness+result.sourceMarketsWithoutWitness!==sources.size||
     result.sourceMarketsWithWitness+result.witnessMarketsWithoutSource!==witnesses.size||
     result.exactFrozenHashMatches+result.frozenHashConflicts!==result.sourceMarketsWithWitness)
   throw Error('Cross-archive inventory invariant violated');
  report.models[kind]=result;
 }
 if(report.models.early.sourceFiles+report.models.late.sourceFiles!==s.fileCount||
    report.models.early.witnessedMarkets+report.models.late.witnessedMarkets!==w.fileCount)
  throw Error('Cross-archive file totals mismatch');
 return report;
}
if(require.main===module){
 if(process.argv.length!==4)throw Error('Usage: node cross-archive-identity-audit.js SESSION_ROOT LEDGER_ROOT');
 console.log(JSON.stringify(compareArchives(process.argv[2],process.argv[3]),null,2));
}
module.exports={compareArchives};
