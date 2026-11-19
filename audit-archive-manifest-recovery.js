'use strict';
// Read-only manifest recovery inspection. Never assumes a temporary file is
// committed evidence and never deletes crash artifacts.
const fs=require('node:fs'),path=require('node:path');
const {verifyArchiveManifest}=require('./audit-archive-manifest');
function inspectArchiveManifestCommit({directory,filename='shadow-archive-manifest.json',limit=650}){
 if(!path.isAbsolute(directory||''))throw Error('Absolute archive directory required');
 if(filename!=='shadow-archive-manifest.json')throw Error('Unexpected manifest filename');
 const stat=fs.lstatSync(directory);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Unsafe archive directory');
 const candidates=fs.readdirSync(directory).filter(name=>
  name.startsWith('.'+filename+'.')&&name.endsWith('.tmp'));
 for(const name of candidates){
  const entry=fs.lstatSync(path.join(directory,name));
  if(!entry.isFile()||entry.isSymbolicLink())throw Error('Unsafe manifest temp artifact');
 }
 const destination=path.join(directory,filename);
 if(!fs.existsSync(destination))
  return Object.freeze({state:candidates.length?'UNCOMMITTED_TEMP_ARTIFACTS':'NO_MANIFEST',
   temporaryArtifacts:candidates.length,mutatesStorage:false,automaticRolloverEnabled:false});
 const entry=fs.lstatSync(destination);
 if(!entry.isFile()||entry.isSymbolicLink()||entry.size>1024*1024)
  throw Error('Unsafe committed manifest');
 const raw=fs.readFileSync(destination,'utf8');
 if(!raw.endsWith('\n'))throw Error('Incomplete committed manifest');
 const manifest=JSON.parse(raw);
 const verified=verifyArchiveManifest(manifest,{directory,limit});
 return Object.freeze({state:candidates.length?'COMMITTED_WITH_TEMP_ARTIFACTS':'COMMITTED_VERIFIED',
  temporaryArtifacts:candidates.length,segments:verified.segments.length,
  totalEvents:verified.totalEvents,chainTip:verified.chainTip,
  mutatesStorage:false,automaticRolloverEnabled:false});
}
module.exports={inspectArchiveManifestCommit};
