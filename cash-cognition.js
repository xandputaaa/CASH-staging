'use strict';
/*
 * CASH COGNITIVE CORE V1 -- deterministic metacognitive read-only assessment.
 * This is NOT sentience, a language model, a trading predictor, a self-trained
 * model, a confidence estimator, or authorization to place trades.
 * It reads cached diagnostics and experimental evaluation only.
 */
const VALID_FEEDS=new Set(['LIVE','PARTIAL','STALE','OFFLINE']);
const known=(x,choices)=>choices.includes(x)?x:'UNKNOWN';
function assessCognition({diagnostics={},evaluation={},now=Date.now()}={}){
 if(!Number.isFinite(now))throw Error('Invalid cognition clock');
 const feeds=diagnostics.feeds||{};
 const feeder={};
 for(const [name,key] of [['Spot','spot'],['Kalshi','Kalshi'],['Polymarket','Polymarket']]){
  const state=feeds[key]?.state;
  feeder[name]=VALID_FEEDS.has(state)?state:'UNKNOWN';
 }
 const monitor=known(diagnostics.monitor?.state,['ACTIVE','STALE','STARTING']);
 const coverage=known(diagnostics.monitor?.collectionState,
  ['COLLECTING','DEGRADED','NO_ELIGIBLE_QUOTES','STALLED','NOT_STARTED']);
 const capacity=known(diagnostics.validation?.auditCapacity?.state,
  ['AVAILABLE','NEAR_LIMIT','CAPTURE_BLOCKED']);
 const storage=known(diagnostics.validation?.storageMode,
  ['VOLATILE_SERVER_SESSION','FILESYSTEM_JOURNAL_UNVERIFIED']);
 const overall=known(diagnostics.dataStatus,['LIVE','DEGRADED','OFFLINE']);
 const report=Number(evaluation.total?.scored);
 const validEval=evaluation.report==='CASH_EXPERIMENTAL_SPOT_EVALUATION_V1'&&
  evaluation.mode==='DESCRIPTIVE_SESSION_ONLY'&&
  evaluation.qualification?.realOrdersEnabled===false&&
  evaluation.qualification?.prospectiveIndependentAttested===0&&
  Number.isSafeInteger(report)&&report>=0;
 const evaluated=validEval?report:0;
 const missed=validEval?Number(evaluation.total?.overdueWithoutOutcome)||0:0;
 const insufficient=validEval?Number(evaluation.total?.missingSettlementEvidence)||0:0;
 const notes=[];
 function note(priority,id,title,detail){
  notes.push({priority,id,title,detail});
 }
 if(overall==='OFFLINE'||Object.values(feeder).every(x=>!['LIVE','PARTIAL'].includes(x)))
  note(0,'FEEDS_UNAVAILABLE','Market references unavailable',
   'Do not infer current market conditions from offline or missing public quotes.');
 else if(Object.values(feeder).some(x=>x!=='LIVE'))
  note(1,'PARTIAL_FEEDS','Some market references are incomplete',
   'An incomplete or stale quote is not a usable signal. Inspect individual source states.');
 if(monitor==='STALE'||coverage==='STALLED')
  note(0,'SCANNER_STALLED','Observation process is stale',
   'Most recent scanner completion is too old; review Railway and cached observations.');
 else if(monitor==='STARTING'||coverage==='NOT_STARTED'||coverage==='UNKNOWN')
  note(2,'COLLECTION_UNCONFIRMED','Collection not demonstrated',
   'A running server does not establish eligible pre-expiry market capture.');
 else if(coverage==='NO_ELIGIBLE_QUOTES')
  note(1,'NO_ELIGIBLE_QUOTES','No eligible market quotes in last scan',
   'Scanner completion is not proof of good source data.');
 else if(coverage==='DEGRADED')
  note(2,'DEGRADED_COLLECTION','Only one venue had eligible quotes',
   'Check source completeness and current contract identifiers before further evaluation.');
 if(capacity==='CAPTURE_BLOCKED')
  note(0,'JOURNAL_FULL','Audit journal cannot safely capture new markets',
   'Preserved settlement slots take priority. Export the session; do not assume scanning equals collecting.');
 else if(capacity==='NEAR_LIMIT')
  note(2,'JOURNAL_NEAR_LIMIT','Audit journal nearing its capacity',
   'Prepare an export and plan approved durable storage.');
 if(storage==='VOLATILE_SERVER_SESSION')
  note(1,'NONPERSISTENT_AUDIT','Forecast observations disappear on server restart',
   'Local browser exports do not constitute durable, independently attested records.');
 else if(storage!=='FILESYSTEM_JOURNAL_UNVERIFIED')
  note(0,'AUDIT_STORAGE_UNKNOWN','Audit storage could not be verified',
   'Do not treat the audit as durable.');
 else
  note(2,'AUDIT_NOT_ATTESTED','Filesystem audit needs independent verification',
   'A hash chain alone cannot prove historical timestamps.');
 if(!validEval)
  note(0,'EVALUATION_UNKNOWN','Experimental evaluation unavailable',
   'No performance or outcome coverage may be inferred until evidence is accessible.');
 else{
  if(evaluated<100)
   note(3,'SMALL_EVALUATION_SAMPLE','Experimental settled sample is limited',
    'Only '+evaluated+' internally evidence-checked experimental candidates; not independently validated.');
  if(missed>0)
   note(2,'OVERDUE_OUTCOMES','Some expired contracts lack outcomes',
    missed+' experimental candidate outcomes are overdue in the current server session.');
  if(insufficient>0)
   note(1,'WEAK_SETTLEMENT_EVIDENCE','Some apparent results lack acceptable evidence',
    insufficient+' cases are excluded from exploratory scoring.');
 }
 // Independent qualification is deliberately impossible in this release.
 note(0,'NOT_VALIDATED','Predictive accuracy has not passed independent validation',
  '0 / 100 independently time-attested, prospectively settled model forecasts. No real orders.');
 notes.sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
 const critical=notes.filter(x=>x.priority===0).length;
 const state=overall==='OFFLINE'?'DATA_OFFLINE':
  monitor==='STALE'||coverage==='STALLED'?'COLLECTION_STALLED':
  capacity==='CAPTURE_BLOCKED'?'AUDIT_BLOCKED':
  !validEval?'EVIDENCE_UNAVAILABLE':
  Object.values(feeder).some(x=>x!=='LIVE')||coverage!=='COLLECTING'?'DATA_DEGRADED':
  'OBSERVING';
 const primary=notes[0]||null;
 const steps=notes.filter(n=>n.id!=='NOT_VALIDATED').slice(0,3)
   .map(x=>({id:x.id,step:x.detail}));
 if(steps.length===0)steps.push({id:'DESCRIPTIVE_MONITOR',
  step:'Continue read-only monitoring and audit design; the independent validation gate is still closed.'});
 return {
  name:'CASH_COGNITIVE_CORE_V1',generatedAt:new Date(now).toISOString(),
  nature:'DETERMINISTIC_METACOGNITION_NOT_SENTIENCE',
  consciousness:'NOT_ESTABLISHED_OR_TESTABLE_BY_THIS_SYSTEM',
  state,executionDecision:'ABSTAIN_FROM_REAL_MONEY_TRADING',
  tradingAllowed:false,automaticOrdersEnabled:false,
  autonomousModelUpdatesEnabled:false,calibratedConfidence:null,
  independentAccuracyVerified:false,qualifyingProspectiveContracts:0,
  inputs:{marketData:overall,feeds:feeder,monitor,collection:coverage,
   auditCapacity:capacity,storage,evaluationRecords:evaluated,
   overdueOutcomes:missed,insufficientSettlementEvidence:insufficient},
  selfAssessment:{issues:notes.length,criticalIssues:critical,
   mainConstraint:primary?.title||'Independent evidence incomplete',
   reasoningKind:'EXPLAINABLE_RULES_OVER_CACHED_FACTS',
   limitations:['No subjective experience is claimed',
    'Market feeds and evaluation can contain delays or errors',
    'Self-observation is not independent verification',
    'No model accuracy claims, algorithm changes, or live trades']},
  attention:notes,proposedSafeSteps:steps,
  objective:'Improve evidence quality and decisions to abstain, not simulated consciousness',
  disclaimer:'This is a transparent rules-based self-check. It does not think, feel, self-reprogram, or make qualified financial predictions.'
 };
}
module.exports={assessCognition};
