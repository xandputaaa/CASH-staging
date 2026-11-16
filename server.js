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
const {createDiagnostics}=require('./diagnostics');
const port=3000; // Staging public domain is explicitly routed to port 3000
const feed=createMarketFeed();
const venueFeeds=createVenueFeeds();
const resolver=createResolver();
const auditJournal=createAuditJournal();
const shadow=createShadowMonitor({quotes:venueFeeds,results:resolver,journal:auditJournal,spot:feed});
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
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
  console.log('CASH shadow baseline monitor: '+shadow.snapshot().storageMode+', '+shadow.snapshot().recoveredEvents+' recovered events, 0 qualifying forecasts');
});
module.exports={server};
