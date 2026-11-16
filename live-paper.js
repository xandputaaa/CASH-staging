'use strict';
/* CASH live-quote paper lab. It never submits an exchange order or produces a verified model forecast. */
(function(){
 const KEY='cash-live-paper-v1',LIMIT=150;
 const $=id=>document.getElementById(id);
 if(!$('lpBalance'))return;
 let balance=100,stake=5,seq=1,entries=[],busy=false,checking=false;const activeQuotes={Kalshi:null,Polymarket:null};
 const money=n=>'$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const cents=n=>(n*100).toFixed(1)+'¢';
 const escapeHtml=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function message(str){$('lpMessage').textContent=str}
 function save(){try{localStorage.setItem(KEY,JSON.stringify({version:1,balance,stake,seq,entries}))}catch{message('Browser storage unavailable. Export your paper journal to preserve it.')}}
 function goodEntry(x){
  return x&&Number.isInteger(x.id)&&x.id>0&&['Kalshi','Polymarket'].includes(x.venue)
   &&typeof x.marketId==='string'&&x.marketId.length>=6&&x.marketId.length<=100
   &&(x.venue==='Kalshi'?['YES','NO'].includes(x.side):['UP','DOWN'].includes(x.side))
   &&[2,5,10].includes(x.stake)&&Number.isFinite(x.price)&&x.price>0&&x.price<1
   &&Number.isFinite(x.units)&&x.units>0&&typeof x.placedAt==='string'
   &&Number.isFinite(Date.parse(x.placedAt))&&Number.isFinite(Date.parse(x.endTime))
   &&['PENDING','WON','LOST','VOID'].includes(x.status)
   &&(x.status==='PENDING'||(Number.isFinite(x.payout)&&x.payout>=0&&Number.isFinite(x.net)));
 }
 function restore(){
  try{
   const s=JSON.parse(localStorage.getItem(KEY));
   if(!s||s.version!==1||!Number.isFinite(s.balance)||s.balance<0||s.balance>1000000
    ||![2,5,10].includes(s.stake)||!Number.isInteger(s.seq)||s.seq<1
    ||!Array.isArray(s.entries)||s.entries.length>LIMIT||!s.entries.every(goodEntry))return;
   balance=s.balance;stake=s.stake;seq=s.seq;entries=s.entries;
  }catch{}
 }
 function renderButtons(){
  const options=[['Kalshi','YES','lpKalshiYes'],['Kalshi','NO','lpKalshiNo'],['Polymarket','UP','lpPolyUp'],['Polymarket','DOWN','lpPolyDown']];
  options.forEach(([venue,side,id])=>{
   const button=$(id);
   if(!button)return;
   const already=!!activeQuotes[venue]&&entries.some(e=>e.venue===venue&&e.marketId===activeQuotes[venue]&&e.side===side);
   button.disabled=busy||already;
   button.textContent=already?side+' · Recorded':'Paper '+side;
  });
 }
 function renderTickets(){
  const recentPending=entries.filter(e=>e.status==='PENDING').slice(0,3);
  const selected=recentPending.length?recentPending:entries.slice(0,1);
  if(!selected.length){$('lpActiveList').innerHTML='<p class="lp-active-label">No live-quote paper positions recorded.</p>';return}
  const heading=recentPending.length?'Your pending paper positions':'Most recent paper result';
  const cards=selected.map(e=>{
   const ms=Date.parse(e.endTime),time=new Date(ms).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
   const waiting=e.status==='PENDING',ended=ms<=Date.now();
   const status=waiting?(ended?'AWAITING OFFICIAL RESULT':'PENDING · MARKET OPEN'):e.status;
   const note=waiting?(ended?'Contract window ended. No payout until an official market result is confirmed.':'Market window ends '+time+'. No payout has been determined.'):'Recorded paper net '+(e.net>=0?'+':'−')+money(Math.abs(e.net))+' (fees/slippage excluded).';
   return '<div class="lp-ticket"><div class="lp-ticket-header"><strong>'+escapeHtml(e.venue)+' · '+escapeHtml(e.side)+'</strong><span class="lp-ticket-state'+(waiting?'':' done')+'">'+escapeHtml(status)+'</span></div><div class="lp-ticket-meta">Paper stake '+money(e.stake)+' · observed ask '+cents(e.price)+' · '+escapeHtml(new Date(e.placedAt).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}))+'</div><div class="lp-ticket-meta">'+escapeHtml(note)+'</div><div class="lp-ticket-id">Contract '+escapeHtml(e.marketId)+'</div></div>';
  }).join('');
  $('lpActiveList').innerHTML='<p class="lp-active-label">'+heading+'</p>'+cards+(recentPending.length>3?'<p class="lp-active-label">More pending entries are listed in the journal below.</p>':'');
 }
 function setActiveQuote(venue,id){
  if(!Object.prototype.hasOwnProperty.call(activeQuotes,venue))return;
  activeQuotes[venue]=typeof id==='string'&&id.length>=6?id:null;
  renderButtons();
 }
 function render(){
  $('lpBalance').textContent=money(balance);
  $('lpPositionCount').textContent=entries.length+' recorded';
  $('lpPendingCount').textContent=entries.filter(e=>e.status==='PENDING').length+' awaiting official result';
  [2,5,10].forEach(n=>{const b=$('lpStake'+n);if(b)b.className=stake===n?'active':''});
  $('lpLedger').innerHTML=entries.length?entries.map(e=>{
   const outcome=e.status==='PENDING'?'Awaiting official result':e.status;
   const net=e.status==='PENDING'?'—':(e.net>=0?'+':'−')+money(Math.abs(e.net));
   return '<tr><td>'+escapeHtml(e.venue)+'</td><td>'+escapeHtml(e.side)+'</td><td>'+money(e.stake)+'</td><td>'+cents(e.price)+'</td><td>'+escapeHtml(e.marketId)+'</td><td>'+escapeHtml(outcome)+'</td><td>'+net+'</td></tr>';
  }).join(''):'<tr><td colspan="7" class="muted">No live-quote paper entries yet</td></tr>';
  renderTickets();renderButtons();
  const pending=entries.some(e=>e.status==='PENDING');
  $('lpBackup').disabled=entries.length===0;
  $('lpSync').disabled=checking||!pending;
  $('lpSync').textContent=checking?'Checking official results…':'Check official results';
 }
 function selectStake(n){if(![2,5,10].includes(n))return;stake=n;save();render()}
 function validId(venue,id,slug){
  return venue==='Kalshi'?/^KXBTC15M-[A-Za-z0-9-]{6,70}$/.test(id):
   /^0x[0-9a-fA-F]{64}$/.test(id)&&/^btc-updown-5m-\d{9,12}$/.test(slug);
 }
 async function fetchJson(url,timeoutMs=8500){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{const response=await fetch(url,{cache:'no-store',signal:controller.signal});const data=await response.json();if(!response.ok)throw Error('Market data not available');return data}
  finally{clearTimeout(timer)}
 }
 async function place(venue,side){
  if(busy)return;
  if(venue==='Kalshi'&&!['YES','NO'].includes(side)||venue==='Polymarket'&&!['UP','DOWN'].includes(side)){message('Invalid paper market selection');return}
  if(balance<stake){message('Insufficient fictional paper balance.');return}
  if(entries.length>=LIMIT){message('Journal capacity reached. Export your journal before a new session.');return}
  busy=true;renderButtons();message('Checking latest public quote; this does not submit a real order…');
  try{
   const quote=await fetchJson('/api/markets?venue='+encodeURIComponent(venue));
   const qtime=Date.parse(quote.fetchedAt),end=Date.parse(quote.endTime),now=Date.now();
   if(!['live','partial'].includes(quote.status)||!Number.isFinite(qtime)||now-qtime>13000||qtime-now>5000||!Number.isFinite(end)||end-now<10000)throw Error('Market quote expired, incomplete, or stale. Try the next contract.');
   if(!validId(venue,quote.marketId,quote.slug))throw Error('Venue market identity could not be verified.');
   const price=venue==='Kalshi'?(side==='YES'?quote.yesAsk:quote.noAsk):(side==='UP'?quote.upAsk:quote.downAsk);
   if(!Number.isFinite(price)||price<=0||price>=1)throw Error('Selected outcome has no valid public ask quote.');
   if(entries.some(e=>e.venue===venue&&e.marketId===quote.marketId&&e.side===side)){activeQuotes[venue]=quote.marketId;renderButtons();message('Already recorded: '+venue+' '+side+' for this contract. Your existing paper position and settlement status are shown below.');return}
   const chosenStake=stake;
   if(balance<chosenStake)throw Error('Insufficient fictional paper balance');
   const entry={id:seq++,venue,side,marketId:quote.marketId,slug:venue==='Polymarket'?quote.slug:null,
    title:String(quote.title||'BTC prediction contract').slice(0,180),endTime:quote.endTime,
    placedAt:new Date(now).toISOString(),observedAt:quote.fetchedAt,price,stake:chosenStake,
    units:chosenStake/price,status:'PENDING',payout:null,net:null,settledAt:null,resultSource:null};
   entries.unshift(entry);activeQuotes[venue]=quote.marketId;balance=Math.max(0,balance-chosenStake);save();render();
   message('Paper '+side+' saved at observed '+cents(price)+' ask. Awaiting an official resolution. Fees and slippage are NOT included.');
  }catch(e){message('No position recorded: '+(e&&e.message?e.message:'Quote unavailable'))}
  finally{busy=false;renderButtons()}
 }
 async function check(){
  if(checking)return;
  const waiting=entries.filter(e=>e.status==='PENDING'&&Date.parse(e.endTime)<=Date.now()).slice(0,6);
  if(!waiting.length){message('No expired pending contracts to verify yet. Open positions remain pending.');return}
  checking=true;render();let verified=0;
  for(const e of waiting){
   try{
    const qs=new URLSearchParams({venue:e.venue,marketId:e.marketId});
    if(e.venue==='Polymarket')qs.set('slug',e.slug);
    const outcome=await fetchJson('/api/result?'+qs.toString(),8500);
    if(outcome.status!=='verified'||outcome.marketId!==e.marketId||outcome.venue!==e.venue)continue;
    if(![e.venue==='Kalshi'?'YES':'UP',e.venue==='Kalshi'?'NO':'DOWN','VOID'].includes(outcome.winner))continue;
    e.status=outcome.winner==='VOID'?'VOID':outcome.winner===e.side?'WON':'LOST';
    e.payout=e.status==='VOID'?e.stake:e.status==='WON'?e.units:0;
    e.net=e.payout-e.stake;e.settledAt=outcome.settledAt||outcome.checkedAt;
    e.resultSource=outcome.source;
    balance+=e.payout;verified++;
   }catch{} // Never infer a win/loss from the clock, spot price, or missing data.
  }
  checking=false;save();render();
  message(verified?verified+' paper outcome(s) matched official result responses. Earnings exclude fees and slippage.':'No final verified market results yet; pending positions were not changed.');
 }
 function exportJournal(){
  if(!entries.length)return;
  const value={format:'CASH-live-quote-paper-v1',exportedAt:new Date().toISOString(),mode:'paper-only-unverified-local-journal',balance,stake,entries};
  const a=document.createElement('a');
  a.href='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(value,null,2));
  a.download='CASH-live-paper-journal.json';
  document.body.appendChild(a);a.click();a.remove();
 }
 function importJournal(event){
  const input=event?.target,file=input?.files?.[0];
  if(!file)return;
  if(file.size>1048576){message('Import rejected: journal exceeds 1 MB.');input.value='';return}
  const reader=new FileReader();
  reader.onload=()=>{
   try{
    const v=JSON.parse(reader.result);
    if(v?.format!=='CASH-live-quote-paper-v1'||v?.mode!=='paper-only-unverified-local-journal'
     ||!Number.isFinite(v.balance)||v.balance<0||v.balance>1000000
     ||![2,5,10].includes(v.stake)||!Array.isArray(v.entries)
     ||v.entries.length>LIMIT||!v.entries.every(goodEntry))throw Error('Invalid CASH live paper backup');
    if(!confirm('Replace your LIVE-QUOTE paper journal with this imported file? Export the current journal first.'))return;
    entries=v.entries.map(x=>({...x}));
    balance=v.balance;stake=v.stake;seq=1+entries.reduce((n,x)=>Math.max(n,x.id),0);
    save();render();message('Local live-quote paper journal restored. These records are not server-verified and do not count toward prospective validation.');
   }catch(e){message('Import rejected: '+e.message)}
  };
  reader.onerror=()=>message('Could not read the journal backup');
  reader.readAsText(file);input.value='';
 }
 function resetJournal(){
  if(!confirm('Permanently clear the local LIVE-QUOTE paper journal and reset its paper balance to $100? Export JSON first. This will erase any pending positions and their history.'))return;
  balance=100;stake=5;seq=1;entries=[];save();render();message('Live-quote paper journal reset. Previously exported files are unaffected.');
 }
 restore();render();
 if(entries.some(e=>e.status==='PENDING'&&Date.parse(e.endTime)<=Date.now()))check();
 window.CASHLivePaper={place,check,selectStake,setActiveQuote,exportJournal,importJournal,resetJournal};
 if(typeof setInterval==='function')setInterval(()=>{if(entries.some(e=>e.status==='PENDING'&&Date.parse(e.endTime)<=Date.now()))check()},30000);
 if(typeof document.addEventListener==='function')document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});
})();
