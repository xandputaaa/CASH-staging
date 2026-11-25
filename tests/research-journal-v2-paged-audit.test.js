'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {auditJournalPages}=require('../research-journal-v2-paged-audit');
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
