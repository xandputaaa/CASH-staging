'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {verifyProspectiveIntegrity}=require('../prospective-store');
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function fixture(count){
 let previousHash='GENESIS';
 return Array.from({length:count},(_,i)=>{
 const body={sequence:i+1,previousHash,type:'FORECAST',payload:{marketId:'KXBTC15M-TEST-'+String(i).padStart(6,'0')}};
 const event={...body,hash:sha(body)};previousHash=event.hash;return event;
 });
}
test('early structural replay accepts 641 unique synthetic markets',()=>{
 const events=fixture(641),result=verifyProspectiveIntegrity(events);
 assert.equal(result.activeForecasts.size,641);
 assert.equal(result.headHash,events.at(-1).hash);
});
test('early structural replay rejects duplicates beyond legacy capacity',()=>{
 const events=fixture(641),last=events.at(-1);
 last.payload.marketId=events[0].payload.marketId;
 const {hash,...body}=last;last.hash=sha(body);
 assert.throws(()=>verifyProspectiveIntegrity(events),/duplicate/);
});
test('early structural replay rejects altered hash beyond legacy capacity',()=>{
 const events=fixture(641);events.at(-1).hash='0'.repeat(64);
 assert.throws(()=>verifyProspectiveIntegrity(events),/integrity/);
});
