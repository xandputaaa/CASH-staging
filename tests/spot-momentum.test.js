'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {proposeSpotMomentum,toContractSide,isValidSpotCandidate}=require('../spot-momentum');
const {createShadowMonitor}=require('../shadow-monitor');
function samples(now,{source='Kraken BTC/USD',change=14,age=1000}={}){
  const end=now-age;
  const history=[-100000,-90000,-75000,-60000,-45000,-30000,-15000,0].map((offset,i)=>({
    time:new Date(end+offset).toISOString(),price:85600+(change*i/7),source
  }));
  return {status:'live',source,history,fetchedAt:new Date(end).toISOString(),price:history[history.length-1].price};
}
function market(now,venue){
  return venue==='Kalshi'?{venue:'Kalshi',status:'live',marketId:'KXBTC15M-26NOV161000-00',
    fetchedAt:new Date(now).toISOString(),endTime:new Date(now+180000).toISOString(),yesAsk:.41,noAsk:.63}:
    {venue:'Polymarket',status:'live',marketId:'0x'+'a'.repeat(64),
     slug:'btc-updown-5m-'+Math.floor(now/300000)*300,
     fetchedAt:new Date(now).toISOString(),endTime:new Date(now+180000).toISOString(),upAsk:.39,downAsk:.64};
}
test('candidate independently uses chronological single-exchange 90s samples, never venue odds',()=>{
 const now=Date.now(),result=proposeSpotMomentum(samples(now),now);
 assert.equal(result.name,'SPOT_MOMENTUM_90S_V1');
 assert.equal(result.predictedDirection,'UP');
 assert.equal(result.source,'Kraken BTC/USD');
 assert.ok(result.lookbackSeconds>=65&&result.lookbackSeconds<=110);
 assert.equal(result.calibratedProbability,null);
 assert.equal(toContractSide('Kalshi',result.predictedDirection),'YES');
 assert.equal(toContractSide('Polymarket',result.predictedDirection),'UP');
 assert.ok(!JSON.stringify(result).includes('marketId'));
});
test('negative spot change proposes opposite direction with no invented confidence',()=>{
 const now=Date.now(),out=proposeSpotMomentum(samples(now,{change:-20}),now);
 assert.equal(out.predictedDirection,'DOWN');assert.equal(toContractSide('Kalshi',out.predictedDirection),'NO');
 assert.equal(out.calibratedProbability,null);
});
test('stale or missing spot window does not yield a candidate',()=>{
 const now=Date.now(),a=samples(now);
 assert.equal(proposeSpotMomentum({...a,status:'stale'},now),null);
 assert.equal(proposeSpotMomentum(samples(now,{age:30000}),now),null);
 assert.equal(proposeSpotMomentum({...a,history:a.history.slice(-3)},now),null);
 assert.equal(proposeSpotMomentum({...a,history:a.history.map(x=>({...x,time:new Date(now+30000).toISOString()}))},now),null);
});
test('untrustworthy mixed-source, disorder, or nearly flat spot path refuses a call',()=>{
 const now=Date.now(),a=samples(now);
 const mixed=a.history.map(x=>({...x}));
 mixed[4].source='Coinbase Exchange BTC-USD';
 assert.equal(proposeSpotMomentum({...a,history:mixed},now),null);
 const disorder=a.history.map(x=>({...x}));disorder[5].time=disorder[2].time;
 assert.equal(proposeSpotMomentum({...a,history:disorder},now),null);
 assert.equal(proposeSpotMomentum(samples(now,{change:0.5}),now),null);
});
test('spot candidate semantic verifier rejects fabricated changes and future timestamp',()=>{
 const now=Date.now(),out=proposeSpotMomentum(samples(now),now);
 const value={...out,predictedContractSide:'YES'};
 assert.equal(isValidSpotCandidate(value,'Kalshi',now),true);
 assert.equal(isValidSpotCandidate({...value,deltaUsd:99999},'Kalshi',now),false);
 assert.equal(isValidSpotCandidate({...value,predictedContractSide:'NO'},'Kalshi',now),false);
 assert.equal(isValidSpotCandidate({...value,calibratedProbability:.99},'Kalshi',now),false);
 assert.equal(isValidSpotCandidate({...value,latestAt:new Date(now+20000).toISOString()},'Kalshi',now),false);
});
test('shadow watcher records independent side even when market-price favorite disagrees',async()=>{
 const now=Date.now();let t=now,winner=null;
 const monitor=createShadowMonitor({
  clock:()=>t,spot:{view:()=>samples(t,{change:14})},
  quotes:{query:async venue=>market(now,venue)},
  results:{lookup:async info=>{
   if(!winner||info.venue!=='Kalshi')return {...info,status:'pending'};
   const evidence={venue:'Kalshi',ticker:info.marketId,status:'settled',result:'yes',is_provisional:false};
   return {...info,status:'verified',winner,source:'Kalshi public market result',
    checkedAt:new Date(t).toISOString(),firstObservedAt:new Date(t-21000).toISOString(),
    confirmationCount:2,evidenceSnapshot:evidence,
    evidenceSha256:require('node:crypto').createHash('sha256').update(JSON.stringify(evidence)).digest('hex'),
    evidenceSourceUrl:'https://external-api.kalshi.com/trade-api/v2/markets/'+info.marketId};
  }}
 });
 await monitor.scan();let snap=monitor.snapshot();
 assert.equal(snap.spotCandidateObservations,2);
 assert.equal(snap.spotCandidateSettled,0);
 assert.equal(snap.spotCandidateQualified,false);
 assert.equal(snap.qualifyingProspectiveContracts,0);
 assert.equal(snap.independentForecastModel,false);
 assert.ok(snap.recent.every(x=>x.spotCandidate?.predictedDirection==='UP'));
 assert.ok(snap.recent.every(x=>x.baselineSide==='NO'||x.baselineSide==='DOWN'));
 t=now+220000;winner='YES';await monitor.resolvePending();
 snap=monitor.snapshot();
 assert.equal(snap.spotCandidateSettled,1);
 assert.equal(snap.spotCandidateCorrect,1);
 assert.equal(snap.spotCandidateAccuracy,1);
 assert.equal(snap.qualifyingProspectiveContracts,0);
});
test('missing early spot history still records market baseline but no independent candidate',async()=>{
 const now=Date.now(),a=samples(now);
 const monitor=createShadowMonitor({clock:()=>now,spot:{view:()=>({...a,history:a.history.slice(-2)})},
  quotes:{query:async venue=>market(now,venue)},results:{lookup:async()=>({status:'pending'})}});
 await monitor.scan();const snap=monitor.snapshot();
 assert.equal(snap.observed,2);assert.equal(snap.spotCandidateObservations,0);
 assert.equal(snap.spotCandidateAccuracy,null);
});

