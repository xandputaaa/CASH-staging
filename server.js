'use strict';
const http=require('node:http'),fs=require('node:fs');
const {createMarketFeed}=require('./market-feed');
const page=fs.readFileSync('index.html');
const port=Number(process.env.PORT)||3000;
const feed=createMarketFeed();
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  if(req.method==='GET'&&(req.url==='/'||req.url==='/index.html'||req.url.startsWith('/?'))){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(page);return;
  }
  if(req.method==='GET'&&req.url==='/health'){
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,mode:'paper-only',spotFeed:feed.view().status}));return;
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
if(require.main===module)server.listen(port,'0.0.0.0',()=>console.log('CASH paper app listening on 0.0.0.0:'+port));
module.exports={server};
