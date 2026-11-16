'use strict';
/*
 * Per-process scanner continuity and quote eligibility metrics. These are
 * diagnostics, not trading signals, independent timestamps, or guarantees of
 * complete market coverage. All state resets when the server restarts.
 */
const VENUES=['Kalshi','Polymarket'];
const VALID_STATES=new Set(['ELIGIBLE','PARTIAL','STALE','OFFLINE','INVALID','EXPIRED','WINDOW_CLOSING','NO_BASELINE','ERROR']);
function classifyQuote(venue,quote,now,minLeadMs=60000,hasBaseline=false){
 if(!quote||quote.status==='unavailable')return 'OFFLINE';
 if(quote.status==='stale')return 'STALE';
 if(quote.venue!==venue||!['live','partial'].includes(quote.status))return 'INVALID';
 const fetched=Date.parse(quote.fetchedAt),expiry=Date.parse(quote.endTime);
 if(!Number.isFinite(fetched)||!Number.isFinite(expiry))return 'INVALID';
 if(fetched>now+2000||now-fetched>12000)return 'STALE';
 if(venue==='Kalshi'){
  if(typeof quote.marketId!=='string'||!/^KXBTC15M-[A-Za-z0-9-]{6,70}$/.test(quote.marketId))
   return 'INVALID';
 }else if(venue==='Polymarket'){
  if(typeof quote.marketId!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(quote.marketId)||
    !/^btc-updown-5m-\d{9,12}$/.test(quote.slug||''))return 'INVALID';
 }else return 'INVALID';
 if(expiry<=now)return 'EXPIRED';
 if(quote.status==='partial')return 'PARTIAL';
 if(!hasBaseline)return 'NO_BASELINE';
 if(expiry-now<minLeadMs)return 'WINDOW_CLOSING';
 return 'ELIGIBLE';
}
function createScanContinuity({clock=()=>Date.now(),limit=30,gapThresholdMs=45000,stallMs=60000}={}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('Invalid continuity history limit');
 const venues=Object.fromEntries(VENUES.map(v=>[v,{lastState:'NOT_CHECKED',lastEligibleAt:null,
  eligibleReads:0,otherReads:0}]));
 let completed=0,overlapCount=0,noEligibleScans=0,consecutiveNoEligibleScans=0,
  longGaps=0,maxObservedGapMs=0,lastFinishedMs=null;
 const recent=[];
 function overlap(){overlapCount++}
 function record({startedMs,finishedMs,statuses,captured=0,resolved=0}){
  if(!Number.isFinite(startedMs)||!Number.isFinite(finishedMs)||finishedMs<startedMs)
   throw Error('Invalid scan timestamps');
  if(!statuses||!VENUES.every(v=>VALID_STATES.has(statuses[v])))
   throw Error('Missing scan venue classification');
  const gapMs=lastFinishedMs===null?null:Math.max(0,startedMs-lastFinishedMs);
  if(gapMs!==null){
   maxObservedGapMs=Math.max(maxObservedGapMs,gapMs);
   if(gapMs>gapThresholdMs)longGaps++;
  }
  const eligibleCount=VENUES.filter(v=>statuses[v]==='ELIGIBLE').length;
  if(!eligibleCount){noEligibleScans++;consecutiveNoEligibleScans++}
  else consecutiveNoEligibleScans=0;
  for(const venue of VENUES){
   const v=venues[venue];
   v.lastState=statuses[venue];
   if(statuses[venue]==='ELIGIBLE'){
    v.eligibleReads++;v.lastEligibleAt=new Date(finishedMs).toISOString();
   }else v.otherReads++;
  }
  const observation={startedAt:new Date(startedMs).toISOString(),
   completedAt:new Date(finishedMs).toISOString(),
   durationMs:finishedMs-startedMs,
   gapSincePreviousMs:gapMs,
   eligibleVenues:eligibleCount,
   states:{Kalshi:statuses.Kalshi,Polymarket:statuses.Polymarket},
   captures:captured,resolutions:resolved};
  recent.push(observation);
  if(recent.length>limit)recent.shift();
  completed++;lastFinishedMs=finishedMs;
  return observation;
 }
 function snapshot(){
  const now=clock(),last=recent[recent.length-1]||null;
  const ageMs=lastFinishedMs===null?null:Math.max(0,now-lastFinishedMs);
  const state=!last?'NOT_STARTED':ageMs>stallMs?'STALLED':
   last.eligibleVenues===2?'COLLECTING':
   last.eligibleVenues===1?'DEGRADED':'NO_ELIGIBLE_QUOTES';
  return {state,completedScans:completed,overlapCount,
   noEligibleScans,consecutiveNoEligibleScans,
   longGaps,maxObservedGapMs,lastCompletedAt:last?.completedAt||null,
   lastScanDurationMs:last?.durationMs??null,
   ageMs,lastStates:last?.states||{Kalshi:'NOT_CHECKED',Polymarket:'NOT_CHECKED'},
   lastEligibleVenues:last?.eligibleVenues||0,
   venues:{Kalshi:{...venues.Kalshi},Polymarket:{...venues.Polymarket}},
   recent:recent.map(x=>({...x,states:{...x.states}})),
   caveat:'Session scanner results only. A completed scan can collect zero usable quotes. Restart, unknown downtime and never-observed contracts cannot be reconstructed.'};
 }
 return {record,overlap,snapshot};
}
module.exports={classifyQuote,createScanContinuity};
