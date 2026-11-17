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

test('forward-looking prospective Kalshi endpoint never exposes real trading permissions',()=>withServer(async()=>{
 const r=await request('/api/prospective');
 assert.equal(r.status,200);
 const v=JSON.parse(r.body);
 assert.equal(v.version,'CASH_PROSPECTIVE_KALSHI_V1');
 assert.equal(v.model,'KXBTC15M_SETTLEMENT_EARLY_V3');
 assert.equal(v.qualifiedCount,0);
 assert.equal(v.tradingAuthorized,false);
 assert.equal(v.automatedOrdersEnabled,false);
 assert.equal(v.modelCalibrated,false);
 const exportResponse=await request('/api/prospective/export');
 assert.equal(exportResponse.status,200);
 const data=JSON.parse(exportResponse.body);
 assert.equal(data.format,'CASH_PROSPECTIVE_HASHED_SESSION_V1');
 assert.match(data.warning,/not independent trusted timestamps/);
 const script=await request('/prospective-ui.js');
 assert.equal(script.status,200);
 assert.match(script.headers['content-type'],/javascript/);
 assert.match(script.body,/UNVALIDATED/);
 const page=await request('/');
 assert.match(page.body,/FORWARD FORECAST TEST/);
 assert.match(page.body,/simpleForecast/);
 assert.equal((await request('/api/prospective','POST')).status,404);
 assert.equal((await request('/api/prospective/export','POST')).status,404);
 assert.equal((await request('/order','POST')).status,404);
}));

test('Kalshi CF Benchmarks optional feed reports read-only index health without secrets or prices',()=>withServer(async()=>{
 const resp=await request('/api/brti-health');
 assert.equal(resp.status,200);
 const r=JSON.parse(resp.body);
 assert.equal(r.indexId,'BRTI');
 assert.equal(r.rawValueExposed,false);
 assert.equal(r.rawHistoryExposed,false);
 assert.equal(r.tradingPermission,false);
 assert.equal(r.usedForForecasts,false);
 assert.ok(['NOT_CONFIGURED','INVALID_CONFIG','NOT_CONNECTED','STALE','NOT_ENTITLED','LIVE','SOURCE_UNAVAILABLE'].includes(r.state));
 assert.equal((await request('/api/brti-health','POST')).status,404);
 const page=await request('/');
 assert.match(page.body,/id="pfBrti"/);
}));

test('read-only private Kalshi verifier is safely gated whether Railway secrets are configured or not',()=>withServer(async()=>{
 const status=await request('/api/order-verification-status');
 assert.equal(status.status,200);
 const v=JSON.parse(status.body);
 assert.equal(v.version,'CASH_ORDER_VERIFICATION_READINESS_V1');
 assert.ok(['NOT_CONNECTED','PRIVATE_VERIFICATION_CONFIGURED'].includes(v.state));
 assert.equal(v.orderPlacementEnabled,false);
 assert.equal(v.verifiedLiveOrders,0);
 assert.equal(v.independentlyValidatedPredictions,0);
 const privateResponse=await request('/api/private/order-verify','POST');
 assert.equal(privateResponse.status,v.state==='NOT_CONNECTED'?503:401);
 assert.match(privateResponse.body,v.state==='NOT_CONNECTED'?/NOT_CONFIGURED/:/AUTHORIZATION_REQUIRED/);
 assert.equal((await request('/api/private/order-verify','GET')).status,404);
 assert.equal((await request('/api/order-verification-status','POST')).status,404);
 const script=await request('/order-verify-ui.js');
 assert.equal(script.status,200);assert.match(script.body,/PRIVATE_ORDER_AUDIT_V1/);
 const site=await request('/');
 assert.match(site.body,/KALSHI · REAL ORDER VERIFICATION/);
 assert.match(site.body,/id="orderVerifyToken"/);
 assert.match(site.body,/order-verify-ui.js/);
 assert.match(site.headers['referrer-policy'],/no-referrer/);
}));

test('owner can generate a secure token entirely on-device and sees actual Kalshi read access state',()=>withServer(async()=>{
 const page=await request('/');
 assert.equal(page.status,200);
 assert.match(page.body,/id="orderGenerateToken"/);
 assert.match(page.body,/id="orderTokenCopy"/);
 assert.match(page.body,/id="orderCopyToken"/);
 assert.match(page.body,/id="orderSelectToken"/);
 assert.match(page.body,/id="orderHideToken"/);
 assert.match(page.body,/id="orderTokenGuide"/);
 assert.match(page.body,/OWNER_VERIFY_TOKEN/);
 const script=await request('/order-verify-ui.js');
 assert.equal(script.status,200);
 assert.match(script.body,/cryptoApi.getRandomValues\(bytes\)/);
 assert.match(script.body,/KALSHI READ ACCESS VERIFIED/);
 assert.match(script.body,/navigator.clipboard.writeText\(secret\)/);
 assert.match(script.body,/copyArea.setSelectionRange/);
 assert.match(script.body,/document.execCommand\('copy'\)/);
 assert.doesNotMatch(script.body,/localStorage\.setItem/);
 const st=await request('/api/order-verification-status');
 const state=JSON.parse(st.body);
 assert.equal(state.orderPlacementEnabled,false);
 assert.equal(state.verifiedLiveOrders,0);
}));

