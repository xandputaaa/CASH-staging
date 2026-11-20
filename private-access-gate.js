'use strict';
// Optional HTTP Basic access gate for private family-and-friends research.
// Enable only with CASH_PRIVATE_ACCESS_PASSWORD set through Railway secrets.
const {timingSafeEqual,createHash}=require('node:crypto');
function digest(value){return createHash('sha256').update(value).digest()}
function authorized(header,password){
 if(typeof password!=='string'||password.length<16)throw Error('Private access password must be at least 16 characters');
 if(typeof header!=='string'||!header.startsWith('Basic '))return false;
 const token=header.slice(6);
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(token)||token.length>4096)return false;
 let raw;
 try{raw=Buffer.from(token,'base64').toString('utf8')}catch{return false}
 if(Buffer.from(raw).toString('base64')!==token)return false;
 const separator=raw.indexOf(':');
 if(separator<0)return false;
 const username=raw.slice(0,separator),candidate=raw.slice(separator+1);
 return timingSafeEqual(digest(username+'\\0'+candidate),digest('cash\\0'+password));
}
const attempts=new Map();
function privateAccessGate(req,res,password){
 if(password===undefined)return false;
 const now=Date.now();
 const key=String(req.socket?.remoteAddress||'unknown');
 // Bounded in-process throttling. For multiple replicas, enforce limits at the edge.
 for(const [address,state] of attempts){
  if(now-state.start>60000)attempts.delete(address);
 }
 const state=attempts.get(key);
 if(state&&state.count>=20&&now-state.start<=60000){
  res.writeHead(429,{'Content-Type':'text/plain; charset=utf-8',
   'Cache-Control':'no-store','Retry-After':'60'});
  res.end('Too many authentication attempts');
  return true;
 }
 if(!authorized(req.headers.authorization,password)){
  if(attempts.size>=1000)attempts.clear();
  if(!state||now-state.start>60000)attempts.set(key,{start:now,count:1});
  else state.count++;
  res.writeHead(401,{'WWW-Authenticate':'Basic realm="CASH Private Research", charset="UTF-8"',
   'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
  res.end('Private CASH research access required');
  return true;
 }
 attempts.delete(key);
 return false;
}
module.exports={authorized,privateAccessGate};
