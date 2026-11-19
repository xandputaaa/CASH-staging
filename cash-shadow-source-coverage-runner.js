'use strict';
const fs=require('node:fs'),path=require('node:path');
const {getPublicSnapshot,URL}=require('./cash-shadow-public-observer-runner');
const {sourceWitnessCoverage}=require('./cash-shadow-source-witness-coverage');
async function runCoverage({
 archiveRoot='witness-store',
 outFile='audit/shadow-source-observation-coverage.json',
 fetchImpl=fetch,clock=()=>Date.now()
}={}){
 let source=null,sha=null,error=null;
 try{
  const fetched=await getPublicSnapshot(URL,{fetchImpl});
  source=fetched.snapshot;sha=fetched.sha256;
 }catch{error='PUBLIC_SHADOW_SOURCE_UNAVAILABLE'}
 // The output cannot certify the source clock; it is read AFTER fetch.
 const at=clock();
 const report=sourceWitnessCoverage({archiveRoot,sourceSnapshot:source,asOfMs:at});
 report.sourcePublicExportSha256=sha;
 report.sourceFetchStatus=error===null?'FETCHED_UNVERIFIED':'UNAVAILABLE';
 const dest=path.resolve(outFile);
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.writeFileSync(dest,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log('CASH_SHADOW_COLLECTION_COVERAGE='+report.status);
 console.log('CASH_SHADOW_COLLECTION_SOURCE_RECORDS='+report.sourceCommittedContracts);
 console.log('CASH_SHADOW_COLLECTION_EXTERNALLY_WITNESSED='+report.externalWitnessUniqueContracts);
 console.log('CASH_SHADOW_COLLECTION_SOURCE_ONLY='+report.sourceOnlyNotExternallyWitnessed);
 console.log('CASH_SHADOW_COLLECTION_SOURCE_ONLY_YES_NO='+report.sourceOnlyDirectionalNotExternallyWitnessed);
 console.log('CASH_SHADOW_COLLECTION_UNWITNESSED_PAST_CLOSE='+report.expiredSourceOnly);
 console.log('CASH_SHADOW_COLLECTION_UNWITNESSED_OPEN='+report.stillOpenSourceOnly);
 console.log('CASH_SHADOW_COLLECTION_QUALIFIED=0');
 console.log('CASH_SHADOW_COLLECTION_ORDERS=false');
 return report;
}
if(require.main===module)runCoverage().catch(e=>{
 console.error('CASH shadow coverage audit failed closed: '+String(e.message).replace(/[^a-zA-Z0-9 _:-]/g,''));
 process.exitCode=1;
});
module.exports={runCoverage};
