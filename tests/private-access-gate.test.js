'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {authorized,privateAccessGate}=require('../private-access-gate');
const password='private-test-passphrase-123456';
const header=(user,pass)=>'Basic '+Buffer.from(user+':'+pass).toString('base64');
test('private gate accepts only exact cash credentials',()=>{
 assert.equal(authorized(header('cash',password),password),true);
 assert.equal(authorized(header('other',password),password),false);
 assert.equal(authorized(header('cash','wrong'),password),false);
 assert.equal(authorized('Bearer abc',password),false);
 assert.equal(authorized('Basic not valid',password),false);
 assert.equal(authorized(header('cash',password)+'=',password),false);
});
test('private gate refuses weak configured secrets',()=>{
 assert.throws(()=>authorized(header('cash','short'),'short'),/at least 16/);
});
test('private gate returns 401 before routing and no-store',()=>{
 const req={headers:{}};
 const res={writeHead(code,headers){this.code=code;this.headers=headers},end(body){this.body=body}};
 assert.equal(privateAccessGate(req,res,password),true);
 assert.equal(res.code,401);
 assert.match(res.headers['WWW-Authenticate'],/Basic/);
 assert.equal(res.headers['Cache-Control'],'no-store');
 assert.equal(privateAccessGate({headers:{authorization:header('cash',password)}},{},password),false);
 assert.equal(privateAccessGate(req,{},undefined),false);
});

test('private gate throttles repeated failures and accepts authenticated recovery',()=>{
 const req={headers:{},socket:{remoteAddress:'test-throttle-address'}};
 let throttled=false;
 for(let i=0;i<22;i++){
  const res={writeHead(code){this.code=code},end(){}};
  assert.equal(privateAccessGate(req,res,password),true);
  if(res.code===429)throttled=true;
 }
 assert.equal(throttled,true);
 const valid={headers:{authorization:header('cash',password)},socket:req.socket};
 const blocked={writeHead(code){this.code=code},end(){}};
 assert.equal(privateAccessGate(valid,blocked,password),true);
 assert.equal(blocked.code,429);
});
