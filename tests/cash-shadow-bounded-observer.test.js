'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {runBoundedShadowObserver,MAX_WAIT_MS}=require('../cash-shadow-bounded-observer');
function sample(status='NO_ELIGIBLE_PREEXPIRY_RECORDS'){
 return {status,observedBeforeExpiryCount:status==='OBSERVED_PREEXPIRY'?1:0};
}
function harness(sequence,{start=100000,intervalMs=30000,maxWaitMs=180000}={}){
 let clock=start,calls=0,slept=0;
 const logs=[];
 const config={
  maxWaitMs,intervalMs,now:()=>clock,
  sleep:async ms=>{slept+=ms;clock+=ms},
  runObserver:async()=>{const s=sequence[Math.min(calls,sequence.length-1)];calls++;clock+=500;return sample(s)},
  log:s=>logs.push(s)
 };
 return {config,calls:()=>calls,slept:()=>slept,logs};
}
test('eligible first observation returns immediately, no unnecessary next fetch',async()=>{
 const h=harness(['OBSERVED_PREEXPIRY']);
 const r=await runBoundedShadowObserver(h.config);
 assert.equal(r.attempts,1);
 assert.equal(h.slept(),0);
 assert.equal(r.result.observedBeforeExpiryCount,1);
 assert.ok(h.logs.includes('CASH_SHADOW_BOUNDED_OBSERVER_QUALIFIED=0'));
});
test('delayed successful witness is preserved and later attempts cannot overwrite it',async()=>{
 const h=harness(['NO_ELIGIBLE_PREEXPIRY_RECORDS','PUBLIC_SOURCE_UNAVAILABLE_OR_INVALID','OBSERVED_PREEXPIRY','NO_ELIGIBLE_PREEXPIRY_RECORDS']);
 const r=await runBoundedShadowObserver(h.config);
 assert.equal(r.attempts,3);
 assert.equal(h.calls(),3);
 assert.equal(h.slept(),60000);
 assert.equal(r.result.status,'OBSERVED_PREEXPIRY');
});
test('never fabricates pre-expiry evidence when every bounded attempt is empty',async()=>{
 const h=harness(['NO_ELIGIBLE_PREEXPIRY_RECORDS']);
 const r=await runBoundedShadowObserver(h.config);
 assert.equal(r.attempts,6);
 assert.equal(h.slept(),150000);
 assert.equal(r.result.observedBeforeExpiryCount,0);
 assert.equal(r.result.status,'NO_ELIGIBLE_PREEXPIRY_RECORDS');
});
test('source outage retries but never invents a witnessed contract',async()=>{
 const h=harness(['PUBLIC_SOURCE_UNAVAILABLE_OR_INVALID'],{maxWaitMs:65000});
 const r=await runBoundedShadowObserver(h.config);
 assert.equal(r.attempts,3);
 assert.equal(r.result.status,'PUBLIC_SOURCE_UNAVAILABLE_OR_INVALID');
 assert.equal(r.result.observedBeforeExpiryCount,0);
});
test('zero retry budget observes exactly once, preserving PR dry-run behavior',async()=>{
 const h=harness(['NO_ELIGIBLE_PREEXPIRY_RECORDS'],{maxWaitMs:0});
 const r=await runBoundedShadowObserver(h.config);
 assert.equal(r.attempts,1);
 assert.equal(h.slept(),0);
});
test('timeout checks wall-clock budget after source HTTP fetch, no extra 30-second wait',async()=>{
 const h=harness(['NO_ELIGIBLE_PREEXPIRY_RECORDS'],{maxWaitMs:31000});
 const r=await runBoundedShadowObserver(h.config);
 assert.equal(r.attempts,2);
 assert.equal(h.slept(),30000);
});
test('unsafe retry configurations fail before invoking source or any side effect',async()=>{
 for(const overrides of [
  {maxWaitMs:MAX_WAIT_MS+1},{maxWaitMs:-1},{intervalMs:0},
  {intervalMs:100},{now:()=>NaN},
  {runObserver:null},{observerOptions:null}
 ]){
  let calls=0;
  const cfg={runObserver:async()=>{calls++;return sample('OBSERVED_PREEXPIRY')},
   now:()=>1000,log:()=>{},...overrides};
  await assert.rejects(()=>runBoundedShadowObserver(cfg));
  assert.equal(calls,0);
 }
});
test('contradictory source observer success with zero entries fails closed',async()=>{
 const h=harness(['NO_ELIGIBLE_PREEXPIRY_RECORDS']);
 h.config.runObserver=async()=>({status:'OBSERVED_PREEXPIRY',observedBeforeExpiryCount:0});
 await assert.rejects(()=>runBoundedShadowObserver(h.config),/inconsistent evidence/);
});
test('regressing runner clock fails rather than claiming a new observation',async()=>{
 let ticks=0;
 await assert.rejects(()=>runBoundedShadowObserver({
  runObserver:async()=>sample(),now:()=>ticks++===0?100000:99000,
  sleep:async()=>{},log:()=>{}
 }),/moved backwards/);
});

