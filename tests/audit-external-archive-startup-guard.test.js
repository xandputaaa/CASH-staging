'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createAuditJournal}=require('../audit-journal');
test('startup refuses externally stored archive manifest when archive directory is configured',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cash-external-archive-'));
 const previous=process.env.CASH_ARCHIVE_DIR;
 try{
  const active=path.join(root,'active'),archive=path.join(root,'archive');
  fs.mkdirSync(active);fs.mkdirSync(archive);
  fs.writeFileSync(path.join(archive,'shadow-archive-manifest.json'),'{"version":1,"segments":[]}\n');
  process.env.CASH_ARCHIVE_DIR=archive;
  assert.throws(()=>createAuditJournal({directory:active}),/live archive replay is not integrated/);
  fs.unlinkSync(path.join(archive,'shadow-archive-manifest.json'));
  assert.equal(createAuditJournal({directory:active}).configured,true);
 }finally{
  if(previous===undefined)delete process.env.CASH_ARCHIVE_DIR;else process.env.CASH_ARCHIVE_DIR=previous;
  fs.rmSync(root,{recursive:true,force:true});
 }
});
