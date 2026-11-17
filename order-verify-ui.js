'use strict';
(function(){
 const root=document.getElementById('cashOrderVerify');if(!root)return;
 const el=id=>document.getElementById(id);
 const status=el('orderVerifyStatus'),result=el('orderVerifyResult'),
  trigger=el('orderVerifyButton'),token=el('orderVerifyToken'),orderId=el('orderVerifyId'),
  generate=el('orderGenerateToken'),guide=el('orderTokenGuide');
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
 // Local cryptographically secure generation. The token is NEVER submitted
 // to CASH when generated and never goes into localStorage, a URL or logs.
 // It is sent only when the owner later verifies a specific order.
 if(generate&&guide){
  generate.addEventListener('click',()=>{
   const cryptoApi=globalThis.crypto;
   if(!cryptoApi||typeof cryptoApi.getRandomValues!=='function'){
    guide.textContent='Secure browser randomness is unavailable. Generate a 32+ character random token using a trusted password manager instead.';
    return;
   }
   const bytes=new Uint8Array(32);
   cryptoApi.getRandomValues(bytes);
   const secret=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
   token.value=secret; // 64 characters, 256 bits of randomness.
   guide.textContent='New 64-character token generated on this device. Copy it, save it in your password manager, then replace OWNER_VERIFY_TOKEN in Railway. The verifier will be enabled after Railway deploys.';
   if(typeof navigator!=='undefined'&&navigator.clipboard&&
      typeof navigator.clipboard.writeText==='function'){
    try{
     const copyResult=navigator.clipboard.writeText(secret);
     if(copyResult&&typeof copyResult.then==='function'){
      copyResult.then(()=>{
       guide.textContent='Secure token copied to your clipboard. Paste it into Railway OWNER_VERIFY_TOKEN, apply the change, then return here to check Kalshi authentication.';
      }).catch(()=>{
       guide.textContent='Secure token generated in the password field above, but automatic copying failed. Select and copy the field value, then paste it into Railway OWNER_VERIFY_TOKEN.';
      });
     }
    }catch{
     guide.textContent='Secure token generated in the password field, but clipboard access failed. Select and copy it manually into Railway OWNER_VERIFY_TOKEN.';
    }
   }else{
    guide.textContent='Secure token generated in the password field. Select and copy its value into Railway OWNER_VERIFY_TOKEN, then apply the change.';
   }
  });
 }
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
