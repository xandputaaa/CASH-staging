'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {hashEvent}=require('../audit-journal');
const {inspectArchiveSemanticIndex}=require('../audit-archive-semantic-index');
function capture(n){
 const captured=Date.parse('2026-11-19T20:00:00Z'),id='Kalshi:KXBTC15M-TEST-'+n;
 return {id,venue:'Kalshi',marketId:'KXBTC15M-TEST-'+n,slug:null,
  baselineName:'PUBLIC_MARKET_FAVORED_ASK_V1',baselineSide:'YES',
  quoteSource:'Kalshi public YES/NO asks',normalizedMarketShare:0.6,
  observedAsks:{YES:0.6,NO:0.4},spotCandidate:null,
  serverCapturedAt:new Date(captured).toISOString(),
  quoteFetchedAt:new Date(captured-1000).toISOString(),
  endTime:new Date(captured+120000).toISOString(),leadMs:120000};
}
function segment(ids){
 let previousHash='GENESIS';
 return ids.map((n,i)=>{
  const body={sequence:i+1,type:'CAPTURE',recordedAt:'2026-11-19T20:00:00Z',
   payload:capture(n),previousHash};
  const event={...body,hash:hashEvent(body)};
  previousHash=event.hash;return event;
 });
}
test('semantic index accepts more than 650 events spread over bounded segments and rejects historical duplicate',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cash-index-long-'));
 try{
  const segments=[],counts=[400,400];let previousChainTip='GENESIS';
  for(let k=0;k<counts.length;k++){
   const events=segment(Array.from({length:counts[k]},(_,i)=>k*400+i));
   const filename='shadow-segment-long-'+k+'.jsonl';
   const raw=events.map(JSON.stringify).join('\n')+'\n';
   fs.writeFileSync(path.join(directory,filename),raw);
   const chainTip=events[events.length-1].hash;
   segments.push({filename,sha256:createHash('sha256').update(raw).digest('hex'),
    chainTip,eventCount:events.length,previousChainTip});
   previousChainTip=chainTip;
  }
  const activeJournalPath=path.join(directory,'shadow-events.jsonl');
  fs.writeFileSync(activeJournalPath,'');
  const args={manifest:{version:1,segments},directory,activeJournalPath};
  const state=inspectArchiveSemanticIndex(args);
  assert.equal(state.captures,800);
  assert.equal(state.pending,800);
  assert.equal(state.archivedEvents,800);
  assert.equal(state.automaticRolloverEnabled,false);
  fs.writeFileSync(activeJournalPath,segment([0]).map(JSON.stringify).join('\n')+'\n');
  assert.throws(()=>inspectArchiveSemanticIndex(args),/Duplicate capture/);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
