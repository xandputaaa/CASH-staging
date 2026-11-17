'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {server}=require('../server');
async function withServer(fn){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{return await fn()}finally{await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()))}
}
function request(path,method='GET'){
  const port=server.address().port;
  return new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port,path,method},res=>{
      let body='';res.setEncoding('utf8');res.on('data',x=>body+=x);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));
    });
    req.on('error',reject);req.end();
  });
}
test('deployed homepage serves CASH live references and paper simulation',()=>withServer(async()=>{
  const r=await request('/?utm_source=chatgpt.com');
  assert.equal(r.status,200);
  assert.match(r.body,/LIVE MARKET QUOTES/);
  assert.match(r.body,/BTC \/ USD · PUBLIC SPOT PRICE/);
  assert.match(r.body,/Paper account/);
  assert.match(r.headers['content-security-policy'],/connect-src 'self'/);
}));
test('health route reports paper-only mode and source connection status',()=>withServer(async()=>{
  const r=await request('/health');
  assert.equal(r.status,200);
  const value=JSON.parse(r.body);
  assert.equal(value.ok,true);assert.equal(value.mode,'paper-only');
  assert.ok(value.venueFeeds&&value.spotFeed);
  assert.equal(value.shadowStorage,'VOLATILE_SERVER_SESSION');assert.equal(value.qualifyingForecasts,0);
}));
test('unknown market venue returns an error without calling upstream providers',()=>withServer(async()=>{
  const r=await request('/api/markets?venue=UNKNOWN');
  assert.equal(r.status,400);
  assert.match(r.body,/Unsupported market venue/);
}));
test('real orders and POST market actions are never exposed',()=>withServer(async()=>{
  assert.equal((await request('/order','POST')).status,404);
  assert.equal((await request('/trade','POST')).status,404);
  assert.equal((await request('/api/markets?venue=Kalshi','POST')).status,404);
}));

test('mobile live-quote paper client is served with JavaScript MIME',()=>withServer(async()=>{
 const response=await request('/live-paper.js');
 assert.equal(response.status,200);
 assert.match(response.headers['content-type'],/javascript/);
 assert.match(response.body,/CASHLivePaper/);
 assert.match(response.body,/cash-live-paper-v1/);
}));
test('official result endpoint rejects untrusted identifiers without remote requests',()=>withServer(async()=>{
 const response=await request('/api/result?venue=Kalshi&marketId=https%3A%2F%2Fevil.test');
 assert.equal(response.status,400);
 assert.match(response.body,/Invalid market identifier/);
}));

test('shadow monitor read endpoint is explicit about nonqualifying volatile session data',()=>withServer(async()=>{
 const r=await request('/api/shadow');assert.equal(r.status,200);
 const snapshot=JSON.parse(r.body);
 assert.equal(snapshot.storageMode,'VOLATILE_SERVER_SESSION');
 assert.equal(snapshot.qualifyingProspectiveContracts,0);
 assert.equal(snapshot.independentForecastModel,false);
 assert.match(snapshot.warning,/NOT verified CASH AI predictions/);
}));
test('shadow observations are downloadable but not accepted as immutable audit records',()=>withServer(async()=>{
 const r=await request('/api/shadow/export');assert.equal(r.status,200);
 assert.match(r.headers['content-disposition'],/attachment/);
 const data=JSON.parse(r.body);
 assert.equal(data.format,'CASH-shadow-volatile-v1');assert.equal(data.qualifyingForModelAccuracy,false);
 assert.match(data.checksumChainWarning,/do not prove immutable capture times/);
 assert.ok(Array.isArray(data.events));
}));
test('shadow frontend script is served same-origin with a clear nonverified badge',()=>withServer(async()=>{
 const r=await request('/shadow-ui.js');assert.equal(r.status,200);
 assert.match(r.headers['content-type'],/javascript/);
 assert.match(r.body,/SESSION BASELINE · NOT VERIFIED/);
}));

