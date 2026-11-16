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