test('spot candidates attach reproducible observed sample windows, never market odds',()=>{
 const now=Date.now(),snap=samples(now),candidate=proposeSpotMomentum(snap,now);
 assert.ok(Array.isArray(candidate.sampleWindow));
 assert.ok(candidate.sampleWindow.length>=4);
 assert.equal(candidate.sampleWindow[0].time,candidate.referenceAt);
 assert.equal(candidate.sampleWindow.at(-1).time,candidate.latestAt);
 assert.equal(isValidSpotCandidate({...candidate,predictedContractSide:'YES'},'Kalshi',now),true);
 assert.equal(candidate.sampleWindow.some(x=>'marketId' in x||'yesAsk' in x),false);
 assert.match(candidate.sampleWindowSha256,/^[0-9a-f]{64}$/);
});
test('replay rejects fabricated spot sample windows and reduced thresholds even with valid summary',()=>{
 const now=Date.now(),base={...proposeSpotMomentum(samples(now),now),predictedContractSide:'YES'};
 assert.equal(isValidSpotCandidate({...base,thresholdUsd:0.001},'Kalshi',now),false);
 const tampered={...base,sampleWindow:base.sampleWindow.map(x=>({...x}))};
 tampered.sampleWindow[1].price+=100;
 assert.equal(isValidSpotCandidate(tampered,'Kalshi',now),false);
 const wrongTime={...base,sampleWindow:base.sampleWindow.map(x=>({...x}))};
 wrongTime.sampleWindow[2].time=wrongTime.sampleWindow[1].time;
 assert.equal(isValidSpotCandidate(wrongTime,'Kalshi',now),false);
 assert.equal(isValidSpotCandidate({...base,sampleWindow:null},'Kalshi',now),false);
 assert.equal(isValidSpotCandidate({...base,sampleWindowSha256:'0'.repeat(64)},'Kalshi',now),false);
});
test('spot assessor provides explicit non-call reasons without assigning a probability',()=>{
 const {assessSpotMomentum}=require('../spot-momentum'),now=Date.now();
 assert.equal(assessSpotMomentum(null,now).reason,'SPOT_UNAVAILABLE');
 assert.equal(assessSpotMomentum(samples(now,{age:30000}),now).reason,'STALE_SPOT');
 assert.equal(assessSpotMomentum(samples(now,{change:0.1}),now).reason,'MOVEMENT_TOO_SMALL');
 assert.equal(assessSpotMomentum(samples(now),now).reason,'CANDIDATE');
 assert.equal(assessSpotMomentum(samples(now),now).candidate.calibratedProbability,null);
});
test('missing source window remains identifiable as legacy but never qualifies',()=>{
 const now=Date.now(),candidate={...proposeSpotMomentum(samples(now),now),predictedContractSide:'YES'};
 delete candidate.sampleWindow;
 delete candidate.sampleWindowSha256;
 assert.equal(isValidSpotCandidate(candidate,'Kalshi',now),true);
 const monitor=createShadowMonitor({clock:()=>now,
  quotes:{query:async venue=>market(now,venue)},
  results:{lookup:async()=>({status:'pending'})},
  spot:{view:()=>samples(now)}});
 return monitor.scan().then(()=>{
  const state=monitor.snapshot();
  assert.equal(state.spotEvidence.sampleBackedCandidates,2);
  assert.equal(state.spotEvidence.legacyWithoutSampleWindow,0);
  assert.equal(state.spotEvidence.checks,1);
  assert.equal(state.spotEvidence.candidates,1);
  assert.equal(state.qualifyingProspectiveContracts,0);
 });
});