test('diagnostic API is cached, read-only and never reports trading readiness',()=>withServer(async()=>{
 const r=await request('/api/diagnostics');
 assert.equal(r.status,200);
 assert.match(r.headers['cache-control'],/no-store/);
 const v=JSON.parse(r.body);
 assert.equal(v.mode,'SIMULATION_ONLY');
 assert.ok(['LIVE','DEGRADED','OFFLINE'].includes(v.dataStatus));
 assert.equal(v.validation.qualifyingProspectiveContracts,0);
 assert.equal(v.validation.realOrdersEnabled,false);
 assert.equal(v.validation.storageMode,'VOLATILE_SERVER_SESSION');
 assert.ok(v.feeds.Kalshi&&v.feeds.Polymarket&&v.feeds.spot);
 assert.ok(v.monitor);
}));
test('CASH diagnostics UI is served and mounted on mobile dashboard',()=>withServer(async()=>{
 const script=await request('/diagnostics-ui.js');
 assert.equal(script.status,200);
 assert.match(script.headers['content-type'],/javascript/);
 assert.match(script.body,/dataStatus/);
 const page=await request('/');
 assert.match(page.body,/CASH DIAGNOSTICS/);
 assert.match(page.body,/diagnosticGate/);
 assert.match(page.body,/diagnostics-ui\.js/);
}));

test('browser-only shadow archive assets are same origin and cannot submit real orders',()=>withServer(async()=>{
 const a=await request('/shadow-browser-archive.js');
 const b=await request('/shadow-browser-archive-ui.js');
 assert.equal(a.status,200);assert.equal(b.status,200);
 assert.match(a.headers['content-type'],/javascript/);
 assert.match(a.body,/CASH-local-shadow-archive-v1/);
 assert.match(b.body,/\/api\/shadow\/export/);
 assert.equal((await request('/shadow-browser-archive.js','POST')).status,404);
}));

test('experimental evaluation endpoint remains read-only, evidence-scoped and never qualified',()=>withServer(async()=>{
 const r=await request('/api/evaluation');assert.equal(r.status,200);
 assert.match(r.headers['cache-control'],/no-store/);
 const report=JSON.parse(r.body);
 assert.equal(report.report,'CASH_EXPERIMENTAL_SPOT_EVALUATION_V1');
 assert.equal(report.mode,'DESCRIPTIVE_SESSION_ONLY');
 assert.equal(report.qualification.state,'NOT_VALIDATED');
 assert.equal(report.qualification.realOrdersEnabled,false);
 assert.equal(report.qualification.prospectiveIndependentAttested,0);
 assert.equal(report.total.hits+report.total.misses,report.total.scored);
 assert.equal((await request('/api/evaluation','POST')).status,404);
 const asset=await request('/evaluation-ui.js');
 assert.equal(asset.status,200);
 assert.match(asset.headers['content-type'],/javascript/);
 assert.match(asset.body,/EXPERIMENTAL_SPOT_EVALUATION/);
 const homepage=await request('/');
 assert.match(homepage.body,/FORECAST EVIDENCE · EXPERIMENTAL/);
 assert.match(homepage.body,/evaluation-ui\.js/);
}));

test('audit preflight endpoint exports digest-only commitments and disallows writes',()=>withServer(async()=>{
 const a=await request('/api/audit-preflight');
 assert.equal(a.status,200);
 assert.match(a.headers['cache-control'],/no-store/);
 const report=JSON.parse(a.body);
 assert.equal(report.mode,'CASH_AUDIT_PREFLIGHT_V1');
 assert.equal(report.independentVerification.qualifyingProspectiveContracts,0);
 assert.equal(report.independentVerification.timeWitnessConfigured,false);
 assert.equal(report.independentVerification.realOrdersEnabled,false);
 assert.equal(report.capacity.overflowProtection,'RESERVE_ONE_RESOLUTION_EVENT_PER_PENDING_CONTRACT');
 assert.equal((await request('/api/audit-preflight','POST')).status,404);
 const page=await request('/');
 assert.match(page.body,/id="diagnosticCapacity"/);
 assert.match(page.body,/\/api\/audit-preflight/);
}));

