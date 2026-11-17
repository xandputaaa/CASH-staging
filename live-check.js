'use strict';
/**
 * Public operation-check readout, never a proof of trading edge. The HTTP
 * service itself is the sole source of whether its own routes are reachable.
 * All market observations are time-scoped and may degrade at any moment.
 */
const validPrice=n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<1;
function assessLiveCheck({kalshi={},spot={},terminal={},now=Date.now(),
 assets={}}={}){
 if(!Number.isFinite(now))throw Error('Invalid observation timestamp');
 const stamp=n=>Number.isFinite(Date.parse(n))?Date.parse(n):null;
 const quoteAt=stamp(kalshi.fetchedAt),expiry=stamp(kalshi.endTime);
 const spotAt=stamp(spot.fetchedAt);
 const quoteFresh=kalshi.venue==='Kalshi'&&kalshi.status==='live'&&
  kalshi.refreshFailed!==true&&quoteAt!==null&&quoteAt<=now+2000&&
  now-quoteAt<=12000&&expiry!==null&&expiry>now&&
  validPrice(kalshi.yesAsk)&&validPrice(kalshi.noAsk)&&
  typeof kalshi.marketId==='string'&&/^KXBTC15M-[A-Za-z0-9-]{6,70}$/.test(kalshi.marketId);
 const spotFresh=spot.status==='live'&&Number.isFinite(spot.price)&&spot.price>1000&&
  spotAt!==null&&spotAt<=now+2000&&now-spotAt<=12000&&
  ['Kraken BTC/USD','Coinbase Exchange BTC-USD'].includes(spot.source);
 const fullContract=terminal.version==='CASH_KALSHI15_TERMINAL_V1'&&
  terminal.paperMonitorReady===true&&terminal.displayState==='PAPER_MONITOR_READY'&&
  terminal.finalization?.realTradingGatePassed===false&&
  terminal.liveDecision==='NO_CALL_MODEL_NOT_VALIDATED';
 const simpleAssets=assets.simple===true&&assets.switcher===true;
 const researchAssets=assets.advanced===true;
 const paperAssets=assets.paper===true;
 const status=quoteFresh&&spotFresh&&fullContract&&simpleAssets&&paperAssets?
  'LIVE_PAPER_MONITOR':quoteFresh?'ONLINE_PARTIAL_DATA':'ONLINE_QUOTES_UNAVAILABLE';
 const issues=[];
 if(!quoteFresh)issues.push('Kalshi quotes are unavailable, stale, incomplete, or outside the active 15-minute window.');
 if(!spotFresh)issues.push('Independent BTC spot reference is unavailable or stale. This is not BRTI.');
 if(!fullContract)issues.push('Official target, contract rule, or full paper-monitor readiness is not verified.');
 if(!simpleAssets||!researchAssets||!paperAssets)issues.push('One or more application assets are missing or not loaded by the server.');
 issues.push('CASH has not qualified its independent predictions, and no real-money orders are supported.');
 return {
  version:'CASH_LIVE_OPERATION_CHECK_V1',
  checkedAt:new Date(now).toISOString(),
  state:status,
  mode:'PUBLIC_LIVE_MARKET_DATA_PAPER_ONLY',
  site:{online:true,homepageReady:assets.page===true,
   simpleModeAssetsReady:simpleAssets,
   advancedModeAssetsReady:researchAssets,
   paperPracticeAssetReady:paperAssets},
  market:{kalshiQuotesFresh:quoteFresh,
   kalshiQuoteState:kalshi.status||'unavailable',
   kalshiCurrentContract:quoteFresh?kalshi.marketId:null,
   kalshiQuoteAgeMs:quoteAt===null?null:Math.max(0,now-quoteAt),
   kalshiPaperRuleChecksPassed:fullContract,
   spotReferenceFresh:spotFresh,
   spotSource:spotFresh?spot.source:null,
   officialBrtiConnected:false},
  paperPractice:{clientAvailable:paperAssets,realOrdersEnabled:false,
   auditDurabilityConfirmed:false,settlementProofExternallyAttested:false},
  model:{independentValidatedForecasts:0,requiredForecasts:100,
   verifiedTradingEdge:false,liveRecommendation:'NO_VERIFIED_PICK',
   canExecuteRealTrade:false},
  issues,
  explanation:'Online service checks demonstrate live data access and app assets; they are not a claim of predictive accuracy, guaranteed fills, or account trading readiness.'
 };
}
module.exports={assessLiveCheck};
