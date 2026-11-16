'use strict';
(function(){
 const root=document.getElementById('cashBrowserArchive');
 if(!root||!window.CASHShadowArchive)return;
 const el=id=>document.getElementById(id);
 const status=el('archiveState'),stats=el('archiveCount');
 const download=el('archiveDownload'),clear=el('archiveClear'),restore=el('archiveRestore');
 let client;
 function show(){
  const info=client.summary();
  stats.textContent=info.sessions+' saved sessions · '+info.events+' copied events'+
   (info.evictedSessions?' · '+info.evictedSessions+' older sessions evicted':'');
  const reviewed=client.review();
  el('archiveReviewMetrics').textContent=reviewed.uniqueMarketIds+' unique markets · '+
    reviewed.withResolutionInCopies+' with copied outcomes · '+
    reviewed.withoutResolutionInCopies+' without copied outcomes';
  el('archiveReviewSources').textContent='Kalshi '+reviewed.perVenue.Kalshi.captures+
    ' captures / '+reviewed.perVenue.Kalshi.paired+' paired · Polymarket '+
    reviewed.perVenue.Polymarket.captures+' captures / '+
    reviewed.perVenue.Polymarket.paired+' paired';
  el('archiveReviewWarnings').textContent=(reviewed.duplicateMarketCaptures?
    reviewed.duplicateMarketCaptures+' overlapping market captures · ':'')+
    (reviewed.conflictingOutcomeMarkets?reviewed.conflictingOutcomeMarkets+
      ' conflicting outcome markets · ':'')+
    (reviewed.unmatchedResolutionEvents||reviewed.incompleteCaptureEvents?
      (reviewed.unmatchedResolutionEvents+reviewed.incompleteCaptureEvents)+
        ' incomplete/unpaired records · ':'')+
    'Historical gaps and uncaptured contracts cannot be inferred. None of these copies qualify toward the 100-contract model gate.';
  download.disabled=info.sessions===0;clear.disabled=info.sessions===0;
 }
 try{client=window.CASHShadowArchive.createBrowserArchive({
  storage:window.localStorage,cryptoImpl:window.crypto});
  show();
  status.textContent='LOCAL ARCHIVE READY · UNVERIFIED';
 }catch(e){
  status.textContent='LOCAL STORAGE UNAVAILABLE';
  stats.textContent='This browser cannot preserve session copies';
  download.disabled=true;restore.disabled=true;
  if(client){
   clear.disabled=false;
   clear.addEventListener('click',()=>{
    if(!window.confirm('Saved CASH archive data is unreadable. Clear local copies? Any downloaded files remain unaffected.'))return;
    try{client.clear();show();status.textContent='CORRUPT LOCAL ARCHIVE CLEARED'}
    catch{status.textContent='CLEAR FAILED'}
   });
  }else clear.disabled=true;
  return;
 }
 let inflight=false;
 async function refresh(){
  if(inflight||document.hidden)return;
  inflight=true;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),9000);
  try{
   const res=await fetch('/api/shadow/export',{cache:'no-store',signal:controller.signal});
   if(!res.ok)throw Error('Server export unavailable');
   const result=await client.capture(await res.json());
   show();
   status.textContent=result.saved?'SESSION COPY SAVED · UNVERIFIED':
    result.reason==='No events to save yet'?'AWAITING SERVER OBSERVATIONS':'LOCAL ARCHIVE READY · UNVERIFIED';
  }catch(e){
   status.textContent='ARCHIVE CHECK FAILED';
   stats.textContent='Not saved: '+String(e.message||'unavailable').slice(0,140);
   try{download.disabled=client.summary().sessions===0}catch{download.disabled=true;status.textContent='LOCAL ARCHIVE INTEGRITY ERROR'}
  }finally{clearTimeout(timeout);inflight=false}
 }

 restore.addEventListener('change',event=>{
  const file=event.target.files?.[0];if(!file)return;
  if(file.size>2400000){status.textContent='IMPORT REJECTED · FILE TOO LARGE';restore.value='';return}
  const reader=new FileReader();
  reader.onload=async()=>{
   try{
    const result=await client.importJson(String(reader.result));
    show();
    status.textContent=(result.importedSessions||result.updatedSessions)?
      'RESTORED '+(result.importedSessions+result.updatedSessions)+' SESSION COPIES · UNVERIFIED':
      'NO NEW ARCHIVED RECORDS';
   }catch(e){status.textContent='IMPORT REJECTED · '+String(e.message||'Invalid backup').slice(0,100)}
   finally{restore.value=''}
  };
  reader.onerror=()=>{status.textContent='IMPORT READ FAILED';restore.value=''};
  reader.readAsText(file);
 });
 download.addEventListener('click',()=>{
  try{
   const blob=new Blob([client.exportJson()],{type:'application/json'});
   const url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download='CASH-local-session-archive-unverified.json';
   document.body.appendChild(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
   status.textContent='BROWSER ARCHIVE EXPORTED · UNVERIFIED';
  }catch(e){status.textContent='EXPORT FAILED'}
 });
 clear.addEventListener('click',()=>{
  if(!window.confirm('Delete all CASH local observation copies on this browser? This cannot be undone. Download an export first if needed.'))return;
  try{client.clear();show();status.textContent='LOCAL ARCHIVE CLEARED'}
  catch(e){status.textContent='CLEAR FAILED'}
 });
 refresh();
 if(typeof setInterval==='function')setInterval(refresh,60000);
 if(typeof document.addEventListener==='function')
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
})();
