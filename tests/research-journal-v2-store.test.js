'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {createResearchJournalV2Store:create}=require('../research-journal-v2-store');
const stream='early:v3:test';
function event(){
 const body={sequence:1,previousHash:'GENESIS',type:'FORECAST',payload:{marketId:'KXBTC15M-TEST01'}};
 return {...body,hash:createHash('sha256').update(JSON.stringify(body)).digest('hex')};
}
async function setup({fail=false,gate=null,validateChain=()=>true}={}){
 const calls=[];
 const client={async query(sql){
 calls.push(sql);
 if(sql==='COMMIT'){if(gate)await gate;if(fail)throw Error('commit uncertain');}
 return {rows:[]};
 }};
 const store=await create({client,stream,validateChain,validateEvent:()=>true});
 return {store,calls};
}
test('bridge publishes only after commit',async()=>{
 let release;const gate=new Promise(r=>{release=r});
 const {store,calls}=await setup({gate});
 const pending=store.append(event());
 while(!calls.includes('COMMIT'))await new Promise(r=>setImmediate(r));
 assert.equal(store.events.length,0);
 await assert.rejects(store.append(event()),/unavailable/);
 release();await pending;
 assert.equal(store.events.length,1);
 const copy=store.events;copy[0].payload.marketId='changed';
 assert.equal(store.events[0].payload.marketId,'KXBTC15M-TEST01');
});
test('uncertain commit blocks further writes',async()=>{
 const {store,calls}=await setup({fail:true});
 await assert.rejects(store.append(event()),/uncertain/);
 assert.equal(store.events.length,0);assert.equal(store.blocked,true);
 const count=calls.length;
 await assert.rejects(store.append(event()),/unavailable/);
 assert.equal(calls.length,count);
});
test('semantic rejection prevents transaction',async()=>{
 const {store,calls}=await setup({validateChain:events=>events.length===0});
 await assert.rejects(store.append(event()),/Proposed chain/);
 assert.equal(calls.includes('BEGIN'),false);assert.equal(store.blocked,true);
});
