'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {assertSafeStartupConfiguration}=require('../startup-configuration-gate');
test('startup accepts default config and valid private password',()=>{
 assert.equal(assertSafeStartupConfiguration({}),true);
 assert.equal(assertSafeStartupConfiguration({CASH_PRIVATE_ACCESS_PASSWORD:'valid-private-password-123',CASH_EXCLUSIVE_JOURNAL_WRITER:'1'}),true);
});
test('startup rejects weak or malformed private configuration',()=>{
 for(const value of ['short','x'.repeat(513),'']){
  assert.throws(()=>assertSafeStartupConfiguration({CASH_PRIVATE_ACCESS_PASSWORD:value}),/16-512/);
 }
 assert.throws(()=>assertSafeStartupConfiguration({CASH_EXCLUSIVE_JOURNAL_WRITER:'yes'}),/Invalid/);
});
test('startup refuses archive manifest even when directory is external to audit journal',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cash-startup-gate-'));
 try{
  assert.equal(assertSafeStartupConfiguration({CASH_ARCHIVE_DIR:dir}),true);
  fs.writeFileSync(path.join(dir,'shadow-archive-manifest.json'),'{}');
  assert.throws(()=>assertSafeStartupConfiguration({CASH_ARCHIVE_DIR:dir}),/Archive-aware live startup/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
