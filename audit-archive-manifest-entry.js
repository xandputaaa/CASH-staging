'use strict';
// Construct a manifest entry only from an independently re-read immutable file.
// No manifest write, journal rotation, or automatic cutover.
const fs=require('node:fs'),path=require('node:path');
const {readSegment}=require('./audit-archive-manifest');
const SHA=/^[a-f0-9]{64}$/;
function buildVerifiedArchiveManifestEntry({archivePath,expectedSha256,expectedChainTip,expectedEventCount,previousChainTip='GENESIS',limit=650}){
 if(!path.isAbsolute(archivePath||''))throw Error('Absolute archive path required');
 if(!SHA.test(expectedSha256||'')||!SHA.test(expectedChainTip||'')||
    !(previousChainTip==='GENESIS'||SHA.test(previousChainTip||''))||
    !Number.isSafeInteger(expectedEventCount)||expectedEventCount<1)
  throw Error('Invalid archive expectations');
 const filename=path.basename(archivePath);
 if(!/^shadow-segment-[a-zA-Z0-9-]+\.jsonl$/.test(filename))throw Error('Invalid archive filename');
 const st=fs.lstatSync(archivePath);
 if(!st.isFile()||st.isSymbolicLink())throw Error('Unsafe archive file');
 const actual=readSegment(archivePath,{limit});
 if(actual.sha256!==expectedSha256||actual.chainTip!==expectedChainTip||
    actual.events.length!==expectedEventCount)
  throw Error('Archive differs from expected immutable export');
 return Object.freeze({filename,sha256:actual.sha256,chainTip:actual.chainTip,
  eventCount:actual.events.length,previousChainTip});
}
module.exports={buildVerifiedArchiveManifestEntry};
