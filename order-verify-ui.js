'use strict';
(function(){
 const root=document.getElementById('cashOrderVerify');if(!root)return;
 const el=id=>document.getElementById(id);
 const status=el('orderVerifyStatus'),result=el('orderVerifyResult'),
  trigger=el('orderVerifyButton'),token=el('orderVerifyToken'),orderId=el('orderVerifyId');
 // Intentionally keep sensitive access code only in user input, never local
 // storage, URL query, analytics events, logs, or the DOM report.
 async function health(){
  try{
   const res=await fetch('/api/order-verification-status',{cache:'no-store'});
   if(!res.ok)throw Error('Status unavailable');
   const data=await res.json();
   status.textContent=data.state==='PRIVATE_VERIFICATION_CONFIGURED'?
    'PRIVATE VERIFIER READY · ACCOUNT RECORDS NOT YET CHECKED':
    'NOT CONNECTED · NO REAL ORDER VERIFIED';
  }catch{status.textContent='VERIFIER STATUS UNAVAILABLE · NO ORDER VERIFIED'}
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
