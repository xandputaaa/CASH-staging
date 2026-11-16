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
