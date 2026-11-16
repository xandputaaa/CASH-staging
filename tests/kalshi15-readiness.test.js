'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {assessKalshi15}=require('../kalshi15-readiness');
const now=Date.parse('2026-11-16T21:00:00Z'),at=ms=>new Date(ms).toISOString();
function inputs(){
 return {now,quote:{
  venue:'Kalshi',marketId:'KXBTC15M-26NOV161430-30',status:'live',
  openTime:at(now-60000),endTime:at(now+360000),fetchedAt:at(now-2000),
  yesAsk:0.53,noAsk:0.48,yesBid:0.52,targetPrice:86075.12,
  targetSource:'KALSHI_FLOOR_STRIKE',
  contractRuleStatus:'BRTI_60S_RULE_TEXT_PRESENT',
  strikeType:'greater_or_equal',tieGoesToYes:true,refreshFailed:false},
  spot:{status:'live',source:'Kraken BTC/USD',price:86090,fetchedAt:at(now-3000)},
  shadow:{recent:[]}};
}
test('complete current Kalshi 15m market enables paper monitoring but never a real call',()=>{
 const out=assessKalshi15(inputs());
 assert.equal(out.displayState,'PAPER_MONITOR_READY');
 assert.equal(out.paperMonitorReady,true);
 assert.equal(out.liveDecision,'NO_CALL_MODEL_NOT_VALIDATED');
 assert.equal(out.realTradingAuthorized,false);
 assert.equal(out.automaticOrdersEnabled,false);
 assert.equal(out.independentForecastValidation,0);
 assert.equal(out.target.value,86075.12);
 assert.equal(out.market.askSum,1.01);
 assert.equal(out.spotReference.settlementIndexAvailable,false);
});
test('missing official target blocks paper readiness even when spot is above guessed target',()=>{
 const input=inputs();input.quote.targetPrice=null;input.quote.targetSource='MISSING';
 const out=assessKalshi15(input);
 assert.equal(out.displayState,'NO_CALL');
 assert.equal(out.target.value,null);
 assert.match(out.blockers.join(' '),/floor_strike/);
});
test('unconfirmed contract-specific BRTI rule text fails closed',()=>{
 const input=inputs();input.quote.contractRuleStatus='RULE_TEXT_NOT_CONFIRMED';
 const out=assessKalshi15(input);
 assert.equal(out.paperMonitorReady,false);
 assert.ok(out.blockers.some(x=>x.includes('rule text')));
});
test('failed quote refresh, partial book or stale price blocks ready state',()=>{
 for(const change of [
  {refreshFailed:true},{yesAsk:null,status:'partial'},
  {fetchedAt:at(now-60000)}, {status:'stale'}
 ]){
  const input=inputs();Object.assign(input.quote,change);
  assert.equal(assessKalshi15(input).displayState,'NO_CALL');
 }
});
test('expired and closing windows cannot show green paper readiness',()=>{
 const expired=inputs();expired.quote.endTime=at(now-1000);
 assert.equal(assessKalshi15(expired).paperMonitorReady,false);
 const closing=inputs();closing.quote.endTime=at(now+30000);
 assert.equal(assessKalshi15(closing).paperMonitorReady,false);
 const distant=inputs();distant.quote.endTime=at(now+1800000);
 assert.equal(assessKalshi15(distant).paperMonitorReady,false);
});
test('wrong Kalshi product never becomes a BTC 15m call',()=>{
 const input=inputs();input.quote.marketId='KXETH15M-TEST123';
 const output=assessKalshi15(input);
 assert.equal(output.marketId,null);assert.equal(output.paperMonitorReady,false);
});
test('stale spot reference cannot be disguised as BRTI settlement evidence',()=>{
 const input=inputs();input.spot.status='stale';
 const o=assessKalshi15(input);
 assert.equal(o.paperMonitorReady,false);
 assert.equal(o.spotReference.price,null);
 assert.equal(o.spotReference.settlementIndexValue,null);
});
test('experimental directional side is tagged as unverified session observation only',()=>{
 const input=inputs();
 input.shadow.recent=[{venue:'Kalshi',marketId:input.quote.marketId,
  spotCandidate:{source:'Kraken BTC/USD',predictedContractSide:'NO',
   sampleWindow:[],sampleWindowSha256:'a'.repeat(64)}}];
 const r=assessKalshi15(input);
 assert.equal(r.experimentalCandidate.side,'NO');
 assert.match(r.experimentalCandidate.status,/NOT_VALIDATED/);
 assert.equal(r.liveDecision,'NO_CALL_MODEL_NOT_VALIDATED');
});

test('real-money readiness stays closed even with all five paper observation requirements met',()=>{
 const r=assessKalshi15(inputs());
 assert.equal(r.finalization.paperDataChecksPassed,5);
 assert.equal(r.finalization.paperDataChecksRequired,5);
 assert.equal(r.finalization.realTradingGatePassed,false);
 assert.equal(r.finalization.brtiRestEntitlement,'NOT_CONNECTED');
 assert.equal(r.finalization.officialBrtiFeedAvailable,false);
 assert.equal(r.releaseChecklist.length,9);
 assert.equal(r.releaseChecklist.filter(x=>!x.passed).length,4);
 assert.equal(r.breakEven.yesBeforeFees,0.53);
 assert.equal(r.breakEven.noBeforeFees,0.48);
 assert.equal(r.breakEven.yesAfterFeesAndSlippage,null);
 assert.equal(r.breakEven.independentWinProbability,null);
 assert.equal(r.breakEven.expectedValue,null);
});
test('Kalshi BTC fifteen-minute greater_or_equal strike term is checked explicitly',()=>{
 const v=inputs();v.quote.strikeType='greater';v.quote.tieGoesToYes=false;
 const r=assessKalshi15(v);
 assert.equal(r.target.tieToYesConfirmed,false);
 assert.equal(r.paperMonitorReady,false);
 assert.ok(r.blockers.some(x=>x.includes('greater_or_equal')));
});
test('a spoofed non-Kalshi quote fails despite identical market ticker and bids',()=>{
 const v=inputs();v.quote.venue='Polymarket';
 const r=assessKalshi15(v);
 assert.equal(r.paperMonitorReady,false);
 assert.ok(r.blockers.some(x=>x.includes('not confirmed as Kalshi')));
});
test('missing or stale asks never fabricate a fee-free break-even probability',()=>{
 const v=inputs();v.quote.yesAsk=null;v.quote.status='partial';
 const r=assessKalshi15(v);
 assert.equal(r.breakEven.yesBeforeFees,null);
 assert.equal(r.breakEven.yesAfterFeesAndSlippage,null);
 assert.equal(r.breakEven.expectedValue,null);
});
