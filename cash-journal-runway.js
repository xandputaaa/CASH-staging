'use strict';
/**
 * An after-backup operational warning from TWO EXISTING self-reported research
 * exports. This is NOT a backup/restore certificate, an instruction to rotate,
 * nor an independently validated forecast or trading signal.
 *
 * Runs after the existing GitHub upload step. No network or writes to the
 * research collector, journal, archive, credentials or Railway service.
 */
const fs=require('node:fs');
const {assessDefaultLateCapacity}=require('./research-capacity');
const safeInt=x=>Number.isSafeInteger(x)&&x>=0;
function earlyStatus(early){
 const base={state:'SOURCE_UNAVAILABLE',frozen:null,remainingDefaultSlots:null,
  assumedDefaultLimit:320,sourceCountsSelfReported:true};
 if(early==null)return base;
 if(early.version!=='CASH_PROSPECTIVE_KALSHI_V1'||
   !['CASH_PROSPECTIVE_HASHED_SESSION_V1','CASH_PROSPECTIVE_REDACTED_COMMITMENTS_V1'].includes(early.format)||
   early.tradingAuthorized!==false||early.automatedOrdersEnabled!==false||
   early.qualifiedCount!==0||early.modelCalibrated!==false||
   early.independentlyTimeAttested!==false||
   ![early.records,early.pending,early.directional,early.waits].every(safeInt)||
   early.records>320||early.pending>early.records||
   early.directional+early.waits!==early.records||
   !Array.isArray(early.events)||early.events.length>640||
   early.events.filter(e=>e?.type==='FORECAST').length!==early.records||
   early.events.filter(e=>e?.type==='OUTCOME').length!==early.records-early.pending)
  throw Error('Invalid early research export');
 const left=320-early.records;
 return {...base,state:left===0?'FULL':left<=24?'CRITICAL':left<=32?'LOW':'HAS_HEADROOM',
  frozen:early.records,remainingDefaultSlots:left};
}
function lateStatus(late){
 const base={state:'SOURCE_UNAVAILABLE',frozen:null,remainingDefaultSlots:null,
  assumedDefaultLimit:160,sourceCountsSelfReported:true};
 if(late==null)return base;
 if(late.independentQualification!==0||late.independentlyTimeAttested!==false||
  late.calibrated!==false||late.canExecuteOrders!==false||
  late.realMoneyAuthorized!==false||!safeInt(late.pending)||
  !Array.isArray(late.events)||late.events.length>320||
  late.events.filter(e=>e?.type==='FORECAST').length!==late.records||
  late.events.filter(e=>e?.type==='OUTCOME').length!==late.records-late.pending)
  throw Error('Invalid late research export');
 const cap=assessDefaultLateCapacity(late);
 if(cap.estimatedRemainingFrozenMarketSlots===0&&late.records!==160)
  throw Error('Late research exceeds assumed source limit');
 const left=cap.estimatedRemainingFrozenMarketSlots;
 return {...base,state:left===0?'FULL':left<=24?'CRITICAL':left<=32?'LOW':'HAS_HEADROOM',
  frozen:late.records,remainingDefaultSlots:left};
}
function assessResearchJournalRunway({early,late}={}){
 const first=earlyStatus(early),second=lateStatus(late);
 return {
  version:'CASH_RESEARCH_JOURNAL_RUNWAY_WARNING_V1',
  checkedAt:new Date().toISOString(),
  early:first,late:second,
  currentServerCapacityVerified:false,
  exportIsCompleteServerBackup:false,
  offlineJournalPreflightComplete:false,
  sourceGeneratedEvidenceNotIndependent:true,
  independentlyQualifiedCount:0,ordersEnabled:false,
  safeToRotate:false,safeToRestartRailway:false,
  operatorAction:'PRESERVE_RUNNING_COLLECTOR_AND_AUDIT_OLD_RECORDS; NO_RESET_OR_RESTART',
  alert:second.state==='SOURCE_UNAVAILABLE'?'LATE_SOURCE_UNKNOWN':
   second.state==='FULL'?'LATE_JOURNAL_FULL':
   second.state==='CRITICAL'?'LATE_JOURNAL_CRITICAL':
   first.state==='FULL'?'EARLY_JOURNAL_FULL':'REVIEW_NORMAL_BACKUP_RUN',
  caveat:'Capacity is from checked-in code defaults (early 320, late 160) and self-reported exports, not a read of live configured capacity or an independently restorable archive. No auto-rotation, no orders.'
 };
}
function readOptional(file){
 if(!file||!fs.existsSync(file))return null;
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2621440)
  throw Error('Unsafe research export');
 return JSON.parse(fs.readFileSync(file,'utf8'));
}
function run(earlyFile,lateFile,{log=console.log}={}){
 const report=assessResearchJournalRunway({
  early:readOptional(earlyFile),late:readOptional(lateFile)});
 const left=report.late.remainingDefaultSlots;
 log('CASH_RESEARCH_RUNWAY_ALERT='+report.alert);
 log('CASH_RESEARCH_RUNWAY_LATE_FROZEN='+String(report.late.frozen));
 log('CASH_RESEARCH_RUNWAY_LATE_DEFAULT_REMAINING='+String(left));
 log('CASH_RESEARCH_RUNWAY_EARLY_STATE='+report.early.state);
 log('CASH_RESEARCH_RUNWAY_SAFE_TO_RESTART=false');
 log('CASH_RESEARCH_RUNWAY_QUALIFIED=0');
 log('CASH_RESEARCH_RUNWAY_ORDERS_ENABLED=false');
 if(report.late.state==='FULL'||report.late.state==='CRITICAL')
  log('::warning title=CASH BTC15 research journal at risk::Late research journal has '+left+
   ' assumed-default slots remaining. Preserve the running collector. Offline preflight and fresh approval required for any rollover.');
 else if(report.late.state==='SOURCE_UNAVAILABLE')
  log('::warning title=CASH BTC15 late export unavailable::Late journal capacity could not be read from this snapshot; this does not prove data loss or a safe restart.');
 if(report.early.state==='FULL')
  log('::warning title=CASH early research journal full::Early V3 journal has zero slots remaining. Never reset or restart to free capacity.');
 return report;
}
if(require.main===module){
 try{run(process.argv[2],process.argv[3]);}
 catch{
  console.error('::warning title=CASH BTC15 research runway unknown::The read-only capacity check rejected a malformed export; do not assume available journal slots.');
  process.exitCode=1;
 }
}
module.exports={earlyStatus,lateStatus,assessResearchJournalRunway,run};
