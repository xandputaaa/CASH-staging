'use strict';
// Explicit single-writer lease for future journal cutover coordination.
// Not yet wired to the live monitor: callers must hold the lease across
// append, archive verification, manifest commit and active-file transition.
const fs=require('node:fs'),path=require('node:path');
function withExclusiveJournalLease({directory},operation){
 if(!path.isAbsolute(directory||''))throw Error('Absolute journal directory required');
 if(typeof operation!=='function')throw Error('Lease operation required');
 const st=fs.lstatSync(directory);
 if(!st.isDirectory()||st.isSymbolicLink())throw Error('Unsafe journal directory');
 const lock=path.join(directory,'.shadow-journal-writer.lock');
 // Fail closed on stale locks: never steal an unverified writer lease.
 const fd=fs.openSync(lock,'wx',0o600);
 const identity=fs.fstatSync(fd);
 try{
  fs.writeSync(fd,JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()})+'\n');
  fs.fsyncSync(fd);
  const result=operation();
  if(result&&typeof result.then==='function')throw Error('Async lease operation unsupported');
  return result;
 }finally{
  // A different process may have replaced the pathname while our lease was held.
  // Never remove another owner's lock or silently grant concurrent ownership.
  let sameOwner=false;
  try{
   const current=fs.lstatSync(lock);
   sameOwner=current.isFile()&&!current.isSymbolicLink()&&
     current.dev===identity.dev&&current.ino===identity.ino;
  }catch(error){if(error.code!=='ENOENT')throw error}
  try{fs.closeSync(fd)}finally{
   if(sameOwner)fs.unlinkSync(lock);
  }
  if(!sameOwner)throw Error('Writer lease pathname changed; manual recovery required');
 }
}
module.exports={withExclusiveJournalLease};
