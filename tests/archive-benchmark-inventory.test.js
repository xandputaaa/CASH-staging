'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {archiveBenchmarkInventory}=require('../archive-benchmark-inventory');
test('empty valid archives remain unqualified and have no invented forecasts',()=>{
 const a=fs.mkdtempSync(path.join(os.tmpdir(),'cash-source-'));
 const b=fs.mkdtempSync(path.join(os.tmpdir(),'cash-witness-'));
 try{
  const r=archiveBenchmarkInventory(a,b);
  assert.equal(r.unionArchivedMarkets,0);
  assert.deepEqual(r.missingForecasts,{early:0,late:0});
  assert.equal(r.placeholderWaitsAreNotModelAbstentions,true);
  assert.equal(r.descriptiveWaitCountsIncludeMissingForecastPlaceholders,true);
  assert.equal(r.baseline.eligible,0);
  assert.equal(r.candidate.eligible,0);
  assert.equal(r.completeEvidenceForSuppliedRows,true);
  assert.equal(r.eligibleMarketUniverseKnown,false);
  assert.equal(r.benchmarkQualificationAllowed,false);
  assert.equal(r.independentQualificationCount,0);
  assert.equal(r.ordersEnabled,false);
 }finally{fs.rmSync(a,{recursive:true,force:true});fs.rmSync(b,{recursive:true,force:true})}
});
test('invalid archive paths fail before any benchmark data is emitted',()=>{
 const a=fs.mkdtempSync(path.join(os.tmpdir(),'cash-source-'));
 const b=fs.mkdtempSync(path.join(os.tmpdir(),'cash-witness-'));
 try{
  fs.mkdirSync(path.join(a,'public-sessions'));
  fs.writeFileSync(path.join(a,'public-sessions','bad.json'),'{}');
  assert.throws(()=>archiveBenchmarkInventory(a,b),/Invalid public session archive file/);
 }finally{fs.rmSync(a,{recursive:true,force:true});fs.rmSync(b,{recursive:true,force:true})}
});
