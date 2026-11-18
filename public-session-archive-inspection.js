'use strict';
/*
 * Read-only inventory of CASH's unverified public session archive.
 * No GitHub API, Railway calls, orders, calibration or data mutation.
 * Validates EVERY archived record with the strict source-archive schema
 * before reporting any counts. This is not independent forecast proof.
 */
const fs=require('node:fs'),path=require('node:path');
const {scanArchive}=require('./public-session-archive');
const MODELS={early:{folder:'early-v3'},late:{folder:'late-v1'}};

function inspectPublicSessionArchive(root){
  const base=path.resolve(root);
  const verified=scanArchive(base); // fail closed on any corrupt/unsafe entry
  const models={};
  const backupRuns=new Set();
  let crossSessionMarketDuplicates=0;
  for(const [name,{folder}] of Object.entries(MODELS)){
    const dir=path.join(base,'public-sessions',folder);
    const result={modelFolder:folder,sessions:0,forecastRecords:0,
      directional:0,waits:0,sourceReportedOutcomes:0,
      unresolvedInArchivedCopies:0,uniqueMarketIds:0,
      acrossSessionDuplicates:0,firstSnapshotRunIds:[],
      outcomeFirstSeenRunIds:[]};
    const seenMarkets=new Set(),firstRunIds=new Set(),outcomeRunIds=new Set();
    if(fs.existsSync(dir)){
      for(const sessionId of fs.readdirSync(dir).sort()){
        const sessionDir=path.join(dir,sessionId);
        if(!fs.statSync(sessionDir).isDirectory())
          throw Error('Unexpected archive session path');
        result.sessions++;
        for(const filename of fs.readdirSync(sessionDir).sort()){
          const record=JSON.parse(fs.readFileSync(path.join(sessionDir,filename),'utf8'));
          result.forecastRecords++;
          if(record.prediction.side==='WAIT')result.waits++;
          else result.directional++;
          const market=record.prediction.marketId;
          if(seenMarkets.has(market)){
            result.acrossSessionDuplicates++;
            crossSessionMarketDuplicates++;
          }else seenMarkets.add(market);
          firstRunIds.add(record.firstReadOnlyBackup.runId);
          backupRuns.add(record.firstReadOnlyBackup.runId);
          if(record.outcome){
            result.sourceReportedOutcomes++;
            outcomeRunIds.add(record.outcome.firstSeenBackupRunId);
            backupRuns.add(record.outcome.firstSeenBackupRunId);
          }else result.unresolvedInArchivedCopies++;
        }
      }
    }
    result.uniqueMarketIds=seenMarkets.size;
    result.firstSnapshotRunIds=[...firstRunIds].sort();
    result.outcomeFirstSeenRunIds=[...outcomeRunIds].sort();
    models[name]=result;
  }
  const count=models.early.forecastRecords+models.late.forecastRecords;
  const outcomes=models.early.sourceReportedOutcomes+models.late.sourceReportedOutcomes;
  if(count!==verified.fileCount||outcomes!==verified.internallyRecordedOutcomes||
     models.early.waits+models.late.waits!==verified.waits||
     models.early.directional+models.late.directional!==verified.directional)
    throw Error('Archived record inventory conflicts with strict validator');
  return {
    version:'CASH_PUBLIC_SELF_REPORTED_SESSION_ARCHIVE_INSPECTION_V1',
    status:count?'UNVERIFIED_PUBLIC_SESSION_RECORDS_PRESENT':'NO_SCHEDULED_SESSION_DATA_COMMIT_VERIFIED',
    models,forecastRecordFiles:count,sourceReportedOutcomes:outcomes,
    pendingOutcomesInArchivedCopies:count-outcomes,
    crossSessionMarketDuplicates,
    githubSnapshotRunIdsReferenced:[...backupRuns].sort(),
    externallyWitnessedPreExpiryCount:null,
    independentQualifiedCount:0,actualFillsVerified:0,ordersEnabled:false,
    caveat:'These are the source server’s self-reported public forecast commitments and later self-reported results. Neither GitHub pre-expiry witnessing nor public Kalshi settlement confirmation is proved here. An unresolved archive copy does not establish a presently unsettled contract. This is not evidence of execution, edge, or independent qualification.'
  };
}

if(require.main===module){
  const root=process.argv[2];
  if(!root)throw Error('Usage: node public-session-archive-inspection.js ARCHIVE_ROOT');
  const report=inspectPublicSessionArchive(root);
  console.log('CASH_SESSION_ARCHIVE_INSPECTION_STATUS='+report.status);
  console.log('CASH_SESSION_ARCHIVE_FORECAST_FILES='+report.forecastRecordFiles);
  console.log('CASH_SESSION_ARCHIVE_OUTCOMES_SELF_REPORTED='+report.sourceReportedOutcomes);
  console.log('CASH_SESSION_ARCHIVE_PENDING_IN_COPIES='+report.pendingOutcomesInArchivedCopies);
  console.log('CASH_SESSION_ARCHIVE_MODEL_SESSIONS_EARLY='+report.models.early.sessions);
  console.log('CASH_SESSION_ARCHIVE_MODEL_SESSIONS_LATE='+report.models.late.sessions);
  console.log('CASH_SESSION_ARCHIVE_CROSS_SESSION_DUPLICATES='+report.crossSessionMarketDuplicates);
  console.log('CASH_SESSION_ARCHIVE_INDEPENDENT_QUALIFIED=0');
  console.log('CASH_SESSION_ARCHIVE_ORDERS_ENABLED=false');
  console.log(JSON.stringify(report,null,2));
}
module.exports={inspectPublicSessionArchive};
