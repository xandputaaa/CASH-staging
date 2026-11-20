'use strict';
const fs=require('node:fs'),path=require('node:path');
function assertSafeStartupConfiguration(env=process.env){
 const secret=env.CASH_PRIVATE_ACCESS_PASSWORD;
 if(secret!==undefined&&(typeof secret!=='string'||secret.length<16||secret.length>512))
  throw Error('CASH_PRIVATE_ACCESS_PASSWORD must contain 16-512 characters');
 if(env.CASH_ARCHIVE_DIR!==undefined){
  if(!path.isAbsolute(env.CASH_ARCHIVE_DIR))
   throw Error('CASH_ARCHIVE_DIR must be absolute');
  const st=fs.lstatSync(env.CASH_ARCHIVE_DIR);
  if(!st.isDirectory()||st.isSymbolicLink())throw Error('Unsafe archive directory');
  if(fs.existsSync(path.join(env.CASH_ARCHIVE_DIR,'shadow-archive-manifest.json')))
   throw Error('Archive-aware live startup is not enabled; refusing committed archive manifest');
 }
 if(env.CASH_EXCLUSIVE_JOURNAL_WRITER!==undefined&&
    !['0','1'].includes(env.CASH_EXCLUSIVE_JOURNAL_WRITER))
  throw Error('Invalid CASH_EXCLUSIVE_JOURNAL_WRITER value');
 return true;
}
module.exports={assertSafeStartupConfiguration};
