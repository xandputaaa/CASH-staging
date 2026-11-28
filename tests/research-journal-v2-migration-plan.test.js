'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {inventoryLegacyJournal:inventory}=require('../research-journal-v2-migration-plan');
const stream='early:v3:legacy';
function fixture(types=['FORECAST','OUTCOME']){
 let previousHash='GENESIS';
 return Buffer.from(types.map((type,i)=>{
 const body={sequence:i+1,previousHash,type,payload:{marketId:'KXBTC15M-TEST01'}};
 const hash=createHash('sha256').update(JSON.stringify(body)).digest('hex');
 previousHash=hash;return JSON.stringify({...body,hash});
 }).join('\n')+'\n');
}
test('legacy inventory preserves source and grants zero qualification',()=>{
 const bytes=fixture(),copy=Buffer.from(bytes);
 const result=inventory(stream,bytes,()=>true);
 assert.deepEqual(bytes,copy);assert.equal(result.forecasts,1);
 assert.equal(result.outcomes,1);assert.equal(result.qualificationCredit,0);
 assert.equal(result.sourceSha256,createHash('sha256').update(copy).digest('hex'));
});
test('legacy inventory rejects truncated source',()=>assert.throws(()=>inventory(stream,fixture().subarray(0,-1),()=>true),/Truncated/));
test('legacy inventory rejects duplicate forecast',()=>assert.throws(()=>inventory(stream,fixture(['FORECAST','FORECAST']),()=>true),/Duplicate/));
test('legacy inventory rejects orphan outcome',()=>assert.throws(()=>inventory(stream,fixture(['OUTCOME']),()=>true),/Orphan/));
test('legacy inventory rejects semantic failure',()=>assert.throws(()=>inventory(stream,fixture(),()=>false),/semantic/));
