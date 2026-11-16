'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('live-paper.js','utf8');
const ticker='KXBTC15M-26NOV160930-00',polyId='0x'+'a'.repeat(64);
function app({shared=new Map(),venueStatus='live'}={}){
 const now={ms:Date.now()},elements=new Map(),calls=[];
 const document={hidden:false,getElementById(id){
  if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:'',disabled:false,className:''});
  return elements.get(id);
 },addEventListener(){}};
 const localStorage={getItem:key=>shared.get(key)||null,setItem:(key,value)=>shared.set(key,value)};
 class FakeDate extends Date{constructor(...args){super(...args.length?args:[now.ms])}static now(){return now.ms}}
 const quote=venue=>venue==='Kalshi'?{venue:'Kalshi',status:venueStatus,marketId:ticker,title:'BTC up in next 15 mins',endTime:new Date(now.ms+20000).toISOString(),fetchedAt:new Date(now.ms).toISOString(),yesAsk:.55,noAsk:.46}:
 {venue:'Polymarket',status:venueStatus,marketId:polyId,slug:'btc-updown-5m-'+Math.floor(now.ms/300000)*300,title:'Bitcoin Up or Down 5m',endTime:new Date(now.ms+20000).toISOString(),fetchedAt:new Date(now.ms).toISOString(),upAsk:.62,downAsk:.4};
 let result={status:'pending'};
 const fetch=async url=>{calls.push(url);const venue=url.includes('Polymarket')?'Polymarket':'Kalshi';const value=url.startsWith('/api/result?')?{...result,marketId:venue==='Kalshi'?ticker:polyId,venue,checkedAt:new Date(now.ms).toISOString()}:quote(venue);return {ok:true,json:async()=>value}};
 const window={},ctx=vm.createContext({window,document,localStorage,fetch,Date:FakeDate,AbortController,setTimeout,clearTimeout,setInterval:()=>0,confirm:()=>true,URLSearchParams,encodeURIComponent});
 vm.runInContext(source,ctx);
 return {run:x=>vm.runInContext(x,ctx),get:id=>document.getElementById(id),now,calls,shared,setResult:x=>{result=x}};
}
test('market-linked paper entry uses observed ASK and preserves original timestamp',async()=>{
 const a=app();await a.run("window.CASHLivePaper.place('Kalshi','YES')");
 const saved=JSON.parse(a.shared.get('cash-live-paper-v1'));
 assert.equal(saved.balance,95);assert.equal(saved.entries.length,1);
 assert.equal(saved.entries[0].marketId,ticker);assert.equal(saved.entries[0].price,.55);
 assert.equal(saved.entries[0].status,'PENDING');assert.equal(a.get('lpBalance').textContent,'$95.00');
});
test('stale quote blocks paper entry without reserving funds',async()=>{
 const a=app({venueStatus:'stale'});await a.run("window.CASHLivePaper.place('Kalshi','YES')");
 assert.equal(a.get('lpBalance').textContent,'$100.00');assert.match(a.get('lpMessage').textContent,/No position recorded/);
});
test('duplicate entries for same contract and side are rejected',async()=>{
 const a=app();await a.run("window.CASHLivePaper.place('Kalshi','YES')");
 await a.run("window.CASHLivePaper.place('Kalshi','YES')");
 assert.equal(JSON.parse(a.shared.get('cash-live-paper-v1')).entries.length,1);
});
test('paper entry persists after simulated browser refresh',async()=>{
 const shared=new Map(),a=app({shared});await a.run("window.CASHLivePaper.place('Polymarket','UP')");
 const b=app({shared});assert.equal(b.get('lpBalance').textContent,'$95.00');assert.match(b.get('lpLedger').innerHTML,/Polymarket/);
});
test('expired paper position stays pending unless official result verifies it',async()=>{
 const a=app();await a.run("window.CASHLivePaper.place('Kalshi','YES')");
 a.now.ms+=25000;await a.run("window.CASHLivePaper.check()");
 assert.equal(JSON.parse(a.shared.get('cash-live-paper-v1')).entries[0].status,'PENDING');assert.equal(a.get('lpBalance').textContent,'$95.00');
});
test('confirmed official result updates paper balance only after expiry',async()=>{
 const a=app();await a.run("window.CASHLivePaper.place('Kalshi','YES')");
 a.setResult({status:'verified',winner:'YES',source:'Kalshi public market result'});
 a.now.ms+=25000;await a.run("window.CASHLivePaper.check()");
 const stored=JSON.parse(a.shared.get('cash-live-paper-v1'));
 assert.equal(stored.entries[0].status,'WON');assert.equal(stored.entries[0].resultSource,'Kalshi public market result');
 assert.ok(stored.balance>104&&stored.balance<105);
});
test('local live paper journal is separate from original fictional paper wallet',async()=>{
 const a=app();await a.run("window.CASHLivePaper.place('Kalshi','NO')");
 assert.equal(a.shared.has('cash-paper-v1'),false);assert.equal(a.shared.has('cash-live-paper-v1'),true);
});
