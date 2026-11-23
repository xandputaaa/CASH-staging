'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {assessResearchJournalRunway,run}=require('../cash-journal-runway');
function early(records=320,pending=0){
 const events=[...Array(records)].map(()=>({type:'FORECAST'}))
  .concat([...Array(records-pending)].map(()=>({type:'OUTCOME'})));
 return {version:'CASH_PROSPECTIVE_KALSHI_V1',
  format:'CASH_PROSPECTIVE_HASHED_SESSION_V1',
  records,pending,directional:0,waits:records,events,
  tradingAuthorized:false,automatedOrdersEnabled:false,
  qualifiedCount:0,modelCalibrated:false,independentlyTimeAttested:false};
}
function late(records=141,pending=1){
 const events=[...Array(records)].map(()=>({type:'FORECAST'}))
  .concat([...Array(records-pending)].map(()=>({type:'OUTCOME'})));
 return {version:'CASH_LATE_CHECKPOINT_SHADOW_V1',
  format:'CASH_LATE_CHECKPOINT_UNVERIFIED_HASH_CHAIN_V1',
  records,pending,events,independentQualification:0,
  independentlyTimeAttested:false,calibrated:false,
  canExecuteOrders:false,realMoneyAuthorized:false};
}
test('real-like late 141/160 and early 320/320 are critical/full, with no trading or restart',()=>{
 const x=assessResearchJournalRunway({early:early(),late:late()});
 assert.equal(x.early.state,'FULL');
 assert.equal(x.late.state,'CRITICAL');
 assert.equal(x.late.remainingDefaultSlots,19);
 assert.equal(x.alert,'LATE_JOURNAL_CRITICAL');
 assert.equal(x.currentServerCapacityVerified,false);
 assert.equal(x.exportIsCompleteServerBackup,false);
 assert.equal(x.independentlyQualifiedCount,0);
 assert.equal(x.safeToRestartRailway,false);
 assert.equal(x.safeToRotate,false);
 assert.equal(x.ordersEnabled,false);
});
test('missing late export means unknown capacity, never safe-to-reset',()=>{
 const x=assessResearchJournalRunway({early:early(),late:null});
 assert.equal(x.late.state,'SOURCE_UNAVAILABLE');
 assert.equal(x.alert,'LATE_SOURCE_UNKNOWN');
 assert.equal(x.safeToRestartRailway,false);
});
test('zero remaining slots produces FULL; low capacity produces LOW',()=>{
 assert.equal(assessResearchJournalRunway({early:early(50),late:late(160,0)}).late.state,'FULL');
 assert.equal(assessResearchJournalRunway({early:early(50),late:late(130,1)}).late.state,'LOW');
 assert.equal(assessResearchJournalRunway({early:early(50),late:late(80,1)}).late.state,'HAS_HEADROOM');
});
test('forged privileged metadata and inconsistent counts are refused',()=>{
 for(const mutation of [
  x=>x.canExecuteOrders=true,
  x=>x.realMoneyAuthorized=true,
  x=>x.independentQualification=10,
  x=>x.records=161,
  x=>x.pending=999,
  x=>x.events.pop()
 ]){
  const x=late();mutation(x);
  assert.throws(()=>assessResearchJournalRunway({early:early(),late:x}));
 }
 const y=early();y.qualifiedCount=1;
 assert.throws(()=>assessResearchJournalRunway({early:y,late:late()}));
});
test('scheduled run emits only bounded warning metadata and keeps source files unchanged',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cash-runway-'));
 const a=path.join(root,'early.json'),b=path.join(root,'late.json'),messages=[];
 try{
  fs.writeFileSync(a,JSON.stringify(early()));
  fs.writeFileSync(b,JSON.stringify(late()));
  const pre=fs.readFileSync(b,'utf8');
  const result=run(a,b,{log:msg=>messages.push(msg)});
  assert.equal(result.alert,'LATE_JOURNAL_CRITICAL');
  assert.ok(messages.some(s=>s.startsWith('::warning title=CASH BTC15 research journal at risk::')));
  assert.ok(messages.includes('CASH_RESEARCH_RUNWAY_SAFE_TO_RESTART=false'));
  assert.equal(fs.readFileSync(b,'utf8'),pre);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('existing twice-hourly workflow uploads original artifacts before emitting risk warning',()=>{
 const yml=fs.readFileSync(path.join(__dirname,'..','.github','workflows','research-snapshot.yml'),'utf8');
 const upload=yml.indexOf('- name: Save temporary public research ZIP in this GitHub run');
 const warning=yml.indexOf('- name: Warn when BTC15 research journal is close to its default capacity');
 assert.ok(upload>0&&warning>upload);
 assert.match(yml,/node cash-journal-runway\.js recovery\/cash-public-research-unverified\.json recovery\/cash-late-checkpoint-unverified\.json/);
 assert.match(yml,/continue-on-error: true/);
});
