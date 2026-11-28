'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {auditJournalPages,auditJournalSnapshot}=require('../research-journal-v2-paged-audit');
const stream='btc15:early:test';
function fixture(n){
 let previousHash='GENESIS';
 return Array.from({length:n},(_,i)=>{
 const body={sequence:i+1,previousHash,type:'FORECAST',payload:{marketId:'market-'+i}};
 const hash=createHash('sha256').update(JSON.stringify(body)).digest('hex');
 const row={sequence:i+1,market_id:body.payload.marketId,event_type:body.type,event_hash:hash,previous_hash:previousHash,original_event:JSON.stringify({...body,hash})};previousHash=hash;return row;
 });
}
function client(rows){return {async query(sql,args){assert.match(sql,/^SELECT /);return {rows:rows.filter(r=>r.sequence>args[1]).slice(0,args[2])}}}}
test('audit pages preserve chain and count across 641 markets',async()=>{
 const rows=fixture(641);
 assert.deepEqual(await auditJournalPages(client(rows),stream,{pageSize:17}),{sequence:641,headHash:rows.at(-1).event_hash,forecastCount:641,outcomeCount:0});
});
test('audit rejects corrupted page boundary',async()=>{
 const rows=fixture(35);rows[17].previous_hash='bad';
 await assert.rejects(auditJournalPages(client(rows),stream,{pageSize:17}),/integrity/);
});
test('audit rejects invalid page size',async()=>{
 await assert.rejects(auditJournalPages(client([]),stream,{pageSize:1025}),/arguments/);
});

test('snapshot commits only after successful read-only audit',async()=>{
 const calls=[],base=client(fixture(35));
 const db={async query(sql,args){calls.push(sql);return sql.startsWith('SELECT')?base.query(sql,args):{rows:[]}}};
 const result=await auditJournalSnapshot(db,stream,{pageSize:17});
 assert.equal(result.sequence,35);
 assert.equal(calls[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 assert.equal(calls.at(-1),'COMMIT');
});
test('snapshot rolls back on integrity failure',async()=>{
 const calls=[],rows=fixture(35);rows[17].previous_hash='bad';
 const base=client(rows),db={async query(sql,args){calls.push(sql);return sql.startsWith('SELECT')?base.query(sql,args):{rows:[]}}};
 await assert.rejects(auditJournalSnapshot(db,stream,{pageSize:17}),/integrity/);
 assert.equal(calls.at(-1),'ROLLBACK');
 assert.ok(!calls.includes('COMMIT'));
});
test('snapshot reports uncertain transaction when rollback fails',async()=>{
 const db={async query(sql){if(sql.startsWith('BEGIN'))return {rows:[]};throw Error('connection lost')}};
 await assert.rejects(auditJournalSnapshot(db,stream),/discard client/);
});

test('semantic audit runs inside the same snapshot before commit',async()=>{
 const calls=[],base=client(fixture(2));
 const db={async query(sql,args){calls.push(sql);return sql.startsWith('SELECT')?base.query(sql,args):{rows:[]}}};
 await auditJournalSnapshot(db,stream,{pageSize:1},async(head,connection,id)=>{
  assert.equal(connection,db);assert.equal(id,stream);assert.equal(head.sequence,2);
  assert.ok(Object.isFrozen(head));assert.ok(!calls.includes('COMMIT'));calls.push('SEMANTIC');return true;
 });
 assert.deepEqual(calls.slice(-2),['SEMANTIC','COMMIT']);
});
test('semantic rejection rolls back snapshot',async()=>{
 const calls=[],db={async query(sql){calls.push(sql);return {rows:[]}}};
 await assert.rejects(auditJournalSnapshot(db,stream,{},async()=>false),/Semantic snapshot rejected/);
 assert.equal(calls.at(-1),'ROLLBACK');assert.ok(!calls.includes('COMMIT'));
});
