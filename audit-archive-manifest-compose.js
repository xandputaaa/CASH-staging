'use strict';
// Read-only manifest composition. No writes, journal rotation or deployment.
const path=require('node:path');
const {verifyArchiveManifest}=require('./audit-archive-manifest');
function composeVerifiedArchiveManifest({directory,entries,limit=650}){
 if(!path.isAbsolute(directory||''))throw Error('Absolute archive directory required');
 if(!Array.isArray(entries)||entries.length===0)throw Error('Archive entries required');
 const segments=entries.map((entry,i)=>{
  if(!entry||typeof entry!=='object'||Array.isArray(entry))throw Error('Invalid archive entry');
  if(i===0&&entry.previousChainTip!=='GENESIS')
   throw Error('First archive must start at GENESIS');
  if(i>0&&entry.previousChainTip!==entries[i-1].chainTip)
   throw Error('Archive manifest continuity mismatch');
  return Object.freeze({...entry});
 });
 const manifest=Object.freeze({version:1,segments:Object.freeze(segments)});
 const verified=verifyArchiveManifest(manifest,{directory,limit});
 if(verified.segments.length!==segments.length)throw Error('Archive verification incomplete');
 return Object.freeze({manifest,verifiedSegments:verified.segments.length,
  totalEvents:verified.totalEvents,chainTip:verified.chainTip,
  mutatesStorage:false,automaticRolloverEnabled:false});
}
module.exports={composeVerifiedArchiveManifest};
