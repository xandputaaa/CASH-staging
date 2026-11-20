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
function privateAccessGate(req,res,password){
 if(password===undefined)return false;
 if(!authorized(req.headers.authorization,password)){
  res.writeHead(401,{'WWW-Authenticate':'Basic realm="CASH Private Research", charset="UTF-8"',
   'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
  res.end('Private CASH research access required');
  return true;
 }
 return false;
}
module.exports={authorized,privateAccessGate};
