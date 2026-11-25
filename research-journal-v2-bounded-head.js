'use strict';
const {auditJournalSnapshot}=require('./research-journal-v2-paged-audit');
const {appendResearchEvent}=require('./research-journal-v2-adapter');
// Experimental bridge, not wired to monitors. Semantic audit must independently
// validate the exact structural head and must not retain unbounded history.
async function createBoundedJournalHead({client,stream,validateSnapshot,validateEvent,pageSize=256}){
 if(typeof validateSnapshot!=='function'||typeof validateEvent!=='function')throw Error('Explicit bounded semantic validators required');
 let head=await auditJournalSnapshot(client,stream,{pageSize});
 if(await validateSnapshot(Object.freeze({...head}))!==true)throw Error('Semantic snapshot rejected');
 let busy=false,blocked=false;
 return {
  get head(){return {...head}},
  get blocked(){return blocked},
  async append(event){
   if(busy||blocked)throw Error('Journal unavailable; reconcile before retry');
   busy=true;
   try{
    const original=JSON.stringify(event),candidate=JSON.parse(original);
    if(candidate.sequence!==head.sequence+1||candidate.previousHash!==head.headHash)throw Error('Local journal head mismatch');
    await appendResearchEvent(client,stream,original,validateEvent);
    head={sequence:candidate.sequence,headHash:candidate.hash,forecastCount:head.forecastCount+(candidate.type==='FORECAST'?1:0),outcomeCount:head.outcomeCount+(candidate.type==='OUTCOME'?1:0)};
   }catch(error){blocked=true;throw error}
   finally{busy=false}
  }
 };
}
module.exports={createBoundedJournalHead};
