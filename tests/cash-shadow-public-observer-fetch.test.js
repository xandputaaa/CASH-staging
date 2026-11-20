'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {getPublicSnapshot}=require('../cash-shadow-public-observer-runner');

test('public shadow observer fetch refuses redirects before reading any body',async()=>{
 let seen=false;
 const fetchImpl=async (_url,options)=>{
  assert.equal(options.redirect,'error');
  assert.equal(options.headers.Accept,'application/json');
  seen=true;
  throw new TypeError('redirect blocked');
 };
 await assert.rejects(getPublicSnapshot('https://example.invalid/shadow',{fetchImpl}),/redirect blocked/);
 assert.equal(seen,true);
});

test('public shadow observer rejects non-OK responses without parsing their bodies',async()=>{
 let bodyRead=false;
 const fetchImpl=async (_url,options)=>{
  assert.equal(options.redirect,'error');
  return {ok:false,status:401,text:async()=>{bodyRead=true;return 'sensitive';}};
 };
 await assert.rejects(getPublicSnapshot('https://example.invalid/shadow',{fetchImpl}),/SHADOW_SOURCE_HTTP_401/);
 assert.equal(bodyRead,false);
});

test('public shadow observer retains exact successful source-body digest',async()=>{
 const crypto=require('node:crypto');
 const body='{"events":[]}';
 const fetchImpl=async (_url,options)=>{
  assert.equal(options.redirect,'error');
  return {ok:true,text:async()=>body};
 };
 const got=await getPublicSnapshot('https://example.invalid/shadow',{fetchImpl});
 assert.deepEqual(got.snapshot,{events:[]});
 assert.equal(got.sha256,crypto.createHash('sha256').update(body).digest('hex'));
});
