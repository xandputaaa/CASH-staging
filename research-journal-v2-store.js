'use strict';
const {replayResearchStream}=require('./research-journal-v2-replay');
const {appendResearchEvent}=require('./research-journal-v2-adapter');
// No startup wiring. Dedicated client must not be shared with other transactions.
async function createResearchJournalV2Store({client,stream,validateChain,validateEvent}){
 if(typeof validateChain!=='function'||typeof validateEvent!=='function')throw Error('Explicit lane validators required');
 const replay=await replayResearchStream(client,stream,validateChain);
 const events=replay.events;
 let busy=false,blocked=false;
 return {
  mode:'POSTGRES_JOURNAL_UNVERIFIED',configured:true,
  get events(){return structuredClone(events)},
  get blocked(){return blocked},
  async append(event){
   if(blocked||busy)throw Error('Journal unavailable; reconcile before retry');
   busy=true;
   try{
    const original=JSON.stringify(event),candidate=JSON.parse(original);
    if(candidate.sequence!==events.length+1||candidate.previousHash!==(events.at(-1)?.hash||'GENESIS'))throw Error('Local journal head mismatch');
    if(await validateChain(structuredClone([...events,candidate]))!==true)throw Error('Proposed chain rejected');
    await appendResearchEvent(client,stream,original,validateEvent);
    events.push(candidate);
   }catch(e){blocked=true;throw e}
   finally{busy=false}
  }
 };
}
module.exports={createResearchJournalV2Store};
