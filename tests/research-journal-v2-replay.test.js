'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {replayResearchStream:replay}=require('../research-journal-v2-replay');
const stream='early:v3:s1';
function fixture(types=['FORECAST','OUTCOME']){
 let previousHash='GENESIS';
 return types.map((type,i)=>{
 const body={sequence:i+1,previousHash,type,payload:{marketId:'KXBTC15M-TEST01'}};
 const hash=createHash('sha256').update(JSON.stringify(body)).digest('hex');
 const row={sequence:String(i+1),market_id:body.payload.marketId,event_type:type,event_hash:hash,previous_hash:previousHash,original_event:JSON.stringify({...body,hash})};
 previousHash=hash;return row;
 });
}
const client=rows=>({query:async(sql,args)=>{assert.match(sql,/^SELECT /);assert.deepEqual(args,[stream]);return {rows}}});
test('replay restores committed forecast and outcome',async()=>{
 const rows=fixture(),r=await replay(client(rows),stream,()=>true);
 assert.equal(r.forecastCount,1);assert.equal(r.outcomeCount,1);assert.equal(r.headHash,rows[1].event_hash);
});
test('replay restores unfinished forecast',async()=>{
 const r=await replay(client(fixture(['FORECAST'])),stream,()=>true);
 assert.equal(r.forecastCount,1);assert.equal(r.outcomeCount,0);
});
test('replay rejects altered row identity',async()=>{
 const rows=fixture();rows[0].market_id='OTHER';
 await assert.rejects(replay(client(rows),stream,()=>true),/integrity/);
});
test('replay rejects missing first event',async()=>assert.rejects(replay(client(fixture().slice(1)),stream,()=>true),/integrity/));
test('replay rejects duplicate outcomes',async()=>assert.rejects(replay(client(fixture(['FORECAST','OUTCOME','OUTCOME'])),stream,()=>true),/duplicate/));
test('replay rejects semantic failure',async()=>assert.rejects(replay(client(fixture()),stream,async()=>false),/semantic/));
test('replay accepts empty stream with genesis head',async()=>{
 const r=await replay(client([]),stream,()=>true);assert.equal(r.headHash,'GENESIS');assert.equal(r.forecastCount,0);
});
