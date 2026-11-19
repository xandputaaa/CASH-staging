'use strict';
// Offline durable manifest commit primitive. Does not rotate the active journal.
// Caller must coordinate all journal writers and verify archived segments first.
const fs=require('node:fs'),path=require('node:path');
const {verifyArchiveManifest}=require('./audit-archive-manifest');
function commitVerifiedArchiveManifest({directory,manifest,filename='shadow-archive-manifest.json',limit=650}){
 if(!path.isAbsolute(directory||''))throw Error('Absolute archive directory required');
 if(filename!=='shadow-archive-manifest.json')throw Error('Unexpected manifest filename');
 const st=fs.lstatSync(directory);
 if(!st.isDirectory()||st.isSymbolicLink())throw Error('Unsafe archive directory');
 const verified=verifyArchiveManifest(manifest,{directory,limit});
 const destination=path.join(directory,filename);
 if(fs.existsSync(destination))throw Error('Manifest already exists; overwrite prohibited');
 const temporary=path.join(directory,'.'+filename+'.'+process.pid+'.tmp');
 const data=Buffer.from(JSON.stringify(manifest)+'\n');
 let fd;
 try{
  fd=fs.openSync(temporary,'wx',0o600);
  let offset=0;
  while(offset<data.length)offset+=fs.writeSync(fd,data,offset,data.length-offset);
  fs.fsyncSync(fd);
  fs.closeSync(fd);fd=null;
  // Exclusive destination claim: hard link refuses overwrite if another
  // writer committed first. Rename alone would silently replace it.
  fs.linkSync(temporary,destination);
  const dirfd=fs.openSync(directory,'r');
  try{fs.fsyncSync(dirfd)}finally{fs.closeSync(dirfd)}
  return Object.freeze({status:'VERIFIED_MANIFEST_COMMITTED',manifestPath:destination,
   segments:verified.segments.length,totalEvents:verified.totalEvents,
   activeJournalRotated:false,automaticRolloverEnabled:false});
 }finally{
  if(fd!==undefined&&fd!==null)fs.closeSync(fd);
  try{fs.unlinkSync(temporary)}catch(e){if(e.code!=='ENOENT')throw e}
 }
}
module.exports={commitVerifiedArchiveManifest};
