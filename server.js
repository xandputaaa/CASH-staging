'use strict';
const http=require('node:http'),fs=require('node:fs');
const {createMarketFeed}=require('./market-feed');
const {createVenueFeeds}=require('./venue-feeds');
const page=fs.readFileSync('index.html');
const port=3000; // Staging public domain is explicitly routed to port 3000
const feed=createMarketFeed();
const venueFeeds=createVenueFeeds();
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  if(req.method==='GET'&&(req.url==='/'||req.url==='/index.html'||req.url.startsWith('/?'))){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(page);return;
  }
  if(req.method==='GET'&&req.url==='/health'){
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,mode:'paper-only',spotFeed:feed.view().status,venueFeeds:{Kalshi:venueFeeds.view('Kalshi').status,Polymarket:venueFeeds.view('Polymarket').status}}));return;
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
});
module.exports={server};
