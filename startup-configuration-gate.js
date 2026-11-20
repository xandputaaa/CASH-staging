'use strict';
const fs=require('node:fs'),path=require('node:path');
function assertSafeStartupConfiguration(env=process.env){
 const secret=env.CASH_PRIVATE_ACCESS_PASSWORD;
 if(secret!==undefined&&(typeof secret!=='string'||secret.length<16||secret.length>512))
  throw Error('CASH_PRIVATE_ACCESS_PASSWORD must contain 16-512 characters');
 if(env.CASH_EXCLUSIVE_JOURNAL_WRITER!==undefined&&
    !['0','1'].includes(env.CASH_EXCLUSIVE_JOURNAL_WRITER))
  throw Error('Invalid CASH_EXCLUSIVE_JOURNAL_WRITER value');
 if(env.CASH_ARCHIVE_LIVE_RECOVERY!==undefined&&
    !['0','1'].includes(env.CASH_ARCHIVE_LIVE_RECOVERY))
  throw Error('Invalid CASH_ARCHIVE_LIVE_RECOVERY value');
 if(env.CASH_ONE_TIME_ARCHIVE_CUTOVER!==undefined&&
    !['0','1'].includes(env.CASH_ONE_TIME_ARCHIVE_CUTOVER))
  throw Error('Invalid CASH_ONE_TIME_ARCHIVE_CUTOVER value');
 if(env.CASH_ONE_TIME_ARCHIVE_CUTOVER==='1'&&
    (env.CASH_ARCHIVE_LIVE_RECOVERY!=='1'||env.CASH_EXCLUSIVE_JOURNAL_WRITER!=='1'))
  throw Error('One-time cutover requires explicit exclusive live recovery');
 const recovery=env.CASH_ARCHIVE_LIVE_RECOVERY==='1';
 const auditDir=env.CASH_AUDIT_DIR;
 if(auditDir!==undefined){
  if(!path.isAbsolute(auditDir))throw Error('CASH_AUDIT_DIR must be absolute');
  const st=fs.lstatSync(auditDir);
  if(!st.isDirectory()||st.isSymbolicLink())throw Error('Unsafe audit directory');
 }
 if(env.CASH_ARCHIVE_DIR!==undefined){
  if(!path.isAbsolute(env.CASH_ARCHIVE_DIR))
   throw Error('CASH_ARCHIVE_DIR must be absolute');
  const st=fs.lstatSync(env.CASH_ARCHIVE_DIR);
  if(!st.isDirectory()||st.isSymbolicLink())throw Error('Unsafe archive directory');
  if((!auditDir||path.resolve(env.CASH_ARCHIVE_DIR)!==path.resolve(auditDir))&&
     fs.existsSync(path.join(env.CASH_ARCHIVE_DIR,'shadow-archive-manifest.json')))
   throw Error('External archived manifest not supported for live recovery');
 }
 const manifestPresent=Boolean(auditDir&&
  fs.existsSync(path.join(auditDir,'shadow-archive-manifest.json')));
 if(recovery&&(!manifestPresent||env.CASH_EXCLUSIVE_JOURNAL_WRITER!=='1'))
  throw Error('Live archive recovery requires committed local manifest and exclusive writer');
 if(manifestPresent&&!recovery)
  throw Error('Archived journal manifest present: explicit live recovery required');
 return true;
}
module.exports={assertSafeStartupConfiguration};
