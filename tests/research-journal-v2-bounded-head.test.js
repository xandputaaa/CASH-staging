'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {createBoundedJournalHead}=require('../research-journal-v2-bounded-head');
const stream='btc15:early:test';
function event(){const body={sequence:1,previousHash:'GENESIS',type:'FORECAST',payload:{marketId:'m1'}};return {...body,hash:createHash('sha256').update(JSON.stringify(body)).digest('hex')}}
function db(fail=false){let commits=0;return {async query(sql){if(sql==='COMMIT'&&++commits===2&&fail)throw Error('commit lost');return {rows:[]}}}}
const options={stream,validateSnapshot:async()=>true,validateEvent:async()=>true};
test('bounded head advances after committed append',async()=>{
 const store=await createBoundedJournalHead({...options,client:db()});
 const e=event();await store.append(e);
 assert.deepEqual(store.head,{sequence:1,headHash:e.hash,forecastCount:1,outcomeCount:0});
 assert.equal(store.blocked,false);
});
test('uncertain append preserves head and blocks subsequent writes',async()=>{
 const store=await createBoundedJournalHead({...options,client:db(true)});
 await assert.rejects(store.append(event()),/commit lost/);
 assert.equal(store.head.sequence,0);assert.equal(store.blocked,true);
 await assert.rejects(store.append(event()),/reconcile/);
});
test('semantic snapshot rejection prevents startup',async()=>{
 await assert.rejects(createBoundedJournalHead({...options,client:db(),validateSnapshot:async()=>false}),/Semantic snapshot rejected/);
});
