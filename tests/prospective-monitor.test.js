'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createProspectiveMonitor}=require('../prospective-monitor');
const {createProspectiveStore}=require('../prospective-store');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const t=Date.parse('2026-11-16T23:20:00Z'),iso=x=>new Date(x).toISOString();
const market='KXBTC15M-26NOV161630-30';
function fixtures(time=t){
 const history=Array.from({length:25},(_,i)=>({
  time:iso(time-(24-i)*15000),price:85000+500+i,source:'Kraken BTC/USD'
 }));
 const quote={venue:'Kalshi',marketId:market,
  endTime:iso(time+180000),openTime:iso(time-700000),
  fetchedAt:iso(time),status:'live',refreshFailed:false,
  targetPrice:85000,targetSource:'KALSHI_FLOOR_STRIKE',
  strikeType:'greater_or_equal',tieGoesToYes:true,
  contractRuleStatus:'BRTI_60S_RULE_TEXT_PRESENT',
  yesAsk:.55,noAsk:.46};
 const spot={status:'live',price:history.at(-1).price,source:'Kraken BTC/USD',
  fetchedAt:iso(time),history};
 return {quote,spot};
}
function outcome(now,win='YES'){
 const evidence={venue:'Kalshi',ticker:market,status:'settled',
  result:win.toLowerCase(),floor_strike:85000,
  expiration_value:win==='YES'?85200:84700,
  strike_type:'greater_or_equal',is_provisional:false};
 return {status:'verified',venue:'Kalshi',marketId:market,winner:win,
  source:'Kalshi public market result',checkedAt:iso(now),
  firstObservedAt:iso(now-25000),confirmationCount:2,
  evidenceSnapshot:evidence,
  evidenceSha256:crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex'),
  evidenceSourceUrl:'https://external-api.kalshi.com/trade-api/v2/markets/'+market};
}
function harness(){
 let now=t,values=fixtures(t),final=null;
 const store={mode:'VOLATILE_SERVER_SESSION',events:[],append(e){this.events.push(e)}};
 const sources={
  clock:()=>now,store,
  quotes:{query:async()=>values.quote},
  spot:{update:async()=>values.spot},
  results:{lookup:async()=>final||{status:'pending'}}
 };
 return {sources,setTime:x=>{now=x},setFinal:x=>{final=x},
  setValues:x=>{values=x},store};
}
test('frozen prospective YES/NO/WAIT forecast is immutable and recorded only once per market',async()=>{
 const h=harness(),m=createProspectiveMonitor(h.sources);
 await m.scan();
 let snap=m.snapshot();
 assert.equal(snap.directional,1);assert.equal(snap.records,1);
 assert.equal(snap.latest.side,'YES');
 assert.equal(snap.tradingAuthorized,false);
 assert.equal(snap.qualifiedCount,0);
 const hash=snap.headHash;
 const switched=fixtures(t);switched.spot.history=switched.spot.history.map(x=>({...x,price:x.price-1700}));
 switched.spot.price=switched.spot.history.at(-1).price;
 h.setValues(switched);
 await m.scan();
 snap=m.snapshot();
 assert.equal(snap.records,1);assert.equal(snap.headHash,hash);
 assert.equal(snap.latest.side,'YES');
 assert.equal(m.exportSession().events.filter(e=>e.type==='FORECAST').length,1);
});
test('settlement is only recorded after expiry and two-check public verified evidence',async()=>{
 const h=harness(),m=createProspectiveMonitor(h.sources);
 await m.scan();
 assert.equal(m.snapshot().officiallyScored,0);
 h.setTime(t+230000);
 await m.scan();
 assert.equal(m.snapshot().pending,1);
 h.setFinal(outcome(t+230000,'YES'));
 await m.scan();
 const r=m.snapshot();
 assert.equal(r.officiallyScored,1);assert.equal(r.hits,1);
 assert.equal(r.hitRate,1);assert.equal(r.qualifiedCount,0);
 assert.equal(m.exportSession().events.length,2);
 await m.scan();assert.equal(m.exportSession().events.length,2);
});
test('contradictory public numeric evidence and unconfirmed outcomes never score',async()=>{
 const h=harness(),m=createProspectiveMonitor(h.sources);
 await m.scan();h.setTime(t+230000);
 const fake=outcome(t+230000,'YES');
 fake.evidenceSnapshot.expiration_value=84000;
 fake.evidenceSha256=crypto.createHash('sha256').update(JSON.stringify(fake.evidenceSnapshot)).digest('hex');
 h.setFinal(fake);
 await m.scan();
 assert.equal(m.snapshot().officiallyScored,0);
 assert.equal(m.snapshot().pending,1);
});
test('missing data or out of time means no frozen invented signal',async()=>{
 const h=harness(),f=fixtures(t);
 f.quote.targetPrice=null;
 h.setValues(f);
 const m=createProspectiveMonitor(h.sources);
 await m.scan();
 assert.equal(m.snapshot().records,0);
 assert.equal(m.snapshot().qualifiedCount,0);
});
test('filesystem journal replay preserves previous frozen prediction but does not qualify it',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-prosp-'));
 try{
  const h=harness();
  const first=createProspectiveMonitor({...h.sources,store:createProspectiveStore({directory:dir})});
  await first.scan();assert.equal(first.snapshot().records,1);
  const second=createProspectiveMonitor({...h.sources,store:createProspectiveStore({directory:dir})});
  assert.equal(second.snapshot().records,1);
  assert.equal(second.snapshot().latest.side,'YES');
  assert.equal(second.snapshot().qualifiedCount,0);
  const filename=path.join(dir,'prospective-kalshi-events.jsonl');
  const original=fs.readFileSync(filename,'utf8');
  fs.writeFileSync(filename,original.replace('KXBTC15M_STRIKE_VOL_V1','FORGED_MODEL'));
  assert.throws(()=>createProspectiveStore({directory:dir}),/integrity invalid/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
