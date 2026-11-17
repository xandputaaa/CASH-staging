'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const js=fs.readFileSync(path.join(__dirname,'../order-verify-ui.js'),'utf8');
function setup({configured=false}={}){
 const els={},listeners={};
 for(const id of ['cashOrderVerify','orderVerifyStatus','orderVerifyResult',
  'orderVerifyButton','orderVerifyToken','orderVerifyId','orderGenerateToken','orderTokenGuide']){
  els[id]={id,textContent:'',value:'',disabled:false,
   addEventListener(type,callback){listeners[id+':'+type]=callback}};
 }
 const readCalls=[],copied=[],testResponse={
  state:configured?'PRIVATE_VERIFICATION_CONFIGURED':'NOT_CONNECTED',
  exchangeReadAuthState:configured?'AUTHENTICATED_READ_ONLY':'NOT_CONNECTED'};
 const ctx={document:{getElementById:id=>els[id]||null},Uint8Array,
  AbortController,clearTimeout:()=>{},setTimeout:()=>1,
  crypto:{getRandomValues(array){for(let i=0;i<array.length;i++)array[i]=i*7%256}},
  navigator:{clipboard:{writeText(secret){copied.push(secret);return Promise.resolve()}}},
  fetch:async (url,opts)=>{readCalls.push({url,opts});
   return {ok:true,json:async()=>testResponse}}};
 vm.runInNewContext(js,ctx);
 return {els,listeners,readCalls,copied};
}
test('64-character owner token is created locally using secure browser RNG and copied only on user action',async()=>{
 const x=setup();
 assert.equal(x.copied.length,0);
 assert.deepEqual(x.readCalls.map(v=>v.url),['/api/order-verification-status']);
 x.listeners['orderGenerateToken:click']();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(x.els.orderVerifyToken.value.length,64);
 assert.match(x.els.orderVerifyToken.value,/^[0-9a-f]{64}$/);
 assert.equal(x.copied[0],x.els.orderVerifyToken.value);
 assert.equal(x.readCalls.length,1); // no POST of the new token
 assert.match(x.els.orderTokenGuide.textContent,/copied/i);
});
test('Kalshi authenticated read access is distinguished from merely configured credentials',async()=>{
 const x=setup({configured:true});
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(x.els.orderVerifyStatus.textContent,/READ ACCESS VERIFIED/);
 assert.match(x.els.orderVerifyStatus.textContent,/NO ORDER VERIFIED/);
});
