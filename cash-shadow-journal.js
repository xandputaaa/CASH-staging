'use strict';
/*
 * Standalone append-only in-memory shadow commitment journal.
 * Hash chains detect alteration of exported snapshots but DO NOT independently
 * attest timestamps. Persist/observe externally before contract close.
 */
const crypto=require('node:crypto');
const {ID}=require('./cash-shadow-momentum');
const VERSION='CASH_SHADOW_HASHED_JOURNAL_V1';
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function createShadowJournal(){
 const events=[],markets=new Set();
 function append(forecast,{recordedAtMs}={}){
  if(!forecast||forecast.modelId!==ID||
   !/^KXBTC15M-[A-Za-z0-9-]{6,70}$/.test(forecast.marketId||'')||
   !['YES','NO','WAIT'].includes(forecast.side)||
   !Number.isFinite(forecast.asOfMs)||
   !Number.isFinite(forecast.leadSeconds)||
   !Number.isFinite(recordedAtMs)||
   recordedAtMs<forecast.asOfMs||
   recordedAtMs-forecast.asOfMs>12000||
   forecast.leadSeconds<90||forecast.leadSeconds>780||
   markets.has(forecast.marketId)||
   forecast.executionAllowed!==false||forecast.calibrated!==false||
   forecast.probability!==null)
   throw Error('Invalid, late, duplicate or executable shadow forecast');
  const closesAtMs=forecast.asOfMs+forecast.leadSeconds*1000;
  if(recordedAtMs>=closesAtMs)throw Error('Expired forecast');
  const body={
   sequence:events.length+1,previousHash:events.at(-1)?.hash||'GENESIS',
   type:'SHADOW_FORECAST',modelId:ID,marketId:forecast.marketId,
   side:forecast.side,reason:forecast.reason,
   asOfMs:forecast.asOfMs,recordedAtMs,closesAtMs,
   strikePrice:forecast.strikePrice,
   featureHash:hash(forecast.features),
   calibrated:false,executionAllowed:false
  };
  const event=Object.freeze({...body,hash:hash(body)});
  events.push(event);markets.add(forecast.marketId);
  return event;
 }
 function exportSnapshot(){
  return {version:VERSION,modelId:ID,records:events.length,
   headHash:events.at(-1)?.hash||'GENESIS',
   independentlyWitnessed:false,independentQualificationCount:0,
   realMoneyOrdersAllowed:false,events:events.map(e=>({...e}))};
 }
 return Object.freeze({append,exportSnapshot});
}
function verifyShadowJournal(snapshot){
 if(!snapshot||snapshot.version!==VERSION||snapshot.modelId!==ID||
  !Array.isArray(snapshot.events)||snapshot.events.length>100000||
  snapshot.records!==snapshot.events.length||
  snapshot.independentlyWitnessed!==false||
  snapshot.independentQualificationCount!==0||
  snapshot.realMoneyOrdersAllowed!==false)throw Error('Invalid journal envelope');
 let previous='GENESIS';const seen=new Set();
 for(let i=0;i<snapshot.events.length;i++){
  const e=snapshot.events[i];
  if(!e||e.sequence!==i+1||e.previousHash!==previous||
   e.type!=='SHADOW_FORECAST'||e.modelId!==ID||
   !/^KXBTC15M-[A-Za-z0-9-]{6,70}$/.test(e.marketId||'')||
   seen.has(e.marketId)||!['YES','NO','WAIT'].includes(e.side)||
   !Number.isFinite(e.asOfMs)||!Number.isFinite(e.recordedAtMs)||
   !Number.isFinite(e.closesAtMs)||e.recordedAtMs<e.asOfMs||
   e.recordedAtMs-e.asOfMs>12000||
   e.closesAtMs-e.asOfMs<90000||
   e.closesAtMs-e.asOfMs>780000||
   e.recordedAtMs>=e.closesAtMs||
   !Number.isFinite(e.strikePrice)||e.strikePrice<=0||
   !/^[a-f0-9]{64}$/.test(e.featureHash||'')||
   e.calibrated!==false||e.executionAllowed!==false)
   throw Error('Malformed shadow commitment');
  const {hash:claimed,...body}=e;
  if(claimed!==hash(body))throw Error('Shadow hash chain mismatch');
  previous=claimed;seen.add(e.marketId);
 }
 if(snapshot.headHash!==previous)throw Error('Shadow head mismatch');
 return true;
}
module.exports={createShadowJournal,verifyShadowJournal,VERSION};
