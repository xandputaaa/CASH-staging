'use strict';
/* Ambient colors reflect only successive observed spot prices, NOT a CASH forecast. */
(function(){
 const root=document.body;
 let previous=null,previousTime=0;
 const neutral=()=>{root.dataset.marketMood='neutral';previous=null;previousTime=0};
 neutral();
 async function refresh(){
  try{
   const response=await fetch('/api/spot',{cache:'no-store'});
   if(!response.ok)throw Error('Spot unavailable');
   const data=await response.json();
   // Spot API may wrap the latest quote in data.current.
   const q=data.current&&typeof data.current==='object'?data.current:data;
   const value=q.price;
   const timestamp=Date.parse(q.fetchedAt||q.timestamp||'');
   const now=Date.now();
   if(q.status!=='live'||!Number.isFinite(value)||value<=0||
      !Number.isFinite(timestamp)||timestamp>now+2000||now-timestamp>12000){
     neutral();return;
   }
   if(previous!==null&&now-previousTime<=30000){
     root.dataset.marketMood=value>previous?'up':value<previous?'down':'neutral';
   }else root.dataset.marketMood='neutral';
   previous=value;previousTime=now;
  }catch{neutral()}
 }
 refresh();
 setInterval(refresh,12000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();else neutral()});
})();
