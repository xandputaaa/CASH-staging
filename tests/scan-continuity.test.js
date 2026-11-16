'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {classifyQuote,createScanContinuity}=require('../scan-continuity');
const now=Date.parse('2026-11-16T22:00:00Z');
const kal={venue:'Kalshi',status:'live',marketId:'KXBTC15M-26NOV161500-00',
 fetchedAt:new Date(now-1000).toISOString(),endTime:new Date(now+120000).toISOString()};
const poly={venue:'Polymarket',status:'live',marketId:'0x'+'a'.repeat(64),slug:'btc-updown-5m-1794866400',
 fetchedAt:new Date(now-1000).toISOString(),endTime:new Date(now+120000).toISOString()};
test('eligible full quotes require valid ids, freshness, baseline and pre-expiry lead',()=>{
 assert.equal(classifyQuote('Kalshi',kal,now,60000,true),'ELIGIBLE');
 assert.equal(classifyQuote('Polymarket',poly,now,60000,true),'ELIGIBLE');
 assert.equal(classifyQuote('Kalshi',{...kal,marketId:'wrong'},now,60000,true),'INVALID');
 assert.equal(classifyQuote('Kalshi',{...kal,fetchedAt:new Date(now-25000).toISOString()},now,60000,true),'STALE');
 assert.equal(classifyQuote('Polymarket',{...poly,endTime:new Date(now+1000).toISOString()},now,60000,true),'WINDOW_CLOSING');
 assert.equal(classifyQuote('Kalshi',{...kal,status:'partial'},now,60000,true),'PARTIAL');
 assert.equal(classifyQuote('Kalshi',kal,now,60000,false),'NO_BASELINE');
 assert.equal(classifyQuote('Kalshi',null,now,60000,false),'OFFLINE');
});
test('completed scans with zero eligible quotes are not labeled as collecting',()=>{
 let time=now;
 const q=createScanContinuity({clock:()=>time});
 assert.equal(q.snapshot().state,'NOT_STARTED');
 q.record({startedMs:time,finishedMs:time,statuses:{Kalshi:'OFFLINE',Polymarket:'PARTIAL'}});
 assert.equal(q.snapshot().state,'NO_ELIGIBLE_QUOTES');
 assert.equal(q.snapshot().completedScans,1);
 assert.equal(q.snapshot().consecutiveNoEligibleScans,1);
 assert.equal(q.snapshot().lastEligibleVenues,0);
});
test('repeated current-market scans remain eligible even when no new capture occurs',()=>{
 let time=now;const q=createScanContinuity({clock:()=>time});
 q.record({startedMs:time,finishedMs:time,statuses:{Kalshi:'ELIGIBLE',Polymarket:'ELIGIBLE'},captured:2});
 time+=20000;
 q.record({startedMs:time,finishedMs:time,statuses:{Kalshi:'ELIGIBLE',Polymarket:'ELIGIBLE'},captured:0});
 assert.equal(q.snapshot().state,'COLLECTING');
 assert.equal(q.snapshot().venues.Kalshi.eligibleReads,2);
 assert.equal(q.snapshot().recent[1].captures,0);
});
test('scanner marks long observed gaps and stale checks without pretending to prove full uptime',()=>{
 let time=now;const q=createScanContinuity({clock:()=>time});
 q.record({startedMs:time,finishedMs:time,statuses:{Kalshi:'ELIGIBLE',Polymarket:'ERROR'}});
 time+=80000;
 q.record({startedMs:time,finishedMs:time,statuses:{Kalshi:'ELIGIBLE',Polymarket:'OFFLINE'}});
 assert.equal(q.snapshot().longGaps,1);
 assert.equal(q.snapshot().maxObservedGapMs,80000);
 assert.equal(q.snapshot().state,'DEGRADED');
 time+=61000;
 assert.equal(q.snapshot().state,'STALLED');
 assert.match(q.snapshot().caveat,/unknown downtime/);
});
test('overlapping scans are counted, rolling history bounded, errors never become eligible',()=>{
 let time=now;const q=createScanContinuity({clock:()=>time,limit:2});
 q.overlap();q.overlap();
 for(let i=0;i<4;i++){
  q.record({startedMs:time,finishedMs:time,statuses:{Kalshi:'ERROR',Polymarket:'STALE'}});
  time+=20000;
 }
 assert.equal(q.snapshot().overlapCount,2);
 assert.equal(q.snapshot().recent.length,2);
 assert.equal(q.snapshot().noEligibleScans,4);
 assert.equal(q.snapshot().consecutiveNoEligibleScans,4);
 assert.equal(q.snapshot().venues.Polymarket.lastState,'STALE');
 assert.throws(()=>q.record({startedMs:time,finishedMs:time,statuses:{Kalshi:'LIVE',Polymarket:'ELIGIBLE'}}));
});
