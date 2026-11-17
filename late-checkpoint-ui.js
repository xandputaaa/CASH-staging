'use strict';
(function(){
 const root=document.getElementById('cashLateCheckpoint');if(!root)return;
 const el=id=>document.getElementById(id);
 const set=(id,value)=>{const node=el(id);if(node)node.textContent=value};
 const percent=n=>Number.isFinite(n)?(n*100).toFixed(1)+'%':'—';
 function invalid(){
  set('lcState','LATE RESEARCH UNAVAILABLE');
  set('lcRecent','No verified late-checkpoint status. No YES/NO recommendation.');
  set('lcCoverage','No source-separated late-checkpoint sample is available.');
  set('lcPaperEconomics','Paper execution evidence unavailable. No implied profit or trade.');
  set('lcScore','—');set('lcCalls','—');set('lcWaits','—');
 }
 async function refresh(){
  const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),8500);
  try{
   const response=await fetch('/api/late-checkpoint',{cache:'no-store',signal:ctrl.signal});
   if(!response.ok)throw Error('Late data unavailable');
   const r=await response.json();
   if(r.version!=='CASH_LATE_CHECKPOINT_SHADOW_V1'||
      r.model!=='KXBTC15M_LATE_CHECKPOINT_SHADOW_V1'||
      r.independentQualification!==0||r.requiredQualification!==100||
      r.independentlyTimeAttested!==false||r.calibrated!==false||
      r.realMoneyAuthorized!==false||r.canExecuteOrders!==false||
      r.storage!=='VOLATILE_SERVER_SESSION'||r.scorecard?.qualifiedCount!==0)
    throw Error('Unsafe late-checkpoint response');
   const v=r.scorecard.overall,p=r.scorecard.bySource.publicSpotProxy,
    b=r.scorecard.bySource.officialBrtiLive;
   if(!v||!p||!b)throw Error('Incomplete late research scorecard');
   set('lcState','SHADOW EXPERIMENT · NOT A TRADING SIGNAL');
   set('lcCalls',v.directional+' YES/NO');
   set('lcWaits',v.waits+' WAIT');
   set('lcScore',v.scoredDirectional+' scored · '+percent(v.exploratoryDirectionalHitRate)+
    ' observed (UNVALIDATED)');
   set('lcCoverage','Frozen '+v.captured+' research markets ('+v.directional+
    ' directional, '+v.waits+' WAIT). Pending: '+v.pendingDirectional+
    ' YES/NO and '+v.pendingWaits+' WAIT; '+v.voids+
    ' void. Public proxy: '+p.scoredDirectional+' directional scored. Licensed index: '+
    b.scoredDirectional+' directional scored. No model calibration or executable advantage proven.');
   const e=r.paperEconomics;
   if(e?.version==='CASH_PAPER_EXECUTION_AUDIT_V1'&&
      e.tradingAuthorized===false&&e.realOrdersEnabled===false&&
      e.independentQualification===0){
    const coverage='Public ask + verified fee metadata at freeze: '+
      e.quoteAndFeeObserved+'/'+e.directional+' directional calls; '+
      e.unpriced+' without eligible prices, '+e.pendingResultsWithQuote+
      ' awaiting outcomes, '+e.pricedVoids+' void.';
    const n=e.pricedSettlements;
    let result=' No scored paper purchases have contemporaneous valid asks AND verified fee metadata.';
    if(Number.isInteger(n)&&n>0&&Number.isFinite(e.conservativePnlDollars)&&
       Number.isFinite(e.optimisticPnlDollars)){
      result=' CONDITIONAL one-contract buy-at-observed-ask total, '+n+
       ' scored hypothetical purchases: conservative USD '+
       e.conservativePnlDollars.toFixed(4)+
       ' to centicent-fee USD '+e.optimisticPnlDollars.toFixed(4)+
       ' (fees included; no slippage assumed).';
    }
    set('lcPaperEconomics',coverage+result+
     ' No actual orders, fills or verified liquidity. No calibrated EV or trading edge; prices and fee overrides may differ.');
   }else{
    set('lcPaperEconomics','No validated fee-aware paper execution evidence. No simulated PnL inferred.');
   }
   const latest=r.latest;
   set('lcRecent',latest?
    'Most recent frozen checkpoint: '+(latest.side||'WAIT')+
    ' at '+new Date(latest.at).toLocaleTimeString()+
    ' · '+latest.status+
    ' · '+(latest.outcomeReason||'NO OFFICIAL RESULT YET')+
    '. The label refers to that earlier snapshot, not a new trade call.':
    'No late-checkpoint forecasts yet. CASH waits for a fresh eligible contract with 2½–3½ minutes remaining.');
  }catch{invalid()}
  finally{clearTimeout(timeout)}
 }
 refresh();
 if(typeof setInterval==='function')setInterval(refresh,20000);
 if(typeof document.addEventListener==='function')
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
})();
