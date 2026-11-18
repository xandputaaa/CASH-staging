'use strict';
/*
 * Isolated, durable, public-spot-only Model Lab shadow source.
 * Opt-in via an EXISTING absolute CASH_AUDIT_DIR mount; without it we do not
 * collect. Persist before publishing. This is never independent attestation.
 */
const fs=require('node:fs'),path=require('node:path');
const {createShadowJournal,verifyShadowJournal}=require('./cash-shadow-journal');
const {shadowMomentumForecast}=require('./cash-shadow-momentum');
const NAME='cash-shadow-model-lab.json';
const MAX_BYTES=2500000,VALID_SOURCE=new Set(['Kraken BTC/USD','Coinbase Exchange BTC-USD']);
const MARKET=/^KXBTC15M-[A-Za-z0-9-]{6,70}$/;
function createShadowLiveFeed({quotes,spot,clock=()=>Date.now(),
 directory=process.env.CASH_AUDIT_DIR,maxRecords=1500}={}){
 if(!quotes||!spot||typeof clock!=='function')throw Error('Shadow feeds required');
 if(!Number.isInteger(maxRecords)||maxRecords<1||maxRecords>1500)
  throw Error('Invalid shadow record limit');
 if(!directory)return Object.freeze({
  enabled:false,scan:async()=>({status:'DURABLE_STORAGE_NOT_CONFIGURED'}),
  view:()=>({status:'DURABLE_STORAGE_NOT_CONFIGURED',records:0,
   independentlyQualified:0,ordersAllowed:false}),
  exportSnapshot:()=>null
 });
 if(typeof directory!=='string'||!path.isAbsolute(directory)||
  !fs.lstatSync(directory).isDirectory())
  throw Error('Shadow journal requires an existing non-symlink absolute audit volume');
 const filename=path.join(directory,NAME);
 let original=null;
 if(fs.existsSync(filename)){
  const stat=fs.lstatSync(filename);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<50||stat.size>MAX_BYTES)
   throw Error('Shadow durable journal invalid or oversized');
  original=JSON.parse(fs.readFileSync(filename,'utf8'));
  verifyShadowJournal(original);
 }
 const journal=createShadowJournal({snapshot:original});
 let committed=journal.exportSnapshot(),faulted=false,inflight=null;
 let scans=0,lastReason=original?'RESTORED_VALID_HASH_CHAIN':'EMPTY_DURABLE_JOURNAL';
 function persist(snapshot){
  const bytes=Buffer.from(JSON.stringify(snapshot)+'\n');
  if(bytes.length>MAX_BYTES)throw Error('Shadow durable snapshot capacity exceeded');
  const tmp=filename+'.tmp-'+process.pid+'-'+clock();
  let fd;
  try{
   fd=fs.openSync(tmp,'wx',0o600);
   fs.writeFileSync(fd,bytes);
   fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
   fs.renameSync(tmp,filename);
   const dirfd=fs.openSync(directory,'r');
   try{fs.fsyncSync(dirfd)}finally{fs.closeSync(dirfd)}
  }finally{
   if(fd!==undefined)fs.closeSync(fd);
   if(fs.existsSync(tmp))fs.unlinkSync(tmp);
  }
 }
 function view(){return {
  status:faulted?'PERSISTENCE_FAILURE':lastReason,
  records:committed.records,headHash:committed.headHash,
  scans,independentlyQualified:0,ordersAllowed:false,
  provenance:'UNVERIFIED_SOURCE_JOURNAL_ON_EXPLICIT_AUDIT_VOLUME'
 }}
 async function scan(){
  if(inflight)return inflight;
  inflight=(async()=>{
   scans++;
   if(faulted)return view();
   try{
    if(committed.records>=maxRecords){lastReason='DURABLE_JOURNAL_CAPACITY';return view()}
    const [q,s]=await Promise.all([quotes.query('Kalshi'),spot.update()]);
    const now=clock();
    if(!q||!MARKET.test(q.marketId||'')||q.venue!=='Kalshi'||
      q.status!=='live'||q.refreshFailed===true||
      q.targetSource!=='KALSHI_FLOOR_STRIKE'||!Number.isFinite(q.targetPrice)||
      q.strikeType!=='greater_or_equal'||q.tieGoesToYes!==true||
      q.contractRuleStatus!=='BRTI_60S_RULE_TEXT_PRESENT'||
      !Number.isFinite(Date.parse(q.fetchedAt))||
      Math.abs(now-Date.parse(q.fetchedAt))>12000){
     lastReason='PUBLIC_KALSHI_STRIKE_OR_RULE_UNVERIFIED';return view();
    }
    const close=Date.parse(q.endTime);
    const leadSeconds=(close-now)/1000;
    if(!Number.isFinite(close)||leadSeconds<90||leadSeconds>780){
     lastReason='OUTSIDE_SHADOW_FREEZE_WINDOW';return view();
    }
    if(committed.events.some(e=>e.marketId===q.marketId)){
     lastReason='ALREADY_FROZEN';return view();
    }
    if(!s||s.status!=='live'||!VALID_SOURCE.has(s.source)||
      !Number.isFinite(Date.parse(s.fetchedAt))||
      Math.abs(now-Date.parse(s.fetchedAt))>12000||
      !Array.isArray(s.history)){
     lastReason='FRESH_PUBLIC_SPOT_UNAVAILABLE';return view();
    }
    const recent=s.history.filter(x=>{
     const t=Date.parse(x?.time);
     return Number.isFinite(t)&&t<=now&&t>=now-360000;
    });
    if(recent.length<14||recent.some(x=>x.source!==s.source)){
     lastReason='INSUFFICIENT_SINGLE_SOURCE_HISTORY';return view();
    }
    const samples=recent.map(x=>({ts:Date.parse(x.time),price:x.price}));
    if(samples.at(-1).ts<now-12000||
      samples.at(-1).ts-samples[0].ts<180000||
      samples.some((x,i)=>!Number.isFinite(x.price)||x.price<=1000||
        (i>0&&(x.ts<=samples[i-1].ts||x.ts-samples[i-1].ts>45000)))){
     lastReason='SPOT_HISTORY_NOT_CONTIGUOUS';return view();
    }
    const forecast=shadowMomentumForecast({
     samples,asOfMs:now,marketId:q.marketId,
     strikePrice:q.targetPrice,leadSeconds
    });
    const written=clock();
    if(written-now>12000||written>=close){
     lastReason='FORECAST_EXPIRED_BEFORE_APPEND';return view();
    }
    journal.append(forecast,{recordedAtMs:written});
    // Do not expose unpersisted records to the observer.
    const next=journal.exportSnapshot();
    try{persist(next)}
    catch(err){faulted=true;lastReason='PERSISTENCE_FAILURE';return view()}
    committed=next;lastReason='FROZEN_AND_PERSISTED';
    return view();
   }catch{
    lastReason='PUBLIC_SOURCE_OR_MODEL_UNAVAILABLE';
    return view();
   }
  })().finally(()=>{inflight=null});
  return inflight;
 }
 return Object.freeze({
  enabled:true,scan,view,
  exportSnapshot:()=>faulted?null:JSON.parse(JSON.stringify(committed))
 });
}
module.exports={createShadowLiveFeed};
