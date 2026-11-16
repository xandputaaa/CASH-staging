'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {assessCognition}=require('../cash-cognition');
const fixed=Date.parse('2026-11-16T21:00:00Z');
function healthy(){
 return {diagnostics:{mode:'SIMULATION_ONLY',dataStatus:'LIVE',
  feeds:{spot:{state:'LIVE'},Kalshi:{state:'LIVE'},Polymarket:{state:'LIVE'}},
  monitor:{state:'ACTIVE',collectionState:'COLLECTING'},
  validation:{qualifyingProspectiveContracts:0,realOrdersEnabled:false,
   storageMode:'VOLATILE_SERVER_SESSION',auditCapacity:{state:'AVAILABLE'}}},
 evaluation:{report:'CASH_EXPERIMENTAL_SPOT_EVALUATION_V1',
  mode:'DESCRIPTIVE_SESSION_ONLY',total:{scored:40,overdueWithoutOutcome:0,missingSettlementEvidence:0},
  qualification:{realOrdersEnabled:false,prospectiveIndependentAttested:0}}};
}
test('healthy cached feeds still abstain until independent forecasting validation exists',()=>{
 const result=assessCognition({...healthy(),now:fixed});
 assert.equal(result.state,'OBSERVING');
 assert.equal(result.executionDecision,'ABSTAIN_FROM_REAL_MONEY_TRADING');
 assert.equal(result.tradingAllowed,false);
 assert.equal(result.automaticOrdersEnabled,false);
 assert.equal(result.autonomousModelUpdatesEnabled,false);
 assert.equal(result.calibratedConfidence,null);
 assert.equal(result.qualifyingProspectiveContracts,0);
 assert.equal(result.nature,'DETERMINISTIC_METACOGNITION_NOT_SENTIENCE');
 assert.equal(result.consciousness,'NOT_ESTABLISHED_OR_TESTABLE_BY_THIS_SYSTEM');
 assert.ok(result.attention.some(x=>x.id==='NONPERSISTENT_AUDIT'));
});
test('stale collection dominates a seemingly live process',()=>{
 const v=healthy();
 v.diagnostics.monitor.state='STALE';
 v.diagnostics.monitor.collectionState='STALLED';
 const result=assessCognition({...v,now:fixed});
 assert.equal(result.state,'COLLECTION_STALLED');
 assert.ok(result.attention.some(x=>x.id==='SCANNER_STALLED'));
 assert.equal(result.tradingAllowed,false);
});
test('blocked audit capacity prevents calling evidence collection healthy',()=>{
 const v=healthy();
 v.diagnostics.validation.auditCapacity.state='CAPTURE_BLOCKED';
 const result=assessCognition({...v,now:fixed});
 assert.equal(result.state,'AUDIT_BLOCKED');
 assert.ok(result.attention.some(x=>x.id==='JOURNAL_FULL'));
 assert.match(result.attention.find(x=>x.id==='JOURNAL_FULL').detail,/Export the session/);
});
test('partial, missing and offline feed states never become evidence of accuracy',()=>{
 const v=healthy();
 v.diagnostics.feeds.Polymarket.state='PARTIAL';
 const partial=assessCognition({...v,now:fixed});
 assert.equal(partial.state,'DATA_DEGRADED');
 assert.ok(partial.attention.some(x=>x.id==='PARTIAL_FEEDS'));
 v.diagnostics.dataStatus='OFFLINE';
 for(const key of Object.keys(v.diagnostics.feeds))v.diagnostics.feeds[key].state='OFFLINE';
 const offline=assessCognition({...v,now:fixed});
 assert.equal(offline.state,'DATA_OFFLINE');
 assert.equal(offline.independentAccuracyVerified,false);
 assert.equal(offline.executionDecision,'ABSTAIN_FROM_REAL_MONEY_TRADING');
});
test('missing evidence report is explicitly unknown rather than considered a win',()=>{
 const v=healthy();
 v.evaluation={};
 const r=assessCognition({...v,now:fixed});
 assert.equal(r.state,'EVIDENCE_UNAVAILABLE');
 assert.equal(r.inputs.evaluationRecords,0);
 assert.ok(r.attention.some(x=>x.id==='EVALUATION_UNKNOWN'));
 assert.equal(r.calibratedConfidence,null);
});
test('pending and rejected settlement evidence is surfaced as uncertainty',()=>{
 const v=healthy();
 v.evaluation.total.overdueWithoutOutcome=5;
 v.evaluation.total.missingSettlementEvidence=2;
 const r=assessCognition({...v,now:fixed});
 assert.equal(r.inputs.overdueOutcomes,5);
 assert.equal(r.inputs.insufficientSettlementEvidence,2);
 assert.ok(r.attention.some(x=>x.id==='WEAK_SETTLEMENT_EVIDENCE'));
 assert.ok(r.attention.some(x=>x.id==='OVERDUE_OUTCOMES'));
});
test('never invent consciousness or allow a self-rewriting or order-execution capability',()=>{
 const r=assessCognition({now:fixed});
 assert.equal(r.tradingAllowed,false);
 assert.equal(r.automaticOrdersEnabled,false);
 assert.equal(r.autonomousModelUpdatesEnabled,false);
 assert.equal(r.qualifyingProspectiveContracts,0);
 assert.equal(r.selfAssessment.reasoningKind,'EXPLAINABLE_RULES_OVER_CACHED_FACTS');
 assert.ok(r.selfAssessment.limitations.some(x=>/subjective experience/i.test(x)));
 assert.ok(r.attention.some(x=>x.id==='NOT_VALIDATED'));
});
