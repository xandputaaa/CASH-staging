'use strict';
/*
 * Display-only preference. Defaults to Simple for new visitors and persists
 * locally if permitted. Switching modes cannot change backend data, trading
 * privileges, journal records or validation requirements.
 */
(function(){
 const KEY='cash-view-mode-v1';
 const simple=document.getElementById('modeSimple');
 const advanced=document.getElementById('modeAdvanced');
 const hint=document.getElementById('modeHelp');
 if(!simple||!advanced||!document.body)return;
 const supported=value=>value==='advanced'?'advanced':'simple';
 let mode='simple';
 try{mode=supported(localStorage.getItem(KEY))}catch{}
 function choose(next,persist){
  mode=supported(next);
  document.body.setAttribute('data-cash-mode',mode);
  simple.className=mode==='simple'?'selected':'';
  advanced.className=mode==='advanced'?'selected':'';
  simple.setAttribute('aria-pressed',String(mode==='simple'));
  advanced.setAttribute('aria-pressed',String(mode==='advanced'));
  if(hint)hint.textContent=mode==='simple'?
    'Simple Mode · plain-English Kalshi basics and practice trades.':
    'Advanced Mode · all feeds, evidence checks and technical research.';
  if(persist){try{localStorage.setItem(KEY,mode)}catch{}}
  if(typeof document.dispatchEvent==='function'&&typeof Event==='function')
   document.dispatchEvent(new Event('cash-mode-change'));
 }
 simple.addEventListener('click',()=>choose('simple',true));
 advanced.addEventListener('click',()=>choose('advanced',true));
 choose(mode,false);
})();
