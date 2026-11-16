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
 class MockFileReader{readAsText(file){this.result=file.content;this.onload?.()}};
 const window={},ctx=vm.createContext({window,document,localStorage,fetch,Date:FakeDate,FileReader:MockFileReader,AbortController,setTimeout,clearTimeout,setInterval:()=>0,confirm:()=>true,URLSearchParams,encodeURIComponent});
 vm.runInContext(source,ctx);
 return {run:x=>vm.runInContext(x,ctx),get:id=>document.getElementById(id),now,calls,shared,setResult:x=>{
  result=x?.status==='verified'?{
    confirmationCount:2,firstObservedAt:new Date(now.ms).toISOString(),evidenceSha256:'a'.repeat(64),
    evidenceSourceUrl:'https://external-api.kalshi.com/trade-api/v2/markets/'+ticker,
    evidenceSnapshot:{ticker,status:'settled',result:x.winner},...x
  }:x
 }};
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

test('live paper journal can be restored from an exported JSON backup',async()=>{
 const first=app();await first.run("window.CASHLivePaper.place('Kalshi','YES')");
 const saved=JSON.parse(first.shared.get('cash-live-paper-v1'));
 const backup={format:'CASH-live-quote-paper-v1',mode:'paper-only-unverified-local-journal',balance:saved.balance,stake:saved.stake,entries:saved.entries};
 const second=app(),text=JSON.stringify(backup);
 second.run("window.CASHLivePaper.importJournal({target:{files:[{size:300,content:"+JSON.stringify(text)+"}],value:'backup'}})");
 assert.equal(second.get('lpBalance').textContent,'$95.00');
 assert.match(second.get('lpLedger').innerHTML,/KXBTC15M/);
 assert.match(second.get('lpMessage').textContent,/restored/);
});
test('malformed imported live-paper journal cannot replace existing balance',()=>{
 const a=app();a.run("window.CASHLivePaper.importJournal({target:{files:[{size:40,content:'{}'}],value:'backup'}})");
 assert.equal(a.get('lpBalance').textContent,'$100.00');
 assert.match(a.get('lpMessage').textContent,/Import rejected/);
});
test('partial market status can be used when the chosen side has a valid ask',async()=>{
 const a=app({venueStatus:'partial'});await a.run("window.CASHLivePaper.place('Polymarket','UP')");
 assert.equal(a.get('lpBalance').textContent,'$95.00');
});

test('new paper position is visible in a mobile pending ticket immediately',async()=>{
 const a=app();await a.run("window.CASHLivePaper.place('Kalshi','YES')");
 assert.match(a.get('lpActiveList').innerHTML,/PENDING · MARKET OPEN/);
 assert.match(a.get('lpActiveList').innerHTML,/Kalshi · YES/);
 assert.match(a.get('lpActiveList').innerHTML,/observed ask 55\.0¢/);
 assert.match(a.get('lpActiveList').innerHTML,/KXBTC15M/);
});
test('duplicate same-side paper entry is visibly disabled and cannot charge again',async()=>{
 const a=app();await a.run("window.CASHLivePaper.place('Kalshi','YES')");
 assert.equal(a.get('lpKalshiYes').disabled,true);
 assert.equal(a.get('lpKalshiYes').textContent,'YES · Recorded');
 assert.equal(a.get('lpKalshiNo').disabled,false);
 await a.run("window.CASHLivePaper.place('Kalshi','YES')");
 assert.equal(a.get('lpBalance').textContent,'$95.00');
 assert.match(a.get('lpMessage').textContent,/Already recorded/);
 assert.match(a.get('lpActiveList').innerHTML,/PENDING/);
});
test('new market IDs restore the paper buttons without deleting previous records',async()=>{
 const a=app();await a.run("window.CASHLivePaper.place('Kalshi','YES')");
 a.run("window.CASHLivePaper.setActiveQuote('Kalshi','KXBTC15M-26NOV160945-00')");
 assert.equal(a.get('lpKalshiYes').disabled,false);
 assert.equal(a.get('lpBalance').textContent,'$95.00');
 assert.match(a.get('lpActiveList').innerHTML,/KXBTC15M-26NOV160930-00/);
});
test('expired paper positions clearly show official settlement is still pending',async()=>{
 const a=app();await a.run("window.CASHLivePaper.place('Kalshi','YES')");
 a.now.ms+=25000;await a.run("window.CASHLivePaper.check()");
 assert.match(a.get('lpActiveList').innerHTML,/AWAITING OFFICIAL RESULT/);
 assert.equal(a.get('lpBalance').textContent,'$95.00');
});
test('settled paper ticket displays result with fee/slippage caveat',async()=>{
 const a=app();await a.run("window.CASHLivePaper.place('Kalshi','YES')");
 a.setResult({status:'verified',winner:'YES',source:'Kalshi public market result'});
 a.now.ms+=25000;await a.run("window.CASHLivePaper.check()");
 assert.match(a.get('lpActiveList').innerHTML,/WON/);
 assert.match(a.get('lpActiveList').innerHTML,/fees\/slippage excluded/);
});

test('paper settlement refuses single-confirmation or incomplete API evidence',async()=>{
 const a=app();await a.run("window.CASHLivePaper.place('Kalshi','YES')");
 a.setResult({status:'verified',winner:'YES',source:'Kalshi public market result',confirmationCount:1});
 a.now.ms+=25000;await a.run("window.CASHLivePaper.check()");
 let saved=JSON.parse(a.shared.get('cash-live-paper-v1'));
 assert.equal(saved.entries[0].status,'PENDING');
 assert.equal(saved.balance,95);
 a.setResult({status:'verified',winner:'YES',source:'Kalshi public market result',evidenceSha256:null});
 await a.run("window.CASHLivePaper.check()");
 saved=JSON.parse(a.shared.get('cash-live-paper-v1'));
 assert.equal(saved.entries[0].status,'PENDING');
});
test('confirmed paper journal exports retain public evidence fingerprint and both-check count',async()=>{
 const a=app();await a.run("window.CASHLivePaper.place('Kalshi','YES')");
 a.setResult({status:'verified',winner:'YES',source:'Kalshi public market result'});
 a.now.ms+=25000;await a.run("window.CASHLivePaper.check()");
 const saved=JSON.parse(a.shared.get('cash-live-paper-v1'));
 assert.equal(saved.entries[0].resultEvidence.confirmationCount,2);
 assert.match(saved.entries[0].resultEvidence.evidenceSha256,/^[a-f0-9]{64}$/);
 assert.match(saved.entries[0].resultEvidence.evidenceSourceUrl,/kalshi/);
 const second=app({shared:a.shared});
 assert.equal(second.get('lpBalance').textContent,saved.balance.toLocaleString('en-US',{style:'currency',currency:'USD'}));
});
