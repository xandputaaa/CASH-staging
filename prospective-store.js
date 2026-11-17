'use strict';
/*
 * Optional existing CASH_AUDIT_DIR storage: separate forecast event chain.
 * Never writes unless the operator has mounted the explicit audit directory.
 * No cloud export, paid integration, account credentials or orders.
 */
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const NAME='prospective-kalshi-events.jsonl',LIMIT=640;
const SHA=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function createProspectiveStore({directory=process.env.CASH_AUDIT_DIR}={}){
 if(!directory)return {mode:'VOLATILE_SERVER_SESSION',events:[],append(){}};
 if(typeof directory!=='string'||!path.isAbsolute(directory)||!fs.statSync(directory).isDirectory())
  throw Error('Prospective audit directory must be pre-mounted absolute directory');
 const filename=path.join(directory,NAME);
 const raw=fs.existsSync(filename)?fs.readFileSync(filename,'utf8'):'';
 if(Buffer.byteLength(raw)>20*1024*1024||raw&&!raw.endsWith('\n'))
  throw Error('Prospective journal truncated or oversized');
 const events=raw?raw.trimEnd().split('\n').map(x=>JSON.parse(x)):[];
 let prev='GENESIS';
 for(const e of events){
  const {hash,...body}=e;
  if(e.previousHash!==prev||e.sequence!==events.indexOf(e)+1||
    !['FORECAST','OUTCOME'].includes(e.type)||SHA(body)!==hash)
   throw Error('Prospective journal integrity invalid');
  prev=hash;
 }
 function append(e){
  if(events.length>=LIMIT)throw Error('Prospective journal full');
  const {hash,...body}=e;
  if(e.sequence!==events.length+1||e.previousHash!==(events.at(-1)?.hash||'GENESIS')||
   SHA(body)!==hash)throw Error('Invalid prospective journal append');
  const buffer=Buffer.from(JSON.stringify(e)+'\n');
  if((fs.existsSync(filename)?fs.statSync(filename).size:0)+buffer.byteLength>20*1024*1024)
   throw Error('Prospective journal size full');
  const fd=fs.openSync(filename,'a',0o600);
  try{fs.writeSync(fd,buffer,0,buffer.length);fs.fsyncSync(fd)}
  finally{fs.closeSync(fd)}
  events.push(e);
 }
 return {mode:'FILESYSTEM_JOURNAL_UNVERIFIED',events,append,path:filename};
}
module.exports={createProspectiveStore};
