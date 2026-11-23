'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {appendResearchEvent}=require('../research-journal-v2-adapter');
function event(type='FORECAST',sequence=1,previousHash='GENESIS'){
 const body={sequence,previousHash,type,payload:{marketId:'KXBTC15M-TEST01'}};
 return JSON.stringify({...body,hash:createHash('sha256').update(JSON.stringify(body)).digest('hex')});
}
function client({head,prior=[],fail=false}={}){
 const calls=[];
 return {calls,async query(sql,args){
 calls.push(sql);
 if(sql.startsWith('SELECT sequence'))return {rows:head?[head]:[]};
 if(sql.startsWith('SELECT event_type'))return {rows:prior};
 if(fail&&sql.startsWith('INSERT'))throw Error('simulated failure');
 return {rows:[]};
 }};
}
test('valid append commits after validation',async()=>{
 const c=client(),raw=event();
 const result=await appendResearchEvent(c,'early:v3:chain1',raw,async()=>true);
 assert.equal(result.hash,JSON.parse(raw).hash);
 assert.equal(c.calls.at(-1),'COMMIT');
});
test('invalid hash never opens transaction',async()=>{
 const c=client();
 await assert.rejects(appendResearchEvent(c,'s',event().replace('TEST01','TEST02'),()=>true),/hash/);
 assert.equal(c.calls.length,0);
});
test('orphan outcome rolls back',async()=>{
 const c=client();
 await assert.rejects(appendResearchEvent(c,'s',event('OUTCOME'),()=>true),/orphan/);
 assert.equal(c.calls.at(-1),'ROLLBACK');
});
test('duplicate forecast rolls back',async()=>{
 const c=client({prior:[{event_type:'FORECAST'}]});
 await assert.rejects(appendResearchEvent(c,'s',event(),()=>true),/Duplicate/);
 assert.equal(c.calls.at(-1),'ROLLBACK');
});
test('wrong head rolls back',async()=>{
 const c=client({head:{sequence:'1',event_hash:'abc'}});
 await assert.rejects(appendResearchEvent(c,'s',event(),()=>true),/head mismatch/);
 assert.equal(c.calls.at(-1),'ROLLBACK');
});
test('semantic rejection rolls back',async()=>{
 const c=client();
 await assert.rejects(appendResearchEvent(c,'s',event(),()=>false),/Semantic/);
 assert.equal(c.calls.at(-1),'ROLLBACK');
});
test('insert failure rolls back',async()=>{
 const c=client({fail:true});
 await assert.rejects(appendResearchEvent(c,'s',event(),()=>true),/simulated/);
 assert.equal(c.calls.at(-1),'ROLLBACK');
});
