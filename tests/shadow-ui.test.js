'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync('shadow-ui.js','utf8'),html=fs.readFileSync('index.html','utf8');
function app(data,{fail=false}={}){
 const map=new Map();
 const document={hidden:false,getElementById(id){if(!map.has(id))map.set(id,{textContent:'',innerHTML:'',className:''});return map.get(id)},addEventListener(){}};
 const fetch=async()=>{if(fail)throw Error('offline');return {ok:true,json:async()=>data}};
 const ctx=vm.createContext({document,fetch,Date,AbortController,setTimeout,clearTimeout,setInterval:()=>0});
 vm.runInContext(script,ctx);
 return {get:id=>document.getElementById(id)};
}
const valid={
 mode:'PUBLIC_MARKET_FAVORED_ASK_V1',storageMode:'VOLATILE_SERVER_SESSION',
 qualifyingForModelAccuracy:false,observed:2,pending:1,settled:1,
 baselineDirectionalAccuracy:1,bootAt:new Date().toISOString(),lastScanAt:new Date().toISOString(),
 recent:[{venue:'Kalshi',marketId:'KXBTC15M-TEST',baselineSide:'YES',leadMs:150000,status:'CORRECT'}]
};
test('shadow UI displays volatile nonqualifying results rather than verified AI accuracy',async()=>{
 const a=app(valid);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(a.get('shadowState').textContent,'SESSION BASELINE · NOT VERIFIED');
 assert.equal(a.get('shadowCount').textContent,'2');
 assert.equal(a.get('shadowAccuracy').textContent,'100.0%');
 assert.equal(a.get('shadowGate').textContent,'0 / 100 qualifying prospective model predictions');
 assert.match(a.get('shadowRows').innerHTML,/KXBTC15M-TEST/);
});
test('shadow UI fails closed when endpoint is unavailable or changes validity fields',async()=>{
 const a=app(valid,{fail:true});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(a.get('shadowState').textContent,'MONITOR UNAVAILABLE');
 const b=app({...valid,qualifyingForModelAccuracy:true});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(b.get('shadowState').textContent,'MONITOR UNAVAILABLE');
});
test('shadow watch explains missing durability and independent prediction validation',()=>{
 assert.match(html,/id="shadowMonitor"/);
 assert.match(html,/not independent AI forecasting/);
 assert.match(html,/Server memory resets when Railway restarts or redeploys/);
 assert.match(html,/not tamper-proof timestamps/);
});

test('shadow UI reports configured filesystem replay without calling it qualified data',async()=>{
 const a=app({...valid,storageMode:'FILESYSTEM_JOURNAL_UNVERIFIED',recoveredEvents:9});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(a.get('shadowState').textContent,'FILESYSTEM JOURNAL · UNVERIFIED');
 assert.match(a.get('shadowStorageNote').textContent,/9 events were replayed/);
 assert.match(a.get('shadowStorageNote').textContent,/NOT verified/);
 assert.equal(a.get('shadowGate').textContent,'0 / 100 qualifying prospective model predictions');
});
test('shadow UI explicitly states volatility when Railway volume is not mounted',async()=>{
 const a=app({...valid,recoveredEvents:0});
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(a.get('shadowStorageNote').textContent,/No persistent Railway volume attached/);
});

test('spot momentum candidate metrics are kept apart from market-favored baseline and do not qualify',async()=>{
 const a=app({...valid,spotCandidateObservations:4,spotCandidateSettled:2,spotCandidateCorrect:1,spotCandidateAccuracy:.5,spotCandidateQualified:false,
  recent:[{...valid.recent[0],winner:'NO',status:'INCORRECT',spotCandidate:{predictedContractSide:'YES'}}]});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(a.get('spotCandidateCount').textContent,'4');
 assert.equal(a.get('spotCandidateSettled').textContent,'2');
 assert.equal(a.get('spotCandidateCorrect').textContent,'1');
 assert.equal(a.get('spotCandidateAccuracy').textContent,'50.0%');
 assert.match(a.get('shadowRows').innerHTML,/YES · miss/);
 assert.equal(a.get('shadowGate').textContent,'0 / 100 qualifying prospective model predictions');
});
test('shadow UI refuses a falsely qualified spot candidate payload',async()=>{
 const a=app({...valid,spotCandidateQualified:true});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(a.get('shadowState').textContent,'MONITOR UNAVAILABLE');
});
test('shadow markup explicitly says experimental candidate is not calibrated or settlement reference',()=>{
 assert.match(html,/EXPERIMENTAL SPOT MOMENTUM · 90S/);
 assert.match(html,/does not use prediction-market prices/);
 assert.match(html,/do not qualify toward the 100-contract gate/);
});
