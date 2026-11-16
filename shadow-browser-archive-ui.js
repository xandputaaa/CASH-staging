'use strict';
(function(){
 const root=document.getElementById('cashBrowserArchive');
 if(!root||!window.CASHShadowArchive)return;
 const el=id=>document.getElementById(id);
 const status=el('archiveState'),stats=el('archiveCount');
 const download=el('archiveDownload'),clear=el('archiveClear');
 let client;
 function show(){
  const info=client.summary();
  stats.textContent=info.sessions+' saved sessions · '+info.events+' copied events'+
   (info.evictedSessions?' · '+info.evictedSessions+' older sessions evicted':'');
  download.disabled=info.sessions===0;clear.disabled=info.sessions===0;
 }
 try{client=window.CASHShadowArchive.createBrowserArchive({
  storage:window.localStorage,cryptoImpl:window.crypto});
  show();
  status.textContent='LOCAL ARCHIVE READY · UNVERIFIED';
 }catch(e){
  status.textContent='LOCAL STORAGE UNAVAILABLE';
  stats.textContent='This browser cannot preserve session copies';
  download.disabled=true;clear.disabled=true;return;
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
   download.disabled=client.summary().sessions===0;
  }finally{clearTimeout(timeout);inflight=false}
 }
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
