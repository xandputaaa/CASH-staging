'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {readConfig,signedHeaders,parseBrtiResult,createKalshiBrtiFeed}=require('../kalshi-brti');
const at=Date.parse('2026-11-16T23:50:00Z');
test('no Kalshi credentials makes zero outside index requests',async()=>{
 let calls=0;
 const feed=createKalshiBrtiFeed({clock:()=>at,keyId:null,privateKeyPem:null,
  fetchImpl:async()=>{calls++;throw Error('should never fetch')}});
 assert.equal((await feed.update()).state,'NOT_CONFIGURED');
 assert.equal(calls,0);
 assert.equal(feed.internal(),null);
 assert.equal(feed.health().rawValueExposed,false);
 assert.equal(feed.health().usedForForecasts,false);
});
test('signed index read GET has correct Ed25519 path-only signing and no write privilege',()=>{
 const kp=crypto.generateKeyPairSync('ed25519');
 const pem=kp.privateKey.export({format:'pem',type:'pkcs8'}).toString();
 const c=readConfig('key-id-abcdef123456',pem);
 assert.equal(c.state,'CONFIGURED');
 const h=signedHeaders(c,at);
 const msg=String(at)+'GET'+'/trade-api/v2/cfbenchmarks/values';
 assert.equal(crypto.verify(null,Buffer.from(msg),kp.publicKey,
  Buffer.from(h['KALSHI-ACCESS-SIGNATURE'],'base64')),true);
 assert.equal('KALSHI-ACCESS-PRIVATE-KEY' in h,false);
});
test('malformed credentials are not accepted as configured and are not leaked',()=>{
 assert.equal(readConfig('id', 'wrong').state,'INVALID_CONFIG');
 assert.equal(readConfig('',null).state,'NOT_CONFIGURED');
});
test('Kalshi BRTI REST data parser accepts recent upstream values and ignores amended points',()=>{
 const points=[-10000,-9000,-8000].map((dt,i)=>({time:at+dt,value:String(86000+i)}));
 const val=parseBrtiResult({data:{payload:[...points,{time:at-1000,value:'86004',amendTime:at}] }},at);
 assert.equal(val.latest.price,86002);
 assert.equal(val.ageMs,8000);
 assert.equal(val.history.length,3);
 assert.throws(()=>parseBrtiResult({data:{payload:[{time:at-60000,value:'bad'}]}},at));
});
test('authorized read-only BRTI data remains internal; site health shows timestamps only',async()=>{
 const kp=crypto.generateKeyPairSync('ed25519');
 const pem=kp.privateKey.export({format:'pem',type:'pkcs8'}).toString();
 let count=0;
 const feed=createKalshiBrtiFeed({keyId:'key-id-abcdef123456',privateKeyPem:pem,
  clock:()=>at,fetchImpl:async(url,opts)=>{
    count++;assert.match(url,/\/cfbenchmarks\/values\?id=BRTI/);
    assert.equal(opts.method,'GET');
    return {ok:true,json:async()=>({data:{payload:[
      {time:at-1000,value:'86234.21'}]}})};
  }});
 const status=await feed.update();
 assert.equal(status.state,'LIVE');
 assert.equal(status.latestValueAt,new Date(at-1000).toISOString());
 assert.equal(status.rawValueExposed,false);
 assert.equal(JSON.stringify(status).includes('86234'),false);
 assert.equal(feed.internal().price,86234.21);
 await feed.update();assert.equal(count,1);
});
test('authorization failure discloses no token, key or raw authenticated response',async()=>{
 const kp=crypto.generateKeyPairSync('ed25519');
 const pem=kp.privateKey.export({format:'pem',type:'pkcs8'}).toString();
 const feed=createKalshiBrtiFeed({keyId:'key-id-abcdef123456',privateKeyPem:pem,clock:()=>at,
  fetchImpl:async()=>({ok:false,status:403})});
 const s=await feed.update();
 assert.equal(s.state,'NOT_ENTITLED');
 assert.equal(s.tradingPermission,false);
 assert.equal(s.rawHistoryExposed,false);
});
