'use strict';
const http=require('node:http'),fs=require('node:fs');
const {privateAccessGate}=require('./private-access-gate');
const {privateSessionGate}=require('./private-session-gate');
const {assertSafeStartupConfiguration}=require('./startup-configuration-gate');
if(process.env.CASH_ONE_TIME_ARCHIVE_CUTOVER==='1'){
  if(process.env.CASH_ARCHIVE_LIVE_RECOVERY!=='1'||
     process.env.CASH_EXCLUSIVE_JOURNAL_WRITER!=='1')
   throw Error('One-time journal cutover requires exclusive live archive recovery');
  const {cutoverFullShadowJournal}=require('./audit-archive-one-time-cutover');
  const migrated=cutoverFullShadowJournal({directory:process.env.CASH_AUDIT_DIR,expectedEvents:600});
  console.log('CASH one-time archive cutover: '+migrated.state+
   ', archived='+migrated.archivedEvents+', automaticRollover=DISABLED');
}
assertSafeStartupConfiguration();
const {createMarketFeed}=require('./market-feed');
const {createVenueFeeds}=require('./venue-feeds');
const {createResolver}=require('./resolution-feed');
const {createShadowMonitor}=require('./shadow-monitor');
const {createAuditJournal}=require('./audit-journal');
const {createLiveRecoveredMonitor}=require('./audit-archive-live-startup');
const path=require('node:path');
const page=fs.readFileSync('index.html');
const ambientMarketMoodScript=fs.readFileSync('ambient-market-mood.js');
const livePaperScript=fs.readFileSync('live-paper.js');
const shadowScript=fs.readFileSync('shadow-ui.js');
const shadowArchiveScript=fs.readFileSync('shadow-browser-archive.js');
const shadowArchiveUiScript=fs.readFileSync('shadow-browser-archive-ui.js');
const diagnosticsScript=fs.readFileSync('diagnostics-ui.js');
const evaluationScript=fs.readFileSync('evaluation-ui.js');
const cognitionScript=fs.readFileSync('cognition-ui.js');
const kalshi15Script=fs.readFileSync('kalshi15-ui.js');
const viewModeScript=fs.readFileSync('view-mode.js');
const simpleUiScript=fs.readFileSync('simple-ui.js');
const {assessKalshi15}=require('./kalshi15-readiness');
const {manualAssist}=require('./manual-live-assist');
const {makeManualCalls}=require('./manual-entry-exit-calls');
const {createCashV3ChartFeed}=require('./cash-v3-chart-feed');
const cashV3Css=fs.readFileSync('cash-v3.css');
const cashV3Js=fs.readFileSync('cash-v3.js');
const manualCallsScript=fs.readFileSync('manual-calls-ui.js');
const manualAssistScript=fs.readFileSync('manual-assist-ui.js');
const {createKalshiFeeFeed}=require('./kalshi-fees');
const {assessCognition}=require('./cash-cognition');
const {createDiagnostics}=require('./diagnostics');
const {createProspectiveMonitor}=require('./prospective-monitor');
const {createLateCheckpointMonitor}=require('./late-checkpoint-monitor');
const {createEarlyMoveMonitor}=require('./early-move');
const earlyMoveScript=fs.readFileSync('early-move-ui.js');
const settlementCallScript=fs.readFileSync('settlement-call-ui.js');
const {createProspectiveStore}=require('./prospective-store');
const {createShadowLiveFeed}=require('./cash-shadow-live-feed');
const {createKalshiBrtiFeed}=require('./kalshi-brti');
const {createKalshiOrderVerifier}=require('./kalshi-order-verify');
const {resolvePrivateConfig}=require('./private-key-config');
const orderVerifyScript=fs.readFileSync('order-verify-ui.js');
const {assessLiveCheck}=require('./live-check');
const {runStartupSmoke}=require('./startup-smoke');
const liveCheckScript=fs.readFileSync('live-check-ui.js');
const prospectiveScript=fs.readFileSync('prospective-ui.js');
const lateCheckpointScript=fs.readFileSync('late-checkpoint-ui.js');
const prospectiveArchiveScript=fs.readFileSync('prospective-browser-archive.js');
const prospectiveArchiveUiScript=fs.readFileSync('prospective-browser-archive-ui.js');
const port=3000; // Staging public domain is explicitly routed to port 3000
const feed=createMarketFeed();
const venueFeeds=createVenueFeeds();
const kalshiFeeFeed=createKalshiFeeFeed();
const cashV3ChartFeed=createCashV3ChartFeed();
const resolver=createResolver();
// Archive recovery is explicit and only permitted for a single, shared audit volume.
// Legacy journals still refuse an un-recovered manifest and never rotate automatically.
const useArchiveRecovery=process.env.CASH_ARCHIVE_LIVE_RECOVERY==='1';
const shadow=useArchiveRecovery?createLiveRecoveredMonitor({
 directory:process.env.CASH_AUDIT_DIR,quotes:venueFeeds,results:resolver,spot:feed
}):createShadowMonitor({
 quotes:venueFeeds,results:resolver,spot:feed,
 journal:createAuditJournal({exclusiveWriter:process.env.CASH_EXCLUSIVE_JOURNAL_WRITER==='1'})
});
const brtiFeed=createKalshiBrtiFeed();
const orderVerifier=createKalshiOrderVerifier();
const prospective=createProspectiveMonitor({
 quotes:venueFeeds,spot:feed,results:resolver,brti:brtiFeed,
 store:createProspectiveStore()});