test('bounded retries summarize only fixed safe error codes without leaking arbitrary details',async()=>{
 let tick=100000,calls=0;
 const logs=[];
 const results=[
  {status:'PUBLIC_SOURCE_UNAVAILABLE_OR_INVALID',observedBeforeExpiryCount:0,errorCode:'SOURCE_AUTHORIZATION_REJECTED'},
  {status:'PUBLIC_SOURCE_UNAVAILABLE_OR_INVALID',observedBeforeExpiryCount:0,errorCode:'SECRET_TOKEN_DO_NOT_LOG'},
  {status:'PUBLIC_SOURCE_UNAVAILABLE_OR_INVALID',observedBeforeExpiryCount:0,errorCode:'SOURCE_INVALID_UTF8'}
 ];
 const r=await runBoundedShadowObserver({
  maxWaitMs:65000,intervalMs:30000,now:()=>tick,
  sleep:async ms=>{tick+=ms},
  runObserver:async()=>{tick+=500;return results[Math.min(calls++,2)]},
  log:line=>logs.push(line)
 });
 assert.equal(r.attempts,3);
 assert.equal(r.result.observedBeforeExpiryCount,0);
 assert.equal(r.failureCounts.SOURCE_AUTHORIZATION_REJECTED,1);
 assert.equal(r.failureCounts.SOURCE_TRANSPORT_OR_UNKNOWN,1);
 assert.equal(r.failureCounts.SOURCE_INVALID_UTF8,1);
 const output=logs.join('\\n');
 assert.match(output,/CASH_SHADOW_BOUNDED_OBSERVER_FAILURE_COUNTS=/);
 assert.doesNotMatch(output,/SECRET_TOKEN_DO_NOT_LOG/);
 assert.match(output,/CASH_SHADOW_BOUNDED_OBSERVER_QUALIFIED=0/);
});

test('non-success statuses cannot smuggle a pre-expiry count into bounded evidence',async()=>{
 for(const status of ['NO_ELIGIBLE_PREEXPIRY_RECORDS','PUBLIC_SOURCE_UNAVAILABLE_OR_INVALID','UNRECOGNIZED_STATUS']){
  const logs=[];
  await assert.rejects(()=>runBoundedShadowObserver({
   maxWaitMs:0,now:()=>100000,sleep:async()=>{},log:line=>logs.push(line),
   runObserver:async()=>({status,observedBeforeExpiryCount:1})
  }),/inconsistent evidence/);
  assert.equal(logs.length,0);
 }
});
test('unknown zero-count status fails closed without success or archive summary',async()=>{
 const logs=[];
 await assert.rejects(()=>runBoundedShadowObserver({
  maxWaitMs:0,now:()=>100000,sleep:async()=>{},log:line=>logs.push(line),
  runObserver:async()=>({status:'UNRECOGNIZED_STATUS',observedBeforeExpiryCount:0})
 }),/inconsistent evidence/);
 assert.equal(logs.length,0);
});

test('successful witness still rejects a backwards runner clock without attestation',async()=>{
 const logs=[];
 let ticks=0;
 await assert.rejects(()=>runBoundedShadowObserver({
  maxWaitMs:0,now:()=>ticks++===0?100000:99000,
  sleep:async()=>{},log:line=>logs.push(line),
  runObserver:async()=>sample('OBSERVED_PREEXPIRY')
 }),/moved backwards/);
 assert.equal(logs.length,0);
});

test('final runner clock regression after successful observation emits no attestation',async()=>{
 let ticks=0;
 const logs=[];
 await assert.rejects(()=>runBoundedShadowObserver({
  maxWaitMs:0,now:()=>++ticks===1?100000:100500-(ticks===3?1000:0),
  sleep:async()=>{},log:line=>logs.push(line),
  runObserver:async()=>sample('OBSERVED_PREEXPIRY')
 }),/final clock invalid/);
 assert.deepEqual(logs,[]);
});
test('non-finite final runner clock emits no observer summary',async()=>{
 let ticks=0;
 const logs=[];
 await assert.rejects(()=>runBoundedShadowObserver({
  maxWaitMs:0,now:()=>++ticks===3?NaN:100000,
  sleep:async()=>{},log:line=>logs.push(line),
  runObserver:async()=>sample('OBSERVED_PREEXPIRY')
 }),/final clock invalid/);
 assert.deepEqual(logs,[]);
});

test('unsafe intermediate runner clocks fail closed before emitting witness summary',async()=>{
 for(const invalid of [NaN,Infinity,100000.5,Number.MAX_SAFE_INTEGER+1]){
  const logs=[];
  let ticks=0;
  await assert.rejects(()=>runBoundedShadowObserver({
   maxWaitMs:0,now:()=>++ticks===1?100000:invalid,
   sleep:async()=>{},log:line=>logs.push(line),
   runObserver:async()=>sample('OBSERVED_PREEXPIRY')
  }),/intermediate clock invalid/);
  assert.deepEqual(logs,[]);
 }
});

test('unsafe final raw runner clock fails even when subtraction appears safe',async()=>{
 const logs=[];
 let ticks=0;
 await assert.rejects(()=>runBoundedShadowObserver({
  maxWaitMs:0,now:()=>++ticks===1?100000:ticks===2?100001:Number.MAX_SAFE_INTEGER+1,
  sleep:async()=>{},log:line=>logs.push(line),
  runObserver:async()=>sample('OBSERVED_PREEXPIRY')
 }),/final clock invalid/);
 assert.deepEqual(logs,[]);
});
