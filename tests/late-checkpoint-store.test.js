'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const crypto=require('node:crypto');
const {createLateCheckpointStore,verifyLateCheckpointChain}=require('../late-checkpoint-store');
const {createLateCheckpointMonitor}=require('../late-checkpoint-monitor');
const root=()=>fs.mkdtempSync(path.join(os.tmpdir(),'cash-late-replay-'));
const now=Date.parse('2026-11-17T16:00:00Z'),iso=x=>new Date(x).toISOString();
const market='KXBTC15M-26NOV170915-15';
const sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function feeds(time){
 const history=Array.from({length:25},(_,i)=>({
  time:iso(time-(24-i)*15000),price:85500+(i-24),source:'Kraken BTC/USD'
 }));
 return {
  quote:{venue:'Kalshi',marketId:market,status:'live',refreshFailed:false,
   fetchedAt:iso(time),endTime:iso(now+180000),openTime:iso(time-500000),
   targetPrice:85000,targetSource:'KALSHI_FLOOR_STRIKE',
   strikeType:'greater_or_equal',tieGoesToYes:true,
   contractRuleStatus:'BRTI_60S_RULE_TEXT_PRESENT',
   yesAsk:.55,noAsk:.46},
  spot:{status:'live',source:'Kraken BTC/USD',price:history.at(-1).price,
   fetchedAt:iso(time),history}
 };
}
function verified(time,winner='YES'){
 const raw={venue:'Kalshi',ticker:market,status:'settled',
  result:winner.toLowerCase(),floor_strike:85000,
  expiration_value:winner==='YES'?85200:84800,
  strike_type:'greater_or_equal',is_provisional:false};
 return {status:'verified',winner,checkedAt:iso(time),firstObservedAt:iso(time-24000),
  confirmationCount:2,evidenceSnapshot:raw,evidenceSha256:sha(raw),
  evidenceSourceUrl:'https://external-api.kalshi.com/trade-api/v2/markets/'+market};
}
function harness(store){
 let t=now,quote=feeds(t).quote,spot=feeds(t).spot,result={status:'pending'};
 const m=createLateCheckpointMonitor({
  quotes:{query:async()=>quote},spot:{update:async()=>spot},
  results:{lookup:async()=>result},clock:()=>t,store
 });
 return {m,setTime:x=>{t=x},setResult:x=>{result=x},
  setQuote:x=>{quote=x}};
}
const close=x=>fs.rmSync(x,{recursive:true,force:true});
test('when unconfigured, new late store is volatile and writes no file',async()=>{
 const d=root();try{
  const store=createLateCheckpointStore({directory:undefined});
  assert.equal(store.configured,false);
  assert.equal(store.mode,'VOLATILE_SERVER_SESSION');
  const h=harness(store);await h.m.scan();
  assert.equal(h.m.snapshot().records,1);
  assert.equal(h.m.snapshot().storage,'VOLATILE_SERVER_SESSION');
  assert.deepEqual(fs.readdirSync(d),[]);
 }finally{close(d)}
});
test('fsynced late forecast is recovered exactly from pre-existing mounted folder',async()=>{
 const d=root();try{
  const s1=createLateCheckpointStore({directory:d}),h1=harness(s1);
  await h1.m.scan();
  assert.equal(h1.m.snapshot().records,1);
  const original=h1.m.exportSession();
  const text=fs.readFileSync(s1.path,'utf8');
  assert.equal(text.endsWith('\n'),true);
  assert.equal(text.trimEnd().split('\n').length,1);
  assert.equal(fs.statSync(s1.path).mode&0o777,0o600);
  const s2=createLateCheckpointStore({directory:d});
  const h2=harness(s2);
  assert.equal(h2.m.snapshot().records,1);
  assert.equal(h2.m.snapshot().replayedForecasts,1);
  assert.equal(h2.m.snapshot().latest.side,original.latest.side);
  assert.equal(h2.m.exportSession().headHash,original.headHash);
  assert.deepEqual(h2.m.exportSession().events,original.events);
  await h2.m.scan();
  assert.equal(h2.m.snapshot().records,1);
  assert.equal(fs.readFileSync(s1.path,'utf8'),text);
  assert.equal(h2.m.snapshot().realMoneyAuthorized,false);
  assert.equal(h2.m.snapshot().independentQualification,0);
 }finally{close(d)}
});
test('verified outcome replays with identical hit and paper score without double settlement',async()=>{
 const d=root();try{
  const s=createLateCheckpointStore({directory:d}),h=harness(s);
  await h.m.scan();
  h.setTime(now+240000);h.setResult(verified(now+240000));
  await h.m.scan();
  const prior=h.m.exportSession();
  assert.equal(prior.records,1);
  assert.equal(prior.pending,0);
  assert.equal(prior.scorecard.overall.hits,1);
  const next=harness(createLateCheckpointStore({directory:d}));
  assert.equal(next.m.snapshot().pending,0);
  assert.equal(next.m.snapshot().scorecard.overall.hits,1);
  assert.equal(next.m.snapshot().latest.status,'HIT');
  assert.equal(next.m.exportSession().headHash,prior.headHash);
  assert.deepEqual(next.m.exportSession().events,prior.events);
  await next.m.scan();
  assert.equal(next.m.exportSession().events.length,2);
  assert.equal(next.m.snapshot().canExecuteOrders,false);
 }finally{close(d)}
});
test('pending forecast survives restart and later settlement appends one outcome',async()=>{
 const d=root();try{
  const h=harness(createLateCheckpointStore({directory:d}));
  await h.m.scan();
  const frozen=h.m.exportSession().events[0];
  const restored=harness(createLateCheckpointStore({directory:d}));
  restored.setTime(now+240000);
  restored.setResult(verified(now+240000));
  await restored.m.scan();
  const after=restored.m.exportSession();
  assert.equal(after.events.length,2);
  assert.deepEqual(after.events[0],frozen);
  assert.equal(after.pending,0);
  assert.equal(createLateCheckpointStore({directory:d}).events.length,2);
 }finally{close(d)}
});
test('hash chain alteration, mid-line truncation, unknown extra field and outcome reversal fail closed',async()=>{
 const d=root();try{
  const h=harness(createLateCheckpointStore({directory:d}));await h.m.scan();
  const f=path.join(d,'late-checkpoint-events.jsonl'),
        original=fs.readFileSync(f,'utf8'),
        record=JSON.parse(original.trimEnd());
  fs.writeFileSync(f,original.slice(0,-2));
  assert.throws(()=>createLateCheckpointStore({directory:d}),/truncated/);
  for(const mutate of [
   x=>x.payload.side='NO',
   x=>x.payload.secretKey='DO_NOT_PRINT',
   x=>x.hash='0'.repeat(64),
  ]){
   const temp=structuredClone(record);mutate(temp);
   fs.writeFileSync(f,JSON.stringify(temp)+'\n');
   assert.throws(()=>createLateCheckpointStore({directory:d}),
    /invalid|mismatch/);
  }
  fs.writeFileSync(f,original);
  const s=createLateCheckpointStore({directory:d});
  assert.equal(verifyLateCheckpointChain(s.events).forecasts,1);
 }finally{close(d)}
});
test('missing mount, symlink mount, symlink journal and unrelated path are never used silently',()=>{
 const d=root(),bad=root();try{
  assert.throws(()=>createLateCheckpointStore({directory:'/not-a-mounted-CASH-path'}),
   /ENOENT/);
  assert.throws(()=>createLateCheckpointStore({directory:'relative/data'}),
   /absolute pre-mounted/);
  const link=path.join(bad,'mount');
  fs.symlinkSync(d,link);
  assert.throws(()=>createLateCheckpointStore({directory:link}),/symlink/);
  const file=path.join(d,'late-checkpoint-events.jsonl');
  fs.symlinkSync(path.join(bad,'target.jsonl'),file);
  assert.throws(()=>createLateCheckpointStore({directory:d}),/ordinary bounded file/);
 }finally{close(d);close(bad)}
});
test('failed storage append does not create a fake frozen record in RAM',async()=>{
 let calls=0;
 const store={mode:'FILESYSTEM_JOURNAL_UNVERIFIED',events:[],
  append(){calls++;throw Error('disk unavailable')}};
 const h=harness(store);
 await h.m.scan();
 assert.equal(calls,1);
 assert.equal(h.m.snapshot().records,0);
 assert.equal(h.m.exportSession().events.length,0);
 assert.equal(h.m.snapshot().failures>0,true);
 assert.equal(h.m.snapshot().canExecuteOrders,false);
});
test('event sequence, replay cap, duplicate market and future timestamp mismatch rejected',async()=>{
 const d=root();try{
  const h=harness(createLateCheckpointStore({directory:d}));await h.m.scan();
  const original=createLateCheckpointStore({directory:d}).events;
  const forged=structuredClone(original[0]);
  forged.sequence=2;forged.previousHash=original[0].hash;
  const {hash,...body}=forged;forged.hash=sha(body);
  assert.throws(()=>verifyLateCheckpointChain([...original,forged]),/source or timing invalid/);
  assert.throws(()=>verifyLateCheckpointChain(original,{maxEvents:0}),/capacity/);
  const mutated=structuredClone(original);mutated[0].payload.at=iso(now+240000);
  const {hash:old,...rest}=mutated[0];mutated[0].hash=sha(rest);
  assert.throws(()=>verifyLateCheckpointChain(mutated),/source or timing invalid/);
 }finally{close(d)}
});