test('CASH cognitive core is read-only metacognition, not consciousness or trading authorization',()=>withServer(async()=>{
 const response=await request('/api/cognition');
 assert.equal(response.status,200);
 assert.match(response.headers['cache-control'],/no-store/);
 const data=JSON.parse(response.body);
 assert.equal(data.name,'CASH_COGNITIVE_CORE_V1');
 assert.equal(data.nature,'DETERMINISTIC_METACOGNITION_NOT_SENTIENCE');
 assert.equal(data.executionDecision,'ABSTAIN_FROM_REAL_MONEY_TRADING');
 assert.equal(data.automaticOrdersEnabled,false);
 assert.equal(data.autonomousModelUpdatesEnabled,false);
 assert.equal(data.tradingAllowed,false);
 assert.equal(data.qualifyingProspectiveContracts,0);
 assert.ok(Array.isArray(data.attention));
 assert.equal((await request('/api/cognition','POST')).status,404);
 const script=await request('/cognition-ui.js');
 assert.equal(script.status,200);
 assert.match(script.headers['content-type'],/javascript/);
 assert.match(script.body,/CASH_COGNITIVE_CORE_V1/);
 const homepage=await request('/');
 assert.match(homepage.body,/CASH \/ COGNITIVE CORE/);
 assert.match(homepage.body,/This is not sentience or consciousness/);
 assert.match(homepage.body,/cognition-ui\.js/);
}));

test('Kalshi 15m terminal serves conservative paper-only readiness and same-origin UI',()=>withServer(async()=>{
 const response=await request('/api/kalshi15');
 assert.equal(response.status,200);
 const r=JSON.parse(response.body);
 assert.equal(r.version,'CASH_KALSHI15_TERMINAL_V1');
 assert.equal(r.liveDecision,'NO_CALL_MODEL_NOT_VALIDATED');
 assert.equal(r.realTradingAuthorized,false);
 assert.equal(r.automaticOrdersEnabled,false);
 assert.equal(r.independentForecastValidation,0);
 assert.equal(r.spotReference.settlementIndexAvailable,false);
 assert.equal((await request('/api/kalshi15','POST')).status,404);
 const script=await request('/kalshi15-ui.js');
 assert.equal(script.status,200);assert.match(script.headers['content-type'],/javascript/);
 assert.match(script.body,/NO_CALL_MODEL_NOT_VALIDATED/);
 const page=await request('/');
 assert.match(page.body,/KALSHI \/ BTC 15 MIN · COMMAND CENTER/);
 assert.match(page.body,/kalshi15-ui\.js/);
}));

test('Kalshi finalization checklist and break-even report are explanatory not a trade signal',()=>withServer(async()=>{
 const response=await request('/api/kalshi15');
 assert.equal(response.status,200);
 const r=JSON.parse(response.body);
 assert.equal(r.finalization.realTradingGatePassed,false);
 assert.equal(r.finalization.officialBrtiFeedAvailable,false);
 assert.equal(r.finalization.seriesSpecificFeesVerified,false);
 assert.equal(r.breakEven.expectedValue,null);
 assert.equal(r.breakEven.independentWinProbability,null);
 assert.equal(r.breakEven.yesAfterFeesAndSlippage,null);
 assert.ok(r.releaseChecklist.some(x=>x.id==='OFFICIAL_BRTI_FEED'&&x.passed===false));
 const page=await request('/');
 assert.match(page.body,/FINALIZATION CHECKLIST/);
 assert.match(page.body,/id="k15Breakeven"/);
 const script=await request('/kalshi15-ui.js');
 assert.match(script.body,/k15Checklist/);
}));

