'use strict';
// Read-only inventory of the durable public witness ledger. This is NOT
// the full forecast denominator and never certifies accuracy or execution.
const fs=require('node:fs');
const path=require('node:path');
const {scanPublicLedger}=require('./public-ledger-inspection');
function audit(root){
  const inventory=scanPublicLedger(path.resolve(root));
  const base=path.join(path.resolve(root),'public-evidence');
  const models={early:{records:0,wait:0,directional:0,directFinal:0,hits:0,misses:0,unresolved:0,missingPrecloseCorroboration:0},
                late:{records:0,wait:0,directional:0,directFinal:0,hits:0,misses:0,unresolved:0,missingPrecloseCorroboration:0}};
  const seen=new Set();
  if(fs.existsSync(base))for(const day of fs.readdirSync(base).sort()){
    const dayPath=path.join(base,day);
    if(!fs.statSync(dayPath).isDirectory())continue;
    for(const market of fs.readdirSync(dayPath).sort()){
      const marketPath=path.join(dayPath,market);
      if(!fs.statSync(marketPath).isDirectory())continue;
      for(const [filename,kind] of [['early-v3.json','early'],['late-v1.json','late']]){
        const file=path.join(marketPath,filename);
        if(!fs.existsSync(file))continue;
        const record=JSON.parse(fs.readFileSync(file,'utf8'));
        const key=kind+':'+record.prediction.marketId;
        if(seen.has(key))throw Error('Duplicate market/model in ledger: '+key);
        seen.add(key);
        const m=models[kind];m.records++;
        if(!record.observations.some(o=>o.githubRunEvent==='schedule'&&o.directKalshiActiveMarketCorroborated===true))
          m.missingPrecloseCorroboration++;
        if(record.prediction.side==='WAIT'){m.wait++;continue}
        m.directional++;
        if(!record.directlyRecheckedFinal){m.unresolved++;continue}
        m.directFinal++;
        if(record.prediction.side===record.directlyRecheckedFinal.winner)m.hits++;
        else m.misses++;
      }
    }
  }
  for(const m of Object.values(models)){
    if(m.records!==m.wait+m.directional||
       m.directional!==m.directFinal+m.unresolved||
       m.directFinal!==m.hits+m.misses)throw Error('Ledger count invariant violated');
  }
  if(inventory.fileCount!==models.early.records+models.late.records)
    throw Error('Ledger file inventory mismatch');
  return {
    version:'CASH_DURABLE_LEDGER_COVERAGE_AUDIT_V1',
    source:'SANITIZED_GITHUB_PUBLIC_EVIDENCE_BRANCH_ONLY',
    archivedRecords:inventory.fileCount,
    models,
    fullFrozenForecastDenominatorKnown:false,
    archivalCompletenessProven:false,
    observedSampleSelectionBiasPossible:true,
    reportedHitRateIsNotQualifiedAccuracy:true,
    independentlyQualifiedCount:0,
    ordersEnabled:false,
    actualFillsVerified:0,
    nextRequirement:'Join all frozen forecast commitments across every source session to scheduled pre-expiry witnesses, including missing captures, before evaluating a chronological holdout.'
  };
}
if(require.main===module){
  if(process.argv.length!==3)throw Error('Usage: node chronological-ledger-coverage.js LEDGER_ROOT');
  console.log(JSON.stringify(audit(process.argv[2]),null,2));
}
module.exports={audit};
