'use strict';
/*
 * CASH Kalshi 15-minute BTC paper-study terminal. Calculates a conservative
 * data-readiness state, NOT probability, prediction accuracy, investment
 * advice, positive expected value or real-order permission.
 *
 * The official KXBTC15M market compares 60-second CF Benchmarks BRTI
 * averages at market start and expiry. Kraken/Coinbase spot is NEVER BRTI.
 */
const PRICE=n=>Number.isFinite(n)&&n>0&&n<1;
const OK_MARKET=/^KXBTC15M-[A-Za-z0-9-]{6,70}$/;
const TARGET=n=>Number.isFinite(n)&&n>1000&&n<10000000;
function assessKalshi15({quote={},spot={},shadow={},now=Date.now()}={}){
 if(!Number.isFinite(now))throw Error('Invalid clock');
 const blockers=[];
 const id=typeof quote.marketId==='string'&&OK_MARKET.test(quote.marketId)?quote.marketId:null;
 const fetchedMs=Date.parse(quote.fetchedAt);
 const expiryMs=Date.parse(quote.endTime);
 const startMs=Date.parse(quote.openTime);
 const ageMs=Number.isFinite(fetchedMs)?Math.max(0,now-fetchedMs):null;
 const remainingMs=Number.isFinite(expiryMs)?Math.max(0,expiryMs-now):null;
 const isFresh=quote.status==='live'&&!quote.refreshFailed&&Number.isFinite(fetchedMs)
   &&fetchedMs<=now+2000&&ageMs<=12000;
 const validWindow=Number.isFinite(expiryMs)&&expiryMs>now&&expiryMs-now<=900000
   &&(!Number.isFinite(startMs)||startMs<=now);
 const targetKnown=TARGET(quote.targetPrice)&&quote.targetSource==='KALSHI_FLOOR_STRIKE';
 const rulesMatch=quote.contractRuleStatus==='BRTI_60S_RULE_TEXT_PRESENT';
 const tieConfirmed=quote.strikeType==='greater_or_equal'&&quote.tieGoesToYes===true;
 const asksKnown=PRICE(quote.yesAsk)&&PRICE(quote.noAsk);
 const referenceFresh=spot.status==='live'&&Number.isFinite(spot.price)&&spot.price>1000
   &&typeof spot.source==='string'
   &&['Kraken BTC/USD','Coinbase Exchange BTC-USD'].includes(spot.source)
   &&Number.isFinite(Date.parse(spot.fetchedAt))&&
    Date.parse(spot.fetchedAt)<=now+2000&&now-Date.parse(spot.fetchedAt)<=12000;
 if(quote.venue!=='Kalshi')blockers.push('Market source is not confirmed as Kalshi');
 if(!id)blockers.push('Current KXBTC15M market identifier unavailable');
 if(!isFresh)blockers.push('Kalshi YES and NO quotes are missing, partial, stale or in refresh failure');
 if(!validWindow)blockers.push('Current 15-minute market is not confirmed open and at least one moment before expiry');
 if(remainingMs!==null&&remainingMs<60000)blockers.push('Less than 60 seconds left: paper capture window too short');
 if(!targetKnown)blockers.push('Official contract target (Kalshi floor_strike) unavailable');
 if(!rulesMatch)blockers.push('Current market rule text does not explicitly confirm the BRTI 60-second averaging rule; inspect it on Kalshi');
 if(!tieConfirmed)blockers.push('Market strike_type must be greater_or_equal (YES wins the exact tie); verify official terms');
 if(!referenceFresh)blockers.push('Independent exchange spot reference is stale or unavailable');
 const paperReady=blockers.length===0;
 const last=Array.isArray(shadow.recent)&&id?shadow.recent.find(r=>r.venue==='Kalshi'&&r.marketId===id):null;
 const candidate=last?.spotCandidate;
 const sampleBacked=Array.isArray(candidate?.sampleWindow)&&
  /^[0-9a-f]{64}$/.test(candidate?.sampleWindowSha256||'');
 const candidateSide=sampleBacked&&['YES','NO'].includes(candidate.predictedContractSide)?
  candidate.predictedContractSide:null;
 const askTotal=asksKnown?quote.yesAsk+quote.noAsk:null;
 const releaseChecklist=[
  {id:'PUBLIC_KALSHI_QUOTE',passed:quote.venue==='Kalshi'&&Boolean(id)&&isFresh&&asksKnown,
   note:'Current KXBTC15M market with a fresh complete YES/NO public ask reference'},
  {id:'OFFICIAL_MARKET_TARGET',passed:targetKnown,
   note:'Kalshi floor_strike available; opening 60-second BRTI average'},
  {id:'SETTLEMENT_RULE_TEXT',passed:rulesMatch&&tieConfirmed,
   note:'Contract rule references 60-second BRTI averaging, and strike_type is greater_or_equal'},
  {id:'CURRENT_PAPER_WINDOW',passed:validWindow&&(remainingMs||0)>=60000,
   note:'Market open and at least 60 seconds remain'},
  {id:'SPOT_PROXY_REFERENCE',passed:referenceFresh,
   note:'Fresh single-exchange reference, explicitly NOT the official BRTI index'},
  {id:'OFFICIAL_BRTI_FEED',passed:false,
   note:'Authenticated Kalshi CF Benchmarks passthrough requires eligible credentials and permission'},
  {id:'DURABLE_AUDIT',passed:false,
   note:'No verified persistent journal or independent pre-expiry timestamp witness'},
  {id:'INDEPENDENT_MODEL_VALIDATION',passed:false,
   note:'0/100 independently attested prospective settled forecasts, model not calibrated'},
  {id:'SERIES_FEE_VERIFICATION',passed:false,
   note:'Specific series fee, rounding, and actual execution costs have not been verified'}
 ];
 return {
  version:'CASH_KALSHI15_TERMINAL_V1',
  updatedAt:new Date(now).toISOString(),
  venue:'Kalshi',series:'KXBTC15M',marketId:id,
  displayState:paperReady?'PAPER_MONITOR_READY':'NO_CALL',
  paperMonitorReady:paperReady,
  liveDecision:'NO_CALL_MODEL_NOT_VALIDATED',
  realTradingAuthorized:false,automaticOrdersEnabled:false,
  independentForecastValidation:0,requiredIndependentForecasts:100,
  releaseChecklist,
  finalization:{state:'PAPER_MONITOR_ONLY',paperDataChecksPassed:releaseChecklist.slice(0,5).filter(x=>x.passed).length,
   paperDataChecksRequired:5,realTradingGatePassed:false,
   brtiRestEntitlement:'NOT_CONNECTED',officialBrtiFeedAvailable:false,
   independentlyTimeAttested:false,permanentJournalVerified:false,
   seriesSpecificFeesVerified:false,independentModelValidated:false},
  breakEven:{yesBeforeFees:PRICE(quote.yesAsk)?quote.yesAsk:null,
   noBeforeFees:PRICE(quote.noAsk)?quote.noAsk:null,
   yesAfterFeesAndSlippage:null,noAfterFeesAndSlippage:null,
   independentWinProbability:null,expectedValue:null,
   note:'Observed ask alone is the gross break-even win probability for a $1 binary payout. Fees, rounding, slippage, market-specific terms and model probability are unavailable; do not infer profitability.',
   feeScheduleUrl:'https://kalshi.com/fee-schedule'},
  target:{value:targetKnown?quote.targetPrice:null,
   source:targetKnown?'KALSHI_FLOOR_STRIKE':'UNKNOWN',
   rule:rulesMatch?'BRTI_60S_RULE_TEXT_PRESENT':'RULE_TEXT_NOT_CONFIRMED',
   strikeType:quote.strikeType||null,tieToYesConfirmed:tieConfirmed,
   calculation:'60-second CF Benchmarks Bitcoin Real-Time Index average before close compared with average before open; market terms govern.'},
  clock:{remainingMs,endTime:Number.isFinite(expiryMs)?new Date(expiryMs).toISOString():null,
   startedAt:Number.isFinite(startMs)?new Date(startMs).toISOString():null,
   quoteAgeMs:ageMs},
  market:{status:quote.status||'unavailable',
   yesBid:PRICE(quote.yesBid)?quote.yesBid:null,
   yesAsk:PRICE(quote.yesAsk)?quote.yesAsk:null,
   noAsk:PRICE(quote.noAsk)?quote.noAsk:null,
   askSum:askTotal,asksComplete:asksKnown,refreshFailed:quote.refreshFailed===true},
  spotReference:{price:referenceFresh?spot.price:null,
   source:referenceFresh?spot.source:null,status:referenceFresh?'REFERENCE_ONLY':'UNAVAILABLE',
   settlementIndexAvailable:false,settlementIndexValue:null},
  experimentalCandidate:{
   side:candidateSide,status:candidateSide?'SESSION_SHADOW_ONLY_NOT_VALIDATED':'NO_SAMPLE_BACKED_CANDIDATE',
   source:candidateSide?candidate.source:null
  },
  blockers,limits:[
   'Market asks are not executable quotes or independently calibrated probabilities.',
   'Kraken/Coinbase spot is not the CF Benchmarks BRTI settlement value.',
   'A paper-ready state is NOT a real-money trade recommendation.',
   'Series-specific fees, rounding, execution slippage and independently tested edge are not established.'
  ],
  kalshiUrl:'https://kalshi.com/category/crypto/btc'
 };
}
module.exports={assessKalshi15};