test('Kalshi fee metadata remains hypothetical, read-only and distinct from real entry authorization',()=>withServer(async()=>{
 const r=await request('/api/kalshi15');
 assert.equal(r.status,200);
 const x=JSON.parse(r.body);
 assert.equal(x.feeReference.notExecutable,true);
 assert.equal(x.feeReference.eventOverridesVerified,false);
 assert.equal(x.breakEven.expectedValue,null);
 assert.equal(x.breakEven.yesAfterFeesAndSlippage,null);
 assert.equal(x.finalization.realTradingGatePassed,false);
 assert.equal(x.realTradingAuthorized,false);
 const page=await request('/');
 assert.match(page.body,/k15FeePreview/);
 const script=await request('/kalshi15-ui.js');
 assert.match(script.body,/One-contract TAKER illustration/);
}));

test('simple and advanced modes are both served read-only and preserve no-order safety gates',()=>withServer(async()=>{
 const page=await request('/');
 assert.equal(page.status,200);
 assert.match(page.body,/data-cash-mode="simple"/);
 assert.match(page.body,/id="modeSimple"/);
 assert.match(page.body,/id="modeAdvanced"/);
 assert.match(page.body,/id="cashSimple"/);
 assert.match(page.body,/id="livePaperLab"/);
 assert.match(page.body,/body\[data-cash-mode="simple"\] main>section:not/);
 assert.match(page.body,/NO VERIFIED PICK/);
 assert.match(page.body,/PRACTICE ONLY/);
 assert.match(page.body,/view-mode\.js/);
 assert.match(page.body,/simple-ui\.js/);
 const ui=await request('/simple-ui.js');
 assert.equal(ui.status,200);
 assert.match(ui.headers['content-type'],/javascript/);
 assert.match(ui.body,/NO_CALL_MODEL_NOT_VALIDATED/);
 assert.match(ui.body,/cash-mode-change/);
 const modes=await request('/view-mode.js');
 assert.equal(modes.status,200);
 assert.match(modes.body,/cash-view-mode-v1/);
 assert.match(modes.body,/aria-pressed/);
 assert.equal((await request('/simple-ui.js','POST')).status,404);
 assert.equal((await request('/view-mode.js','POST')).status,404);
 assert.equal((await request('/trade','POST')).status,404);
}));

test('public live-operation endpoint and button are reachable without enabling any order route',()=>withServer(async()=>{
 const result=await request('/api/live-check');
 assert.equal(result.status,200);
 assert.match(result.headers['cache-control'],/no-store/);
 const data=JSON.parse(result.body);
 assert.equal(data.version,'CASH_LIVE_OPERATION_CHECK_V1');
 assert.equal(data.site.online,true);
 assert.equal(data.site.simpleModeAssetsReady,true);
 assert.equal(data.site.advancedModeAssetsReady,true);
 assert.equal(data.paperPractice.clientAvailable,true);
 assert.equal(data.paperPractice.realOrdersEnabled,false);
 assert.equal(data.model.independentValidatedForecasts,0);
 assert.equal(data.model.canExecuteRealTrade,false);
 assert.ok(['LIVE_PAPER_MONITOR','ONLINE_PARTIAL_DATA','ONLINE_QUOTES_UNAVAILABLE'].includes(data.state));
 const js=await request('/live-check-ui.js');
 assert.equal(js.status,200);
 assert.match(js.headers['content-type'],/javascript/);
 assert.match(js.body,/CASH_LIVE_OPERATION_CHECK_V1/);
 assert.match(js.body,/connectionCheck/);
 const home=await request('/');
 assert.match(home.body,/CASH \/ LIVE PAPER MONITOR/);
 assert.match(home.body,/id="connectionCheck"/);
 assert.match(home.body,/id="connectionResult"/);
 assert.match(home.body,/live-check-ui\.js/);
 assert.equal((await request('/api/live-check','POST')).status,404);
 assert.equal((await request('/trade','POST')).status,404);
}));
