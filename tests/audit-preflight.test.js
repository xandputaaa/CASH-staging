'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createAuditPreflight}=require('../audit-preflight');
const {proposeSpotMomentum}=require('../spot-momentum');
const t=Date.parse('2026-11-16T21:00:00Z');
const iso=x=>new Date(x).toISOString();
function sampleCandidate(){
 const samples=[-100000,-90000,-75000,-60000,-45000,-30000,-15000,0].map((dt,i)=>({
  time:iso(t+dt),price:85100+i*4,source:'Kraken BTC/USD'
 }));
 return {...proposeSpotMomentum({status:'live',source:'Kraken BTC/USD',
  fetchedAt:iso(t),history:samples},t),predictedContractSide:'YES'};
}
function session({candidate=sampleCandidate(),evidenceType='CAPTURE'}={}){
 const payload={id:'Kalshi:KXBTC15M-26NOV161500-00',marketId:'KXBTC15M-26NOV161500-00',
  venue:'Kalshi',serverCapturedAt:iso(t),endTime:iso(t+180000),spotCandidate:candidate};
 const body={sequence:1,type:evidenceType,recordedAt:iso(t),payload,previousHash:'GENESIS'};
 const hash=crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
 return {mode:'PUBLIC_MARKET_FAVORED_ASK_V1',storageMode:'VOLATILE_SERVER_SESSION',
  qualifyingProspectiveContracts:0,independentForecastModel:false,
  bootAt:iso(t),events:[{...body,hash}],headHash:hash,
  capacity:{state:'AVAILABLE',safeNewCaptures:4}};
}
test('preflight generates deterministic digest for reproducible unqualified candidate',()=>{
 const exportData=session(),a=createAuditPreflight(exportData,{now:t+200000});
 const b=createAuditPreflight(exportData,{now:t+400000});
 assert.equal(a.commitments.total,1);
 assert.equal(a.counts.SAMPLE_BACKED_COMMITMENT,1);
 assert.equal(a.commitments.listed[0].preAttestationCommitmentSha256,
  b.commitments.listed[0].preAttestationCommitmentSha256);
 assert.match(a.commitments.listed[0].preAttestationCommitmentSha256,/^[0-9a-f]{64}$/);
 assert.equal(a.commitments.listed[0].independentlyTimeAttested,false);
 assert.equal(a.independentVerification.qualifyingProspectiveContracts,0);
 assert.equal(a.independentVerification.timeWitnessConfigured,false);
 assert.equal(a.independentVerification.realOrdersEnabled,false);
});
test('missing and legacy candidates never become independent validation records',()=>{
 const noCandidate=createAuditPreflight(session({candidate:null}));
 assert.equal(noCandidate.counts.NO_CANDIDATE,1);
 assert.equal(noCandidate.commitments.total,0);
 const legacy=sampleCandidate();delete legacy.sampleWindow;delete legacy.sampleWindowSha256;
 const older=createAuditPreflight(session({candidate:legacy}));
 assert.equal(older.counts.LEGACY_NO_SOURCE_WINDOW,1);
 assert.equal(older.commitments.total,0);
});
test('forged sample hash, invalid lead, and modified chain are rejected or excluded',()=>{
 const fake=sampleCandidate();fake.sampleWindow[1].price+=1;
 assert.equal(createAuditPreflight(session({candidate:fake})).counts.INVALID_CANDIDATE,1);
 const short=session();short.events[0].payload.endTime=iso(t+30000);
 const {hash,...body}=short.events[0];
 short.events[0].hash=crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
 short.headHash=short.events[0].hash;
 assert.equal(createAuditPreflight(short).counts.INVALID_CANDIDATE,1);
 const tampered=session();tampered.events[0].payload.spotCandidate.predictedContractSide='NO';
 assert.throws(()=>createAuditPreflight(tampered),/chain verification failed/);
});
test('preflight fails closed when any record claims qualification or digest is inconsistent',()=>{
 assert.throws(()=>createAuditPreflight({...session(),qualifyingProspectiveContracts:1}),/falsely qualified/);
 assert.throws(()=>createAuditPreflight({...session(),headHash:'0'.repeat(64)}),/Audit head/);
 assert.throws(()=>createAuditPreflight({...session(),storageMode:'VERIFIED'}),/Unsupported/);
});
