'use strict';
const http=require('node:http'),fs=require('node:fs');
const {createMarketFeed}=require('./market-feed');
const {createVenueFeeds}=require('./venue-feeds');
const {createResolver}=require('./resolution-feed');
const {createShadowMonitor}=require('./shadow-monitor');
const {createAuditJournal}=require('./audit-journal');
const page=fs.readFileSync('index.html');
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
const {createKalshiFeeFeed}=require('./kalshi-fees');
const {assessCognition}=require('./cash-cognition');
const {createDiagnostics}=require('./diagnostics');
const {createProspectiveMonitor}=require('./prospective-monitor');
const {createProspectiveStore}=require('./prospective-store');
const {createKalshiBrtiFeed}=require('./kalshi-brti');
const {createKalshiOrderVerifier}=require('./kalshi-order-verify');
const {resolvePrivateConfig}=require('./private-key-config');
const orderVerifyScript=fs.readFileSync('order-verify-ui.js');
const {assessLiveCheck}=require('./live-check');
const {runStartupSmoke}=require('./startup-smoke');
const liveCheckScript=fs.readFileSync('live-check-ui.js');
const prospectiveScript=fs.readFileSync('prospective-ui.js');
const port=3000; // Staging public domain is explicitly routed to port 3000
const feed=createMarketFeed();
const venueFeeds=createVenueFeeds();
const kalshiFeeFeed=createKalshiFeeFeed();
const resolver=createResolver();
const auditJournal=createAuditJournal();
const shadow=createShadowMonitor({quotes:venueFeeds,results:resolver,journal:auditJournal,spot:feed});
const brtiFeed=createKalshiBrtiFeed();
const orderVerifier=createKalshiOrderVerifier();
const prospective=createProspectiveMonitor({
 quotes:venueFeeds,spot:feed,results:resolver,brti:brtiFeed,
 store:createProspectiveStore()});
const server=http.createServer(async(req,res)=>{
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
  if(req.method==='GET'&&req.url==='/kalshi15-ui.js'){
    res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});
    res.end(kalshi15Script);return;
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
  runStartupSmoke({port}).then(r=>{
    console.log('CASH HTTP startup smoke: '+r.routeChecksPassed+'/'+r.httpRoutesChecked+
      ' routes, app='+ (r.passed?'OK':'FAIL')+
      ', market='+r.observedDataState+', KalshiFresh='+r.kalshiQuoteFresh+
      ', orders=DISABLED, validated=0/100'+
      (r.failedPaths.length?' failed='+r.failedPaths.join(','):''));
  }).catch(()=>console.log('CASH HTTP startup smoke: UNAVAILABLE, trading=DISABLED'));

});
module.exports={server};
