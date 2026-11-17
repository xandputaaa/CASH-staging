'use strict';
(function(){
 const root=document.getElementById('cashOrderVerify');if(!root)return;
 const el=id=>document.getElementById(id);
 const status=el('orderVerifyStatus'),result=el('orderVerifyResult'),
  trigger=el('orderVerifyButton'),token=el('orderVerifyToken'),orderId=el('orderVerifyId'),
  generate=el('orderGenerateToken'),guide=el('orderTokenGuide'),
  fallback=el('orderTokenFallback'),copyArea=el('orderTokenCopy'),
  copyBtn=el('orderCopyToken'),selectBtn=el('orderSelectToken'),
  hideBtn=el('orderHideToken');
 // Intentionally keep sensitive access code only in user input, never local
 // storage, URL query, analytics events, logs, or the DOM report.
 async function health(){
  try{
   const res=await fetch('/api/order-verification-status',{cache:'no-store'});
   if(!res.ok)throw Error('Status unavailable');
   const data=await res.json();
   const read=data.exchangeReadAuthState;
   status.textContent=data.state==='PRIVATE_VERIFICATION_CONFIGURED'?
    (read==='AUTHENTICATED_READ_ONLY'?
      'KALSHI READ ACCESS VERIFIED · NO ORDER VERIFIED':
      read==='KEY_REJECTED_OR_SCOPE_DENIED'?
       'KALSHI REJECTED READ KEY · NO ORDER VERIFIED':
      read==='SOURCE_UNAVAILABLE'||read==='UNEXPECTED_EXCHANGE_RESPONSE'?
       'KALSHI READ CHECK UNAVAILABLE · NO ORDER VERIFIED':
       'PRIVATE CREDENTIALS SET · AUTHENTICATION NOT CONFIRMED'):
    'NOT CONNECTED · CHECK OWNER TOKEN · NO ORDER VERIFIED';
  }catch{status.textContent='VERIFIER STATUS UNAVAILABLE · NO ORDER VERIFIED'}
 }
 // Generate only with browser cryptographic randomness; never post a token
 // while generating. The textarea is a manual iOS copy fallback, not storage.
 function selectGenerated(){
  if(!copyArea||!copyArea.value)return false;
  if(typeof copyArea.focus==='function')copyArea.focus();
  if(typeof copyArea.select==='function')copyArea.select();
  if(typeof copyArea.setSelectionRange==='function')
   copyArea.setSelectionRange(0,copyArea.value.length);
  return true;
 }
 function showFallback(secret){
  if(copyArea)copyArea.value=secret;
  if(fallback)fallback.hidden=false;
 }
 function manualInstructions(){
  guide.textContent='Copy blocked by this browser. Tap Select text, touch and hold the highlighted token, choose Copy, then paste it into Railway OWNER_VERIFY_TOKEN.';
 }
 async function attemptCopy(){
  const secret=copyArea?.value||'';
  if(!secret)return;
  if(typeof navigator!=='undefined'&&navigator.clipboard&&
     typeof navigator.clipboard.writeText==='function'){
   try{
    await navigator.clipboard.writeText(secret);
    guide.textContent='Token copied! Save it in your password manager and paste it into the Railway OWNER_VERIFY_TOKEN variable, then apply the change.';
    return;
   }catch{/* iOS in-app browser may deny clipboard access */}
  }
  selectGenerated();
  // execCommand is only a best-effort fallback: manual selection remains
  // visible even on browsers that block all clipboard APIs.
  let copied=false;
  try{copied=typeof document.execCommand==='function'&&
   document.execCommand('copy')===true;}catch{}
  if(copied)guide.textContent='Token copied! Paste it into Railway OWNER_VERIFY_TOKEN and apply the change.';
  else manualInstructions();
 }
 if(generate&&guide){
  generate.addEventListener('click',()=>{
   const cryptoApi=globalThis.crypto;
   if(!cryptoApi||typeof cryptoApi.getRandomValues!=='function'){
    guide.textContent='Secure randomness is unavailable. Open CASH in Safari or generate a random token with your password manager.';
    return;
   }
   const bytes=new Uint8Array(32);
   cryptoApi.getRandomValues(bytes);
   const secret=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
   token.value=secret;
   showFallback(secret);
   guide.textContent='64-character token created securely on your device. Tap Copy token below, or Select text to copy manually on iPhone. Save it in your password manager.';
   // Explicit button is the primary copy action. Do not automatically copy
   // during generation: that can fail in iOS embedded browsers.
  });
 }
 if(copyBtn)copyBtn.addEventListener('click',()=>{attemptCopy()});
 if(selectBtn)selectBtn.addEventListener('click',()=>{
  if(selectGenerated())manualInstructions();
 });
 if(hideBtn)hideBtn.addEventListener('click',()=>{
  if(copyArea)copyArea.value='';
  if(token)token.value='';
  if(fallback)fallback.hidden=true;
  guide.textContent='Token hidden and cleared from this page. Generate a new one if needed. Previously copied text may remain on your device clipboard.';
 });
 trigger.addEventListener('click',async()=>{
  if(trigger.disabled)return;
  trigger.disabled=true;result.textContent='Checking the specific exchange order and matched fills…';
  const access=token.value,identifier=orderId.value.trim();
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),18000);
  try{
   const response=await fetch('/api/private/order-verify',{
    method:'POST',cache:'no-store',credentials:'omit',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+access},
    body:JSON.stringify({orderId:identifier}),signal:controller.signal});
   // Never display raw upstream response or any key/signature.
   const data=await response.json();
   if(!response.ok)throw Error(typeof data.error==='string'?data.error:'Verification unavailable');
   if(data.version!=='CASH_KALSHI_PRIVATE_ORDER_AUDIT_V1'||
      data.tradingEnabled!==false||data.realTradeOrderSubmittedByCash!==false)
    throw Error('Untrusted order-verification result');
   const ev=data.evidence||{};
   result.textContent='Kalshi order '+data.order.orderId+
    ' · '+(ev.filledExecutionVerified?'EXECUTION VERIFIED':'EXECUTION NOT VERIFIED')+
    ' · '+String(ev.matchingFillCount||0)+' exchange fills'+
    ' · '+String(ev.matchedQuantity||0)+' contracts'+
    ' · settlement: '+(ev.settlementRecordLinkedByTicker?
      'account-level '+ev.marketSettlementResult:'NOT VERIFIED')+
    ' · order-level net P&L: NOT VERIFIED. CASH prediction edge: NOT VERIFIED.';
  }catch(err){
   result.textContent='NO VERIFIED EXECUTION · '+(err?.message||'Verification unavailable')+
    '. No money was transferred or order placed.';
  }finally{trigger.disabled=false;clearTimeout(timeout);token.value=''}
 });
 health();
})();