test('recent filled-order audit requires a private token and has no GET/write endpoint',()=>withServer(async()=>{
 const status=JSON.parse((await request('/api/order-verification-status')).body);
 const response=await request('/api/private/recent-order-verify','POST');
 assert.equal(response.status,status.state==='NOT_CONNECTED'?503:401);
 assert.equal((await request('/api/private/recent-order-verify')).status,404);
 assert.equal((await request('/api/private/recent-order-verify','DELETE')).status,404);
 const page=await request('/');
 assert.match(page.body,/id="orderVerifyRecentButton"/);
 const script=await request('/order-verify-ui.js');
 assert.match(script.body,/api\/private\/recent-order-verify/);
 assert.equal(status.orderPlacementEnabled,false);
}));

test('early-move lab is a read-only unvalidated spot research endpoint, visible in Simple Mode',()=>withServer(async()=>{
 const r=await request('/api/early-move');
 assert.equal(r.status,200);
 const v=JSON.parse(r.body);
 assert.equal(v.version,'CASH_SPOT_EARLY_MOVE_V1');
 assert.equal(v.model,'BTC_SPOT_MOMENTUM_45S_V1');
 assert.equal(v.horizonSeconds,45);
 assert.equal(v.independentValidation,0);
 assert.equal(v.tradingAuthorized,false);
 assert.equal(v.modelCalibrated,false);
 assert.equal(v.automaticOrdersEnabled,false);
 assert.equal(v.independentlyTimeAttested,false);
 assert.equal((await request('/api/early-move','POST')).status,404);
 const js=await request('/early-move-ui.js');
 assert.equal(js.status,200);
 assert.match(js.headers['content-type'],/javascript/);
 assert.match(js.body,/EARLY CALL FROZEN/);
 const page=await request('/');
 assert.match(page.body,/id="cashSettlementCall"/);
 assert.match(page.body,/id="settlementYesAskLine"/);
 assert.match(page.body,/settlement-call-ui.js/);
 assert.match(page.body,/:not\(#cashSettlementCall\)/);
}));

test('Kalshi early settlement forecast is visible in Simple Mode and uses only read-only public monitoring',()=>withServer(async()=>{
 const r=await request('/api/prospective');
 assert.equal(r.status,200);
 const v=JSON.parse(r.body);
 assert.equal(v.model,'KXBTC15M_SETTLEMENT_EARLY_V3');
 assert.equal(v.modelCalibrated,false);
 assert.equal(v.tradingAuthorized,false);
 assert.equal(v.qualifiedCount,0);
 assert.equal(v.publicQuoteChart.kind,'KALSHI_PUBLIC_YES_ASK_SNAPSHOTS');
 const script=await request('/settlement-call-ui.js');
 assert.equal(script.status,200);
 assert.match(script.body,/Kalshi 15-minute settlement/i);
 const page=await request('/');
 assert.match(page.body,/id="cashSettlementCall"/);
 assert.match(page.body,/id="settlementLiveSide"/);
 assert.match(page.body,/id="settlementYesAskLine"/);
 assert.doesNotMatch(page.body,/id="cashEarlyMove"/);
 assert.match(page.body,/:not\(#cashSettlementCall\)/);
 assert.equal((await request('/api/prospective','POST')).status,404);
}));

test('Simple Mode header explicitly labels early Kalshi settlement prediction as unvalidated',()=>withServer(async()=>{
 const page=await request('/');
 assert.match(page.body,/CASH 15-MINUTE SETTLEMENT LEAN · EXPERIMENTAL/);
 const script=await request('/settlement-call-ui.js');
 assert.match(script.body,/EXPERIMENTAL YES · NOT VALIDATED/);
 assert.match(script.body,/EXPERIMENTAL NO · NOT VALIDATED/);
 assert.match(script.body,/WAIT · NO CLEAR YES\/NO CALL/);
 const simple=await request('/simple-ui.js');
 assert.doesNotMatch(simple.body,/el\('simpleCall'\)\.textContent='NO VERIFIED PICK';\s*el\('simpleWhy'\)\.textContent=fresh/);
}));

test('settlement evaluation shows uncertainty, market baseline and a manual journal export link',()=>withServer(async()=>{
 const r=await request('/api/prospective');
 assert.equal(r.status,200);
 const x=JSON.parse(r.body);
 assert.equal(x.evaluation.version,'CASH_SETTLEMENT_EVALUATION_V1');
 assert.equal(x.evaluation.independentlyValidated,false);
 assert.equal(x.evaluation.profitVerified,false);
 assert.equal(x.qualifiedCount,0);
 const page=await request('/');
 assert.match(page.body,/id="settlementEvidenceRange"/);
 assert.match(page.body,/id="settlementMarketBaseline"/);
 assert.match(page.body,/Save frozen forecasts & official outcomes/);
 const js=await request('/settlement-call-ui.js');
 assert.match(js.body,/settlementMarketBaseline/);
 assert.equal((await request('/api/prospective/export')).status,200);
}));
