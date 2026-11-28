'use strict';
const {Client}=require('pg');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {appendResearchEvent:append}=require('../research-journal-v2-adapter');
function event(sequence,previousHash,type,marketId){
 const body={sequence,previousHash,type,payload:{marketId}};
 return JSON.stringify({...body,hash:createHash('sha256').update(JSON.stringify(body)).digest('hex')});
}
async function main(){
 if(process.env.CASH_DISPOSABLE_DB_TEST!=='1'||process.env.PGDATABASE!=='journal_test'||process.env.PGHOST!=='localhost')throw Error('Disposable test database required');
 const a=new Client(),b=new Client();
 await a.connect();
 try{
 await b.connect();
 const stream='integration:v1:s1',first=event(1,'GENESIS','FORECAST','M1');
 const results=await Promise.allSettled([append(a,stream,first,()=>true),append(b,stream,first,()=>true)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.filter(r=>r.status==='rejected').length,1);
 const hash=JSON.parse(first).hash;
 const outcome=event(2,hash,'OUTCOME','M1');
 await assert.rejects(append(a,stream,outcome,()=>false),/Semantic/);
 await append(a,stream,outcome,()=>true);
 await assert.rejects(append(b,'integration:v1:s2',first,()=>true),e=>e.code==='23505');
 const rows=(await a.query('SELECT sequence,event_type,original_event FROM cash_research_events_v2 WHERE stream=$1 ORDER BY sequence',[stream])).rows;
 assert.equal(rows.length,2);
 assert.equal(rows[0].original_event,first);
 assert.equal(rows[1].original_event,outcome);
 console.log('Concurrent append, rollback, cross-session uniqueness and byte preservation passed');
 }finally{await Promise.allSettled([a.end(),b.end()]);}
}
main().catch(e=>{console.error(e);process.exitCode=1});
