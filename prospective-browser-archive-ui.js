'use strict';
/* Local copy of a public research export, never an order or verified forecast. */
(function(){
 const panel=document.getElementById('cashProspectiveArchive');
 if(!panel||!window.CASHProspectiveArchive)return;
 const el=id=>document.getElementById(id);
 const state=el('pfaState'),count=el('pfaCount'),download=el('pfaDownload'),
  restore=el('pfaRestore'),clear=el('pfaClear');
 let archive;
 try{
  archive=window.CASHProspectiveArchive.createArchive({
   storage:window.localStorage,cryptoImpl:window.crypto});
 }catch{
  state.textContent='DEVICE STORAGE UNAVAILABLE';
  count.textContent='Manual server export remains available';
  download.disabled=true;restore.disabled=true;clear.disabled=true;
  return;
 }
 function render(){
  const x=archive.summary();
  count.textContent=x.sessions+' saved journal snapshots · '+
   x.uniqueProxyMarkets+' unique public-proxy markets · '+
   x.redactedCommitments+' redacted-index commitments · 0/100 independently validated';
  download.disabled=x.sessions===0;clear.disabled=x.sessions===0;
 }
 let pending=false;
 async function poll(){
  if(pending||document.hidden)return;
  pending=true;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9500);
  try{
   const response=await fetch('/api/prospective/export',{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error('Server forecast export unavailable');
   const result=await archive.capture(await response.json());
   render();
   state.textContent=result.saved?'BROWSER COPY SAVED · NOT TIME-ATTESTED':
    'BROWSER ARCHIVE READY · NO NEW EVENT';
  }catch(error){
   state.textContent='BACKUP CHECK FAILED';
   count.textContent=String(error.message||'Backup unavailable').slice(0,150);
  }finally{clearTimeout(timer);pending=false}
 }
 download.addEventListener('click',()=>{
  try{
   const blob=new Blob([archive.exportJson()],{type:'application/json'});
   const url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download='CASH-forecast-browser-backup-UNVERIFIED.json';
   document.body.appendChild(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
   state.textContent='LOCAL RESEARCH BACKUP DOWNLOADED';
  }catch{state.textContent='DOWNLOAD FAILED'}
 });
 restore.addEventListener('change',e=>{
  const file=e.target.files?.[0];if(!file)return;
  if(file.size>2600000){
   state.textContent='RESTORE REJECTED · TOO LARGE';restore.value='';return;
  }
  const reader=new FileReader();
  reader.onload=async()=>{
   try{
    const result=await archive.importJson(String(reader.result));
    render();state.textContent=result.saved?
     'FORECAST BACKUP RESTORED · UNVERIFIED':'NO NEW FORECAST RECORDS';
   }catch(error){
    state.textContent='RESTORE REJECTED · '+String(error.message||'invalid').slice(0,110);
   }finally{restore.value=''}
  };
  reader.onerror=()=>{state.textContent='RESTORE READ FAILED';restore.value=''};
  reader.readAsText(file);
 });
 clear.addEventListener('click',()=>{
  if(!window.confirm('Clear this device-only CASH forecast backup? Download a copy first. The live server will not be affected.'))return;
  try{
   archive.clear();render();state.textContent='LOCAL BACKUP CLEARED';
  }catch{state.textContent='LOCAL BACKUP CLEAR FAILED'}
 });
 try{render();state.textContent='DEVICE BACKUP READY · UNVERIFIED'}
 catch{state.textContent='LOCAL BACKUP INTEGRITY ERROR'}
 poll();
 if(typeof setInterval==='function')setInterval(poll,60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll()});
})();