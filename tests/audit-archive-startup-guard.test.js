'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createAuditJournal}=require('../audit-journal');
test('live startup refuses committed archive manifest until full replay integration',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-archive-startup-'));
 try{
  fs.writeFileSync(path.join(directory,'shadow-archive-manifest.json'),'{"version":1,"segments":[]}\n');
  assert.throws(()=>createAuditJournal({directory}),/live archive replay is not integrated/);
  assert.equal(fs.existsSync(path.join(directory,'shadow-events.jsonl')),false);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
test('ordinary pre-archive journal startup remains available',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-archive-startup-'));
 try{assert.equal(createAuditJournal({directory}).configured,true)}
 finally{fs.rmSync(directory,{recursive:true,force:true})}
});