test('stale second process refuses to append an obsolete event sequence or rewrite frozen market',async()=>{
 const d=root();try{
  const one=createLateCheckpointStore({directory:d});
  const stale=createLateCheckpointStore({directory:d});
  const first=harness(one),second=harness(stale);
  await first.m.scan();
  assert.equal(first.m.snapshot().records,1);
  await second.m.scan();
  assert.equal(second.m.snapshot().records,0);
  assert.equal(second.m.snapshot().failures>0,true);
  assert.equal(stale.events.length,0);
  const fresh=createLateCheckpointStore({directory:d});
  assert.equal(fresh.events.length,1);
  assert.deepEqual(fresh.events,one.events);
  assert.equal(harness(fresh).m.snapshot().replayedForecasts,1);
 }finally{close(d)}
});
test('existing write lock blocks a new settlement without mutating memory or disk',async()=>{
 const d=root();try{
  const s=createLateCheckpointStore({directory:d}),h=harness(s);
  await h.m.scan();
  const before=fs.readFileSync(s.path,'utf8');
  const lock=path.join(d,'.late-checkpoint-events.write.lock');
  fs.writeFileSync(lock,'intentional test lock',{mode:0o600});
  h.setTime(now+240000);h.setResult(verified(now+240000));
  await h.m.scan();
  assert.equal(h.m.snapshot().pending,1);
  assert.equal(h.m.snapshot().failures>0,true);
  assert.equal(fs.readFileSync(s.path,'utf8'),before);
  assert.equal(s.events.length,1);
  assert.equal(fs.readFileSync(lock,'utf8'),'intentional test lock');
  fs.unlinkSync(lock);
  await h.m.scan();
  assert.equal(h.m.snapshot().pending,0);
  assert.equal(s.events.length,2);
  assert.equal(fs.existsSync(lock),false);
 }finally{close(d)}
});
test('same-length disk mutation after a store opens cannot be silently appended over',async()=>{
 const d=root();try{
  const s=createLateCheckpointStore({directory:d}),h=harness(s);
  await h.m.scan();
  const before=fs.readFileSync(s.path,'utf8');
  const original=JSON.parse(before.trimEnd());
  original.payload.marketId=original.payload.marketId.replace('-15','-16');
  const {hash:old,...body}=original;
  original.hash=sha(body);
  const forged=JSON.stringify(original)+'\n';
  assert.equal(Buffer.byteLength(forged),Buffer.byteLength(before));
  fs.writeFileSync(s.path,forged);
  h.setTime(now+240000);h.setResult(verified(now+240000));
  await h.m.scan();
  assert.equal(h.m.snapshot().pending,1);
  assert.equal(h.m.snapshot().failures>0,true);
  assert.equal(fs.readFileSync(s.path,'utf8'),forged);
  assert.equal(s.events.length,1);
  assert.equal(fs.existsSync(path.join(d,'.late-checkpoint-events.write.lock')),false);
  // Even though the forged JSON is syntactically complete, a future startup
  // will only be able to replay the changed (self-hashed) source, not
  // silently claim it preserves the original frozen commitment.
  assert.notEqual(original.hash,JSON.parse(before).hash);
 }finally{close(d)}
});
test('truncated journal after opening must not be repaired by appending an outcome',async()=>{
 const d=root();try{
  const s=createLateCheckpointStore({directory:d}),h=harness(s);
  await h.m.scan();
  const orig=fs.readFileSync(s.path,'utf8');
  fs.truncateSync(s.path,Math.floor(Buffer.byteLength(orig)/2));
  h.setTime(now+240000);h.setResult(verified(now+240000));
  await h.m.scan();
  assert.equal(h.m.snapshot().pending,1);
  assert.equal(s.events.length,1);
  assert.throws(()=>createLateCheckpointStore({directory:d}),/truncated/);
 }finally{close(d)}
});
test('stale lock is never auto-cleared on store opening or append',async()=>{
 const d=root();try{
  const file=path.join(d,'.late-checkpoint-events.write.lock');
  fs.writeFileSync(file,'crashed lock',{mode:0o600});
  const s=createLateCheckpointStore({directory:d});
  const h=harness(s);
  await h.m.scan();
  assert.equal(h.m.snapshot().records,0);
  assert.equal(h.m.snapshot().failures>0,true);
  assert.equal(fs.readFileSync(file,'utf8'),'crashed lock');
  assert.equal(fs.existsSync(s.path),false);
 }finally{close(d)}
});
