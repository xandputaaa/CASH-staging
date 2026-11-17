'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const client=fs.readFileSync('late-checkpoint-ui.js','utf8');
function score(){
 return {version:'CASH_LATE_CHECKPOINT_SHADOW_V1',
  model:'KXBTC15M_LATE_CHECKPOINT_SHADOW_V1',storage:'VOLATILE_SERVER_SESSION',
  independentQualification:0,requiredQualification:100,
  independentlyTimeAttested:false,calibrated:false,
  realMoneyAuthorized:false,canExecuteOrders:false,
  latest:{marketId:'KXBTC15M-TEST-12',side:'NO',
   at:'2026-11-17T16:00:00Z',status:'PENDING',outcomeReason:'NOT_YET_CHECKED'},
  scorecard:{qualifiedCount:0,
   overall:{captured:3,directional:2,waits:1,scoredDirectional:1,
    hits:0,misses:1,pendingDirectional:1,pendingWaits:1,voids:0,
    exploratoryDirectionalHitRate:0},
   bySource:{publicSpotProxy:{scoredDirectional:1},
    officialBrtiLive:{scoredDirectional:0}}
  }
 };
}
function boot(report=score()){
 const ids=['cashLateCheckpoint','lcState','lcRecent','lcCoverage',
  'lcCalls','lcWaits','lcScore','lcPaperEconomics'];
 const nodes=Object.fromEntries(ids.map(id=>[id,{textContent:''}]));
 const urls=[];
 vm.runInNewContext(client,{
  document:{getElementById:id=>nodes[id]||null,addEventListener(){}},
  Date,Number,AbortController,setTimeout:()=>1,clearTimeout(){},
  fetch:async (url,opts)=>{
   urls.push(url);assert.equal(opts.cache,'no-store');
   return {ok:true,json:async()=>report};
  }
 });
 return {nodes,urls,tick:()=>new Promise(r=>setImmediate(r))};
}
test('late checkpoint page displays WAIT denominators, sources and non-actionable research',async()=>{
 const h=boot();await h.tick();
 assert.equal(h.nodes.lcCalls.textContent,'2 YES/NO');
 assert.equal(h.nodes.lcWaits.textContent,'1 WAIT');
 assert.match(h.nodes.lcScore.textContent,/1 scored · 0.0% observed \(UNVALIDATED\)/);
 assert.match(h.nodes.lcCoverage.textContent,/Pending: 1 YES\/NO and 1 WAIT/);
 assert.match(h.nodes.lcCoverage.textContent,/Licensed index: 0 directional/);
 assert.match(h.nodes.lcRecent.textContent,/Most recent frozen checkpoint: NO/);
 assert.match(h.nodes.lcRecent.textContent,/not a new trade call/);
 assert.deepEqual(h.urls,['/api/late-checkpoint']);
});
test('unsafe trading claims are blocked from late page',async()=>{
 const h=boot({...score(),canExecuteOrders:true});await h.tick();
 assert.match(h.nodes.lcState.textContent,/UNAVAILABLE/);
 assert.match(h.nodes.lcRecent.textContent,/No verified late-checkpoint status/);
});
test('CASH serves and links new late checkpoint without disturbing frozen early exports',()=>{
 const html=fs.readFileSync('index.html','utf8'),
  server=fs.readFileSync('server.js','utf8');
 assert.match(html,/id="cashLateCheckpoint"/);
 assert.match(html,/id="lcCalls"/);
 assert.match(html,/src="\/late-checkpoint-ui.js"/);
 assert.match(server,/req.url==='\/late-checkpoint-ui.js'/);
 assert.match(server,/req.url==='\/api\/late-checkpoint'/);
 assert.match(server,/req.url==='\/api\/late-checkpoint\/export'/);
 assert.match(server,/req.url==='\/api\/prospective\/export'/);
 assert.match(server,/createLateCheckpointMonitor/);
 assert.match(server,/checkLate\(\)/);
});

test('paper economics show quoted-only price and fee scenario, not a real trade',async()=>{
 const data=score();
 data.paperEconomics={
  version:'CASH_PAPER_EXECUTION_AUDIT_V1',totalFrozen:3,directional:2,waits:1,
  quoteAndFeeObserved:1,unpriced:1,pendingResultsWithQuote:0,pricedVoids:0,
  pricedSettlements:1,conservativePnlDollars:-.04,optimisticPnlDollars:-.0375,
  tradingAuthorized:false,realOrdersEnabled:false,independentQualification:0
 };
 const h=boot(data);await h.tick();
 const t=h.nodes.lcPaperEconomics.textContent;
 assert.match(t,/1\/2 directional calls/);
 assert.match(t,/1 without eligible prices/);
 assert.match(t,/CONDITIONAL one-contract buy-at-observed-ask/);
 assert.match(t,/conservative \$-0\.0400/);
 assert.match(t,/centicent-fee \$-0\.0375/);
 assert.match(t,/No actual orders, fills or verified liquidity/);
});
test('unavailable paper fee evidence does not display fabricated PnL',async()=>{
 const h=boot();await h.tick();
 assert.match(h.nodes.lcPaperEconomics.textContent,/No validated fee-aware/);
});
