'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const fs=require('node:fs');
const {createArchive,verifySnapshot,FULL,REDACTED,FORMAT}=require('../prospective-browser-archive');
function storage(){
 const contents=new Map();
 return {getItem:k=>contents.get(k)||null,setItem:(k,v)=>contents.set(k,v),
  removeItem:k=>contents.delete(k)};
}
const now=Date.parse('2026-11-17T11:40:00Z');
const market='KXBTC15M-26NOV170445-45';
function event(type,payload,previousHash,sequence,recordedAt){
 const body={sequence,type,recordedAt:new Date(recordedAt).toISOString(),payload,previousHash};
 return {...body,hash:crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')};
}
function snapshot({redacted=false,scored=false,marketId=market,time=now}={}){
 const f=event('FORECAST',{model:'KXBTC15M_SETTLEMENT_EARLY_V3',
  marketId,at:new Date(time).toISOString(),endTime:new Date(time+180000).toISOString(),
  side:'YES',validation:'UNVALIDATED_PROXY_MODEL',realMoneyAuthorized:false},
  'GENESIS',1,time);
 const events=[f];
 if(scored)events.push(event('OUTCOME',{marketId,winner:'YES'},f.hash,2,time+230000));
 const rows=redacted?events.map(({sequence,type,recordedAt,hash,previousHash})=>
  ({sequence,type,recordedAt,hash,previousHash})):events;
 return {format:redacted?REDACTED:FULL,version:'CASH_PROSPECTIVE_KALSHI_V1',
  model:'KXBTC15M_SETTLEMENT_EARLY_V3',qualifiedCount:0,
  independentlyTimeAttested:false,modelCalibrated:false,tradingAuthorized:false,
  automatedOrdersEnabled:false,events:rows,headHash:events.at(-1).hash};
}
const open=s=>createArchive({storage:s,cryptoImpl:crypto.webcrypto,clock:()=>now});
test('browser copies new forecast journal and retains growing verified prefix without double counting',async()=>{
 const st=storage(),app=open(st);
 const first=snapshot(),later=snapshot({scored:true});
 assert.equal((await app.capture(first)).saved,true);
 assert.equal((await app.capture(later)).saved,true);
 assert.equal((await app.capture(first)).saved,false);
 const restored=open(st);
 assert.equal(restored.summary().sessions,1);
 assert.equal(restored.summary().uniqueProxyMarkets,1);
 assert.equal(restored.summary().fullEvents,2);
 assert.equal(restored.summary().qualifiedCount,0);
 const backup=JSON.parse(restored.exportJson());
 assert.equal(backup.format,FORMAT);
 assert.equal(backup.qualifyingForModelAccuracy,false);
 assert.match(backup.warning,/No independent timestamps/);
});
test('browser refuses altered event, duplicate market, bad head or fake qualified count',async()=>{
 const st=storage(),app=open(st),a=snapshot();
 await verifySnapshot(a,crypto.webcrypto);
 const tampered=structuredClone(a);
 tampered.events[0].payload.side='NO';
 await assert.rejects(app.capture(tampered),/checksum mismatch/);
 await assert.rejects(app.capture({...a,headHash:'a'.repeat(64)}),/head mismatch/);
 await assert.rejects(app.capture({...a,qualifiedCount:100}),/unsafe/);
 const repeated=structuredClone(a);
 const duplicate=event('FORECAST',repeated.events[0].payload,
  repeated.events[0].hash,2,now+5000);
 repeated.events.push(duplicate);repeated.headHash=duplicate.hash;
 await assert.rejects(app.capture(repeated),/duplicate frozen forecast/);
 assert.equal(app.summary().sessions,0);
});
test('licensed index exports are stored as non-verifiable redacted commitments',async()=>{
 const st=storage(),app=open(st),redacted=snapshot({redacted:true});
 assert.equal((await app.capture(redacted)).saved,true);
 assert.equal(app.summary().redactedCommitments,1);
 assert.equal(app.summary().uniqueProxyMarkets,0);
 assert.equal(JSON.stringify(app.exportJson()).includes('UNVALIDATED_PROXY_MODEL'),false);
 const bad=structuredClone(redacted);
 bad.events[0].payload={sensitive:'should never be accepted'};
 await assert.rejects(app.capture(bad),/unexpectedly contains a payload/);
 const newer=structuredClone(redacted);
 newer.events[0].hash='f'.repeat(64);newer.headHash='f'.repeat(64);
 // Structurally consistent redacted hashes cannot be recomputed; never call them verified.
 assert.equal((await app.capture(newer)).saved,true);
 assert.equal(app.summary().redactedCommitments,2);
});
test('import verifies entire backup atomically and refuses mismatched history',async()=>{
 const st=storage(),app=open(st),first=snapshot(),second=snapshot({marketId:'KXBTC15M-OTHER-01',time:now+300000});
 await app.capture(first);
 const broken=structuredClone(second);
 broken.events[0].payload.side='NO';
 const bundle={format:FORMAT,qualifyingForModelAccuracy:false,sessions:[
  {id:second.events[0].hash+':'+second.format,savedAt:new Date(now).toISOString(),snapshot:second},
  {id:broken.events[0].hash+':'+broken.format,savedAt:new Date(now).toISOString(),snapshot:broken}
 ]};
 await assert.rejects(app.importJson(JSON.stringify(bundle)),/duplicate|checksum/);
 assert.equal(app.summary().sessions,1);
 assert.equal((await app.importJson(JSON.stringify(second))).saved,true);
 assert.equal(app.summary().uniqueProxyMarkets,2);
});
test('no silent eviction or overwrite when local session capacity reached',async()=>{
 const st=storage(),app=open(st);
 for(let i=0;i<8;i++)await app.capture(snapshot({marketId:'KXBTC15M-TEST-'+String(i).padStart(2,'0'),
  time:now+i*1200000}));
 assert.equal(app.summary().sessions,8);
 await assert.rejects(app.capture(snapshot({marketId:'KXBTC15M-TEST-99',
  time:now+12000000})),/capacity reached/);
 assert.equal(app.summary().sessions,8);
});
test('CASH serves forecast browser archive and controls in simple settlement UI',()=>{
 const html=fs.readFileSync('index.html','utf8');
 const server=fs.readFileSync('server.js','utf8');
 assert.match(html,/id="cashProspectiveArchive"/);
 assert.match(html,/id="pfaDownload"/);
 assert.match(html,/id="pfaRestore"/);
 assert.match(html,/src="\/prospective-browser-archive\.js"/);
 assert.match(html,/src="\/prospective-browser-archive-ui\.js"/);
 assert.match(server,/req.url==='\/prospective-browser-archive.js'/);
 assert.match(server,/req.url==='\/prospective-browser-archive-ui.js'/);
});