const lateCheckpoint=createLateCheckpointMonitor({
 quotes:venueFeeds,spot:feed,results:resolver,brti:brtiFeed,
 feeFeed:kalshiFeeFeed
});
const earlyMove=createEarlyMoveMonitor({quotes:venueFeeds,spot:feed});
const shadowModelLab=createShadowLiveFeed({quotes:venueFeeds,spot:feed});
const server=http.createServer(async(req,res)=>{
  if(await privateSessionGate(req,res,process.env.CASH_PRIVATE_ACCESS_PASSWORD))return;
  if(privateAccessGate(req,res,process.env.CASH_PRIVATE_ACCESS_PASSWORD))return;
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  if(req.method==='GET'&&(req.url==='/'||req.url==='/index.html'||req.url.startsWith('/?'))){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(page);return;
  }
  if(req.method==='GET'&&req.url==='/shadow-browser-archive.js'){
    res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});res.end(shadowArchiveScript);return;
  }
  if(req.method==='GET'&&req.url==='/shadow-browser-archive-ui.js'){
    res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});res.end(shadowArchiveUiScript);return;
  }
  if(req.method==='GET'&&req.url==='/shadow-ui.js'){
    res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});res.end(shadowScript);return;
  }
  if(req.method==='GET'&&req.url==='/diagnostics-ui.js'){
    res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});res.end(diagnosticsScript);return;
  }
  if(req.method==='GET'&&req.url==='/cognition-ui.js'){
    res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});
    res.end(cognitionScript);return;
  }
  if(req.method==='GET'&&req.url==='/view-mode.js'){
    res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});
    res.end(viewModeScript);return;
  }
  if(req.method==='GET'&&req.url==='/prospective-browser-archive.js'){
    res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});
    res.end(prospectiveArchiveScript);return;
  }
  if(req.method==='GET'&&req.url==='/prospective-browser-archive-ui.js'){
    res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});
    res.end(prospectiveArchiveUiScript);return;
  }
  if(req.method==='GET'&&req.url==='/late-checkpoint-ui.js'){
    res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});
    res.end(lateCheckpointScript);return;
  }
  if(req.method==='GET'&&req.url==='/prospective-ui.js'){
    res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});
    res.end(prospectiveScript);return;
  }
  if(req.method==='GET'&&req.url==='/live-check-ui.js'){
    res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});
    res.end(liveCheckScript);return;
  }
  if(req.method==='GET'&&req.url==='/order-verify-ui.js'){
    res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});
    res.end(orderVerifyScript);return;
  }
  if(req.method==='GET'&&req.url==='/api/order-verification-status'){
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify(orderVerifier.publicStatus()));return;
  }
  if(req.method==='POST'&&req.url==='/api/private/recent-order-verify'){
    res.setHeader('Cache-Control','no-store, private');
    const reply=(status,obj)=>{
      res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify(obj));
    };
    if(!orderVerifier.configured){reply(503,{error:'PRIVATE_KALSHI_CONNECTION_NOT_CONFIGURED'});return}
    const {ownerAuthorized}=require('./kalshi-order-verify');
    if(!ownerAuthorized(resolvePrivateConfig().ownerToken,req.headers.authorization)){
      reply(401,{error:'PRIVATE_OWNER_AUTHORIZATION_REQUIRED'});return;
    }
    if(req.headers['transfer-encoding']||Number(req.headers['content-length']||0)>0){
      reply(413,{error:'NO_REQUEST_BODY_ALLOWED'});return;
    }
    try{reply(200,await orderVerifier.verifyRecent(req.headers.authorization));}
    catch(err){
      const code=String(err?.message||'');
      const allow=['FILLS_NOT_CONFIRMED','EXCHANGE_UNAVAILABLE','EXCHANGE_AUTH_FAILED',
       'ORDER_OR_RECORD_NOT_FOUND','ORDER_NOT_CONFIRMED','FILL_INCONSISTENT',
       'FILL_MARKET_MISMATCH','FILL_COUNT_OR_PRICE_INVALID'];
      reply(422,{error:allow.includes(code)?code:'RECENT_ORDER_VERIFICATION_UNAVAILABLE'});
    }
    return;
  }
  if(req.method==='POST'&&req.url==='/api/private/order-verify'){
    res.setHeader('Cache-Control','no-store, private');
    const reply=(status,error)=>{
     res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});
     res.end(JSON.stringify({error}));
    };
    if(!orderVerifier.configured){reply(503,'PRIVATE_KALSHI_CONNECTION_NOT_CONFIGURED');return}
    const {ownerAuthorized}=require('./kalshi-order-verify');
    if(!ownerAuthorized(resolvePrivateConfig().ownerToken,req.headers.authorization)){
      reply(401,'PRIVATE_OWNER_AUTHORIZATION_REQUIRED');return;
    }
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){
      reply(415,'JSON_REQUIRED');return;
    }
    let body='';
    try{
      for await(const chunk of req){
        body+=chunk;
        if(body.length>1000){reply(413,'REQUEST_TOO_LARGE');return}
      }
      const parsed=JSON.parse(body);
      const out=await orderVerifier.verify(parsed?.orderId,req.headers.authorization);
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify(out));
    }catch(err){
      const code=String(err.message||'');
      const publicErrors=new Set(['INVALID_ORDER_ID','NOT_A_VERIFIABLE_KXBTC15M_ORDER',
        'ORDER_NOT_CONFIRMED','FILLS_NOT_CONFIRMED','FILL_MARKET_MISMATCH',
        'FILL_INCONSISTENT','FILL_COUNT_OR_PRICE_INVALID','ORDER_OR_RECORD_NOT_FOUND',
        'EXCHANGE_AUTH_FAILED','EXCHANGE_UNAVAILABLE','OWNER_NOT_AUTHORIZED']);
      reply(422,publicErrors.has(code)?code:'ORDER_VERIFICATION_NOT_AVAILABLE');
    }
    return;
  }
  if(req.method==='GET'&&req.url==='/api/brti-health'){
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify(brtiFeed.health()));return;
  }
  if(req.method==='GET'&&req.url==='/settlement-call-ui.js'){
    res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});
    res.end(settlementCallScript);return;
  }
  if(req.method==='GET'&&req.url==='/early-move-ui.js'){
    res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});
    res.end(earlyMoveScript);return;
  }
  if(req.method==='GET'&&req.url==='/api/early-move'){
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify(earlyMove.snapshot()));return;
  }
  if(req.method==='GET'&&req.url==='/api/late-checkpoint'){
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify(lateCheckpoint.snapshot()));return;
  }
  if(req.method==='GET'&&req.url==='/api/late-checkpoint/export'){
    res.setHeader('Content-Disposition','attachment; filename="CASH-late-checkpoint-unverified.json"');
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify(lateCheckpoint.exportSession(),null,2));return;
  }
  if(req.method==='GET'&&req.url==='/api/model-lab/shadow/status'){
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify(shadowModelLab.view()));return;
  }
  if(req.method==='GET'&&req.url==='/api/model-lab/shadow/export'){
    const snapshot=shadowModelLab.exportSnapshot();
    if(!snapshot){
      res.writeHead(503,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify({status:'SHADOW_DURABLE_FEED_UNAVAILABLE',
       records:0,independentlyQualified:0,ordersAllowed:false}));return;
    }
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify(snapshot));return;
  }
  if(req.method==='GET'&&req.url==='/api/prospective'){
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify(prospective.snapshot()));return;
  }
  if(req.method==='GET'&&req.url==='/api/prospective/export'){
    res.setHeader('Content-Disposition','attachment; filename="CASH-prospective-unverified.json"');
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify(prospective.exportSession(),null,2));return;
  }
  if(req.method==='GET'&&req.url==='/api/live-check'){
    try{
      const [quote,spotQuote]=await Promise.all([venueFeeds.query('Kalshi'),feed.update()]);
      const terminal=assessKalshi15({quote,spot:spotQuote,shadow:shadow.snapshot(),
       fees:kalshiFeeFeed.view()});
      const result=assessLiveCheck({kalshi:quote,spot:spotQuote,terminal,assets:{
       page:page.includes('id="cashSimple"'),simple:simpleUiScript.length>200,
       switcher:viewModeScript.length>200,advanced:kalshi15Script.length>200,
       paper:livePaperScript.length>200
      }});
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify(result));
    }catch{
      res.writeHead(503,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify({version:'CASH_LIVE_OPERATION_CHECK_V1',
       state:'UNAVAILABLE',paperPractice:{realOrdersEnabled:false},
       model:{independentValidatedForecasts:0,canExecuteRealTrade:false}}));
    }
    return;
  }
  if(req.method==='GET'&&req.url==='/simple-ui.js'){
    res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});
    res.end(simpleUiScript);return;
  }
  if(req.method==='GET'&&req.url==='/ambient-market-mood.js'){
    res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});
    res.end(ambientMarketMoodScript);return;
  }
  if(req.method==='GET'&&req.url==='/kalshi15-ui.js'){
    res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});
    res.end(kalshi15Script);return;
  }
  if(req.method==='GET'&&req.url==='/cash-v3.css'){
    res.writeHead(200,{'Content-Type':'text/css; charset=utf-8',
     'Cache-Control':'private, no-store'});res.end(cashV3Css);return;
  }
  if(req.method==='GET'&&req.url==='/cash-v3.js'){
    res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8',
     'Cache-Control':'private, no-store'});res.end(cashV3Js);return;
  }
  if(req.method==='GET'&&req.url==='/api/cash-v3/market'){
    try{
      const [quote,spotQuote,fees]=await Promise.all([
       venueFeeds.query('Kalshi'),feed.update(),kalshiFeeFeed.query()]);
      const official=brtiFeed.forecastingEnabled()?brtiFeed.internal():null;
      const manual=makeManualCalls({quote,spot:official||spotQuote,fees});
      const chart=await cashV3ChartFeed.query({quote,spot:spotQuote});
      const qTime=Date.parse(quote?.fetchedAt);
      const qFresh=quote.status==='live'&&!quote.refreshFailed&&
       Number.isFinite(qTime)&&qTime<=Date.now()+2000&&
       Date.now()-qTime<=12000;
      const safe=n=>Number.isFinite(n)?n:null;
      const payload={
       version:'CASH_MOBILE_V3_MARKET_V1',at:new Date().toISOString(),
       mode:'PRIVATE_RESEARCH_ONLY',
       quote:{
        marketId:typeof quote.marketId==='string'?quote.marketId:null,
        status:qFresh?'LIVE':'STALE_OR_UNAVAILABLE',
        fetchedAt:qFresh?quote.fetchedAt:null,
        endTime:quote.endTime||null,targetPrice:safe(quote.targetPrice),
        targetVerified:quote.targetSource==='KALSHI_FLOOR_STRIKE'&&
         quote.contractRuleStatus==='BRTI_60S_RULE_TEXT_PRESENT',
        yesAsk:qFresh?safe(quote.yesAsk):null,
        noAsk:qFresh?safe(quote.noAsk):null,
        yesBid:qFresh?safe(quote.yesBid):null,
        noBid:qFresh?safe(quote.noBid):null
       },
       spot:{
        status:spotQuote.status,price:spotQuote.status==='live'?safe(spotQuote.price):null,
        fetchedAt:spotQuote.fetchedAt||null,source:spotQuote.source||null,
        isSettlementIndex:false
       },
       chart,manual,
       forecastValidation:{qualified:0,required:100},
       ordersEnabled:false,executionAuthorized:false
      };
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8',
       'Cache-Control':'private, no-store'});
      res.end(JSON.stringify(payload));
    }catch{
      res.writeHead(503,{'Content-Type':'application/json; charset=utf-8',
       'Cache-Control':'private, no-store'});
      res.end(JSON.stringify({version:'CASH_MOBILE_V3_MARKET_V1',
       state:'UNAVAILABLE',ordersEnabled:false,executionAuthorized:false,
       chart:null,manual:{call:'WAIT'},quote:null,spot:null}));
    }
    return;
  }
  if(req.method==='GET'&&req.url==='/manual-calls-ui.js'){
    res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8',
      'Cache-Control':'no-store'});
    res.end(manualCallsScript);return;
  }
  if(['GET','POST'].includes(req.method)&&req.url==='/api/manual-calls'){
    res.setHeader('Cache-Control','no-store, private');
    const reply=(status,obj)=>{
      res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify(obj));
    };
    let position=null;
    if(req.method==='POST'){
      if(req.headers['sec-fetch-site']==='cross-site'){reply(403,{error:'CROSS_SITE_REQUEST_REJECTED'});return}
      if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){
        reply(415,{error:'JSON_REQUIRED'});return;
      }
      try{
        let buf='';for await(const chunk of req){
          buf+=chunk;
          if(buf.length>800){reply(413,{error:'REQUEST_TOO_LARGE'});return}
        }
        const body=JSON.parse(buf);
        if(!body||typeof body!=='object'||Array.isArray(body)||
           !Object.hasOwn(body,'position'))throw Error('Invalid request');
        position=body.position;
      }catch{reply(400,{error:'INVALID_MANUAL_POSITION'});return}
    }
    try{
      const [quote,fees,spotQuote]=await Promise.all([
        venueFeeds.query('Kalshi'),kalshiFeeFeed.query(),feed.update()]);
      // Official BRTI is internal-only and never serialized as raw prices.
      const official=brtiFeed.forecastingEnabled()?brtiFeed.internal():null;
      const report=makeManualCalls({quote,fees,spot:official||spotQuote,position});
      reply(200,report);
    }catch{
      reply(503,{version:'CASH_MANUAL_CALLS_V1',call:'WAIT',
        mode:'EXPERIMENTAL_MANUAL_RESEARCH_ONLY',
        blockers:['SOURCE_UNAVAILABLE'],entry:null,position:null,
        automaticTradingEnabled:false,ordersPlaced:0,
        tradingAuthorization:false,calibratedWinProbability:null,expectedValue:null});
    }
    return;
  }
  if(req.method==='GET'&&req.url==='/manual-assist-ui.js'){
    res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});
    res.end(manualAssistScript);return;
  }
  if(req.method==='GET'&&req.url?.startsWith('/api/manual-assist?')){
    try{
      const params=new URL(req.url,'http://localhost').searchParams;
      const side=params.get('side');
      const rawContracts=params.get('contracts');
      const contracts=/^[1-9][0-9]{0,4}$/.test(rawContracts||'')?Number(rawContracts):0;
      const [quote,fees]=await Promise.all([venueFeeds.query('Kalshi'),kalshiFeeFeed.query()]);
      const report=manualAssist({quote,fees,side,contracts,maxLossUsd:10});
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      res.end(JSON.stringify(report));
    }catch{
      res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      res.end(JSON.stringify({mode:'MANUAL_INFORMATION_ONLY',status:'BLOCKED',blockers:['FEED_UNAVAILABLE'],realOrdersEnabled:false,executionAuthorized:false}));
    }return;
  }
  if(req.method==='GET'&&req.url==='/api/kalshi15'){
    try{
      const [quote,fees]=await Promise.all([venueFeeds.query('Kalshi'),kalshiFeeFeed.query()]);
      const report=assessKalshi15({quote,spot:feed.view(),shadow:shadow.snapshot(),fees});
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify(report));
    }catch{
      res.writeHead(503,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify({version:'CASH_KALSHI15_TERMINAL_V1',
       displayState:'NO_CALL',realTradingAuthorized:false,automaticOrdersEnabled:false,
       independentForecastValidation:0}));
    }return;
  }
  if(req.method==='GET'&&req.url==='/api/cognition'){
    try{
      const diag=createDiagnostics({spot:feed.view(),kalshi:venueFeeds.view('Kalshi'),
        polymarket:venueFeeds.view('Polymarket'),shadow:shadow.snapshot()});
      const report=assessCognition({diagnostics:diag,evaluation:shadow.evaluation()});
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify(report));
    }catch{
      res.writeHead(503,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify({state:'UNAVAILABLE',executionDecision:'ABSTAIN_FROM_REAL_MONEY_TRADING',
        tradingAllowed:false,qualifyingProspectiveContracts:0}));
    }
    return;
  }
  if(req.method==='GET'&&req.url==='/api/diagnostics'){
    const diagnostics=createDiagnostics({spot:feed.view(),kalshi:venueFeeds.view('Kalshi'),
      polymarket:venueFeeds.view('Polymarket'),shadow:shadow.snapshot()});
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify(diagnostics));return;
  }
  if(req.method==='GET'&&req.url==='/evaluation-ui.js'){
    res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});res.end(evaluationScript);return;
  }
  if(req.method==='GET'&&req.url==='/api/audit-preflight'){
    try{
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify(shadow.auditPreflight()));
    }catch{
      res.writeHead(503,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify({state:'UNAVAILABLE',qualifyingProspectiveContracts:0}));
    }
    return;
  }
  if(req.method==='GET'&&req.url==='/api/evaluation'){
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify(shadow.evaluation()));return;
  }
  if(req.method==='GET'&&req.url==='/api/shadow'){
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify(shadow.snapshot()));return;
  }
  if(req.method==='GET'&&req.url==='/api/shadow/export'){
    res.setHeader('Content-Disposition','attachment; filename="CASH-shadow-session-not-verified.json"');
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify(shadow.exportSession(),null,2));return;
  }
  if(req.method==='GET'&&req.url==='/live-paper.js'){
    res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});res.end(livePaperScript);return;
  }
  if(req.method==='GET'&&req.url?.startsWith('/api/result?')){
    const query=new URL(req.url,'http://localhost').searchParams;
    const venue=query.get('venue'),marketId=query.get('marketId'),slug=query.get('slug');
    try{
      const result=await resolver.lookup({venue,marketId,slug});
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify(result));
    }catch(e){
      res.writeHead(400,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify({status:'invalid',message:'Invalid market identifier'}));
    }
    return;
  }
  if(req.method==='GET'&&req.url==='/health'){
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,mode:'paper-only',spotFeed:feed.view().status,venueFeeds:{Kalshi:venueFeeds.view('Kalshi').status,Polymarket:venueFeeds.view('Polymarket').status},shadowStorage:shadow.snapshot().storageMode,qualifyingForecasts:0}));return;
  }
  if(req.method==='GET'&&req.url?.startsWith('/api/markets?')){
    const venue=new URL(req.url,'http://localhost').searchParams.get('venue');
    if(!['Kalshi','Polymarket'].includes(venue)){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Unsupported market venue'}));return}
    try{
      const result=await venueFeeds.query(venue);
      res.writeHead(result.status==='unavailable'?503:200,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify(result));
    }catch(e){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({venue,status:'unavailable'}))}
    return;
  }
  if(req.method==='GET'&&req.url==='/api/spot'){
    try{
      const snapshot=await feed.update();
      res.writeHead(snapshot.status==='unavailable'?503:200,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify(snapshot));
    }catch(e){
      res.writeHead(503,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify({status:'unavailable',price:null,source:null,history:[],message:'Public spot feed temporarily unavailable'}));
    }
    return;
  }
  res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');
});
if(require.main===module)server.listen(port,'0.0.0.0',()=>{
  console.log('CASH paper app listening on 0.0.0.0:'+port);
  // Redacted startup configuration diagnostics; never log credentials, lengths,
  // key IDs, PEM contents, authorization headers or owner tokens.
  const privateConfig=resolvePrivateConfig();
  const keyFormat=require('./kalshi-brti').readConfig(privateConfig.keyId,privateConfig.privateKeyPem).state;
  const ownerValid=typeof privateConfig.ownerToken==='string'&&
    privateConfig.ownerToken.length>=32&&privateConfig.ownerToken.length<=512;
  const keyIdShape=typeof privateConfig.keyId==='string'&&
    /^[-a-zA-Z0-9]{12,100}$/.test(privateConfig.keyId);
  console.log('CASH private verifier config: keyIdFormat='+
   (keyIdShape?'ACCEPTED':'INVALID_OR_MISSING')+
   ', keyPair='+keyFormat+
   ', ownerToken='+(ownerValid?'ACCEPTED':'INVALID_OR_MISSING')+
   ', orders=DISABLED');
  // One Kalshi authenticated read-only GET, at startup, without any account
  // order content being logged or returned publicly. No order placement.
  orderVerifier.probeConnection().then(v=>{
    console.log('CASH Kalshi private read access: '+v.exchangeReadAuthState+
      ', account records EXCLUDED, orders=DISABLED');
  }).catch(()=>console.log('CASH Kalshi private read access: PROBE_UNAVAILABLE, orders=DISABLED'));
  let previous='';
  const probe=()=>feed.update().then(quote=>{
    const state=quote.status+':'+(quote.source||'none');
    if(state!==previous){console.log('CASH public BTC spot feed status: '+state);previous=state}
  }).catch(()=>{if(previous!=='error'){console.log('CASH public BTC spot feed status: error');previous='error'}});
  probe();
  const timer=setInterval(probe,15000);timer.unref();
  const venueStates={Kalshi:'',Polymarket:''};
  const checkVenues=()=>['Kalshi','Polymarket'].forEach(venue=>{
    venueFeeds.query(venue).then(value=>{if(venueStates[venue]!==value.status){console.log('CASH '+venue+' public market feed status: '+value.status);venueStates[venue]=value.status}})
      .catch(()=>{if(venueStates[venue]!=='error'){console.log('CASH '+venue+' public market feed status: error');venueStates[venue]='error'}});
  });
  checkVenues();
  const venueTimer=setInterval(checkVenues,15000);venueTimer.unref();
  shadow.scan().catch(()=>{});
  const shadowTimer=setInterval(()=>shadow.scan().catch(()=>{}),20000);shadowTimer.unref();
  // Publish LIMITED prospective pipeline diagnostics to deployment logs.
  // No private index values, market prices, credentials or trade actions.
  // With the live site not directly fetchable from our research environment,
  // these records distinguish "server running" from "forecasts captured".
  let lastProspectiveLog='';
  const checkProspective=()=>prospective.scan().then(()=>{
    const v=prospective.snapshot(),readiness=v.captureReadiness||{};
    const identity=[readiness.lastReason,v.records,v.officiallyScored,v.failures].join(':');
    if(identity!==lastProspectiveLog||v.scans%3===0){
      console.log('CASH prospective research: model='+v.model+
       ', reason='+readiness.lastReason+', scans='+v.scans+
       ', frozen='+v.records+', active='+(v.active?.side||'NONE')+
       ', scored='+v.officiallyScored+', failures='+v.failures+
       ', audit='+v.storage+', qualified=0/100, orders=DISABLED');
      lastProspectiveLog=identity;
    }
  }).catch(()=>console.log('CASH prospective research: scanner exception; no trading authorization'));
  checkProspective();
  const prospectiveTimer=setInterval(checkProspective,20000);
  prospectiveTimer.unref();
  // Isolated Model Lab: record first, fsync to explicitly mounted audit
  // storage, then expose only hash-chain snapshots. No orders or qualification.
  if(shadowModelLab.enabled){
    const shadowLabScan=()=>shadowModelLab.scan().then(s=>{
      if(s.status==='FROZEN_AND_PERSISTED'||s.status==='PERSISTENCE_FAILURE')
       console.log('CASH Model Lab durable shadow: '+s.status+
        ', records='+s.records+', qualified=0, orders=DISABLED');
    }).catch(()=>console.log('CASH Model Lab shadow unavailable; orders=DISABLED'));
    shadowLabScan();
    const shadowLabTimer=setInterval(shadowLabScan,20000);
    shadowLabTimer.unref();
  }else console.log('CASH Model Lab shadow: durable audit volume not configured; collection OFF');
  // Fixed, late pre-expiry shadow experiment. Never overwrites V3 early calls.
  // Cache-sharing read-only feeds, separate contract IDs and denominators.
  let lastLateLog='';
  const checkLate=()=>lateCheckpoint.scan().then(()=>{
    const v=lateCheckpoint.snapshot(),d=v.scorecard.overall;
    const key=[v.records,d.scoredDirectional,d.waits,v.failures,v.lastReason].join(':');
    if(key!==lastLateLog&&
      (v.records>0||v.scans%12===1||v.failures>0)){
      console.log('CASH late checkpoint: model='+v.model+
       ', reason='+v.lastReason+', scans='+v.scans+
       ', frozen='+v.records+', directional='+d.directional+
       ', waits='+d.waits+', scored='+d.scoredDirectional+
       ', qualified=0/100, orders=DISABLED');
      lastLateLog=key;
    }
  }).catch(()=>console.log('CASH late checkpoint: research scan unavailable; orders=DISABLED'));
  checkLate();
  const lateTimer=setInterval(checkLate,20000);
  lateTimer.unref();
  // Legacy 45s *spot* experiment is separate from Kalshi settlement V3.
  // No order requests, no claims about Kalshi contract price or settlement.
  let lastEarlyLog='';
  const scanEarly=()=>earlyMove.scan().then(report=>{
    const key=[report.frozen,report.scored,report.hits,report.misses,
     report.unobserved,report.failures,report.lastReason].join(':');
    if(key!==lastEarlyLog&&
       (report.frozen>0||report.scans%12===1||report.failures>0)){
      console.log('CASH early spot research: 45s, scans='+report.scans+
       ', frozen='+report.frozen+', directional='+report.directional+
       ', scored='+report.scored+', hits='+report.hits+', misses='+report.misses+
       ', unobserved='+report.unobserved+', reason='+report.lastReason+
       ', validated=0/100, orders=DISABLED');
      lastEarlyLog=key;
    }
  }).catch(()=>console.log('CASH early spot research: scanner exception; orders=DISABLED'));
  scanEarly();
  const earlyTimer=setInterval(scanEarly,5000);
  earlyTimer.unref();
  // Owner verification keys must NOT implicitly trigger licensed BRTI
  // polling. Enable official-index reads only with separate owner opt-in.
  if(process.env.CASH_USE_AUTHORIZED_BRTI_FOR_FORECASTS==='true'){
    brtiFeed.update().catch(()=>{});
    const brtiTimer=setInterval(()=>brtiFeed.update().catch(()=>{}),15000);
    brtiTimer.unref();
  }
  console.log('CASH shadow baseline monitor: '+shadow.snapshot().storageMode+', '+shadow.snapshot().recoveredEvents+' recovered events, 0 qualifying forecasts');
  // Real route-level smoke test, with separate labels for app health and
  // volatile public market feeds. Runs only against this local server.
  runStartupSmoke({port,authorization:process.env.CASH_PRIVATE_ACCESS_PASSWORD===undefined?
   undefined:'Basic '+Buffer.from('cash:'+process.env.CASH_PRIVATE_ACCESS_PASSWORD).toString('base64')}).then(r=>{
    console.log('CASH HTTP startup smoke: '+r.routeChecksPassed+'/'+r.httpRoutesChecked+
      ' routes, app='+ (r.passed?'OK':'FAIL')+
      ', market='+r.observedDataState+', KalshiFresh='+r.kalshiQuoteFresh+
      ', orders=DISABLED, validated=0/100'+
      (r.failedPaths.length?' failed='+r.failedPaths.join(','):''));
  }).catch(()=>console.log('CASH HTTP startup smoke: UNAVAILABLE, trading=DISABLED'));

});
module.exports={server};
