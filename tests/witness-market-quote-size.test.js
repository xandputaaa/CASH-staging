'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {classifyQuote,auditWitnessQuotes}=require('../witness-market-quote-size');
const SHA=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const id='KXBTC15M-26NOV172345-45',
 end='2026-11-18T04:45:00Z',
 at='2026-11-18T04:41:33.969Z',
 run='44238466824',observer='2026-11-18T04:41:40.500Z',
 read='2026-11-18T04:41:40.700Z';
const model='KXBTC15M_LATE_CHECKPOINT_SHADOW_V1';
const baseEvent=()=>({
 sequence:1,recordedAt:at,type:'FORECAST',
 payload:{model,marketId:id,side:'NO',indexSourceType:'SINGLE_EXCHANGE_PROXY',
  at,endTime:end,publicAskAtFreeze:{YES:.024,NO:.977},
  publicAskQuoteFetchedAt:'2026-11-18T04:41:29.500Z'},
 previousHash:'GENESIS'
});
const event=()=>{const e=baseEvent();e.hash=SHA(e);return e};
const journal=()=>{const e=event();return {
 version:'CASH_LATE_CHECKPOINT_SHADOW_V1',
 format:'CASH_LATE_CHECKPOINT_UNVERIFIED_HASH_CHAIN_V1',
 events:[e],records:1,pending:1,headHash:e.hash,
 independentQualification:0,independentlyTimeAttested:false,
 realMoneyAuthorized:false,canExecuteOrders:false
}};
const ext=(patch={})=>({
 state:'MATCHED_ACTIVE_PUBLIC_EXCHANGE_MARKET',
 independentValidation:false,observedAtRunner:read,
 publishedCloseTime:end,publicStrikeAtObserver:64502.16,
 publicStrikeType:'greater_or_equal',publicMarketStatusAtObserver:'active',
 exchangePublicFieldsSha256:'b'.repeat(64),
 quoteWasNotFrozenAtPrediction:true,isFill:false,
 witnessTimeQuotesNotFills:{
  yesAskDollars:.024,noAskDollars:.987,
  yesAskSizeFp:4,noAskSizeFp:3,
 },...patch
});
const witness=(patch={})=>{
 const e=event();
 return {
 version:'CASH_OFFSERVER_OBSERVATION_V1',
 observationClass:'GITHUB_RUNNER_UTC_CLOCK_PROVISIONAL',
 githubRepo:'xandputaaa/CASH-staging',
 githubRunId:run,githubCommitSha:'a'.repeat(40),
 observedAtRunner:observer,
 frozenEvidence:[{
  model,marketId:id,frozenSide:'NO',frozenAt:at,contractClosesAt:end,
  journalSequence:1,frozenEventHash:e.hash,headHashSeen:e.hash,
  publicProxyOnly:true,exchangeAtWitness:ext()
 }],
 evidenceWitnessedBeforeExpiry:1,
 claimedIndependentlyQualifiedCount:0,calibrated:false,
 realOrdersEnabled:false,
 ...patch
 };
};
const matched=(patch={})=>({
 model,marketId:id,witnessedSide:'NO',
 witnessedPaper:{state:'WITNESSED_QUOTED_COUNTERFACTUAL_ONLY',
  netAfterFees:{lower:.013,upper:.018}},
 witnessGitHubRunId:run,observedCommitmentHash:event().hash,
 state:'OBSERVED_DIRECTIONAL_HIT',
 ...patch
});
const reconciled=(rows=[matched()])=>({
 version:'CASH_PROVISIONAL_EXTERNAL_WITNESS_RECONCILIATION_V1',
 matched:rows,independentQualifiedCount:0,executionVerified:false,
 ordersEnabled:false
});
test('compares DIRECT exchange ask observed later to frozen public ask without ever using it as paper fill',()=>{
 const out=auditWitnessQuotes({
  reconciliation:reconciled(),witnesses:[witness()],late:journal()
 });
 const p=out.matched[0].witnessMarketQuote;
 assert.equal(p.state,'WITNESS_DISPLAYED_SIZE_AT_LEAST_ONE_UNFILLED');
 assert.equal(p.frozenPublicAskAtModelDecision,.977);
 assert.equal(p.sidePublicAskAtGHWitness,.987);
 assert.equal(p.publicAskDeltaFromFreeze,.01);
 assert.equal(p.publicAskChangedAgainstBuyer,true);
 assert.equal(p.displayedSizeAtGHWitness,3);
 assert.equal(p.preFeeGrossPayoutIfWinnerAtWitnessAsk,.013);
 assert.equal(p.oneContractFillProven,false);
 assert.equal(p.executableLiquidityVerified,false);
 assert.equal(p.isWitnessQuotePriceAtFrozenTime,false);
 assert.equal(out.matched[0].witnessedPaper.netAfterFees.lower,.013);
 assert.equal(out.witnessMarketQuoteCoverage.witnessedPublicAsksAvailable,1);
 assert.equal(out.witnessMarketQuoteCoverage.observedDisplayedSizeAtLeastOne,1);
 assert.equal(out.witnessMarketQuoteCoverage.noActualOrdersVerified,true);
 assert.equal(out.independentQualifiedCount,0);
});
test('market quote without published size must never be declared buyable or as verified liquidity',()=>{
 const w=witness();w.frozenEvidence[0].exchangeAtWitness=ext({
  witnessTimeQuotesNotFills:{yesAskDollars:.01,noAskDollars:.995,
   yesAskSizeFp:null,noAskSizeFp:null}
 });
 const out=auditWitnessQuotes({
  reconciliation:reconciled(),witnesses:[w],late:journal()
 });
 assert.equal(out.matched[0].witnessMarketQuote.state,'WITNESS_ASK_SIZE_UNKNOWN');
 assert.equal(out.witnessMarketQuoteCoverage.observedAskWithMissingSize,1);
 assert.equal(out.witnessMarketQuoteCoverage.selectedSideAskAtOrAbove99Cents,1);
 assert.equal(out.witnessMarketQuoteCoverage.oneContractFillVerifications,0);
});
test('public displayed quantity smaller than one contract is a warning rather than a fill',()=>{
 const w=witness();w.frozenEvidence[0].exchangeAtWitness=ext({
  witnessTimeQuotesNotFills:{noAskDollars:.93,noAskSizeFp:.25}
 });
 const out=auditWitnessQuotes({
  reconciliation:reconciled(),witnesses:[w],late:journal()
 });
 assert.equal(out.matched[0].witnessMarketQuote.state,
   'WITNESS_DISPLAYED_SIZE_BELOW_ONE_CONTRACT');
 assert.equal(out.witnessMarketQuoteCoverage.observedDisplayedSizeBelowOne,1);
 assert.equal(out.witnessMarketQuoteCoverage.observedDisplayedSizeAtLeastOne,0);
});
test('missing public side ask or direct Kalshi check stays unavailable, never free',()=>{
 for(const patch of [
  {state:'EXCHANGE_MARKET_UNAVAILABLE'},
  {witnessTimeQuotesNotFills:{noAskDollars:null,noAskSizeFp:100}},
  {witnessTimeQuotesNotFills:{noAskDollars:1.5,noAskSizeFp:100}}
 ]){
  const w=witness();
  w.frozenEvidence[0].exchangeAtWitness=ext(patch);
  const r=auditWitnessQuotes({
   reconciliation:reconciled(),witnesses:[w],late:journal()
  });
  assert.equal(r.witnessMarketQuoteCoverage.witnessedPublicAsksAvailable,0);
  assert.equal(r.witnessMarketQuoteCoverage.withUnknownAskOrUncorroborated,1);
  assert.equal(r.matched[0].witnessMarketQuote.oneContractFillProven,false);
 }
});
test('witness quote after close is excluded from price comparison',()=>{
 const w=witness();
 w.frozenEvidence[0].exchangeAtWitness=ext({
  observedAtRunner:'2026-11-18T04:45:01Z'
 });
 const p=classifyQuote(matched(),w,event());
 assert.equal(p.state,'WITNESS_TIME_NOT_PREEXPIRY_OR_RELIABLE');
 assert.equal(p.sidePublicAskAtGHWitness,null);
});
test('invalid or future public frozen quote must not be silently compared with later market data',()=>{
 const e=event();e.payload.publicAskQuoteFetchedAt='2026-11-18T04:41:51Z';
 const p=classifyQuote(matched(),witness(),e);
 assert.equal(p.state,'WITNESS_DISPLAYED_SIZE_AT_LEAST_ONE_UNFILLED');
 assert.equal(p.frozenPublicAskAtModelDecision,null);
 assert.equal(p.publicAskDeltaFromFreeze,null);
});
test('witness missing or different original immutable forecast hash is not usable evidence',()=>{
 const j=journal();
 const a=auditWitnessQuotes({
  reconciliation:reconciled([matched({observedCommitmentHash:'f'.repeat(64)})]),
  witnesses:[witness()],late:j
 });
 assert.equal(a.matched[0].witnessMarketQuote.state,'QUOTE_PROVENANCE_NOT_RECONCILED');
 const b=auditWitnessQuotes({
  reconciliation:reconciled([matched({witnessGitHubRunId:'44238466825'})]),
  witnesses:[witness()],late:j
 });
 assert.equal(b.matched[0].witnessMarketQuote.state,'GITHUB_PREEXPIRY_WITNESS_UNAVAILABLE');
 assert.equal(a.witnessMarketQuoteCoverage.witnessedPublicAsksAvailable,0);
});
test('no directional late witness means no made-up market pricing',()=>{
 const wait={...matched(),witnessedSide:'WAIT',state:'OBSERVED_WAIT_RESOLVED'};
 const early={...matched(),model:'KXBTC15M_SETTLEMENT_EARLY_V3'};
 const r=auditWitnessQuotes({
  reconciliation:reconciled([wait,early]),witnesses:[witness()],late:journal()
 });
 assert.equal(r.witnessMarketQuoteCoverage.lateDirectionalWitnesses,0);
 assert.equal(r.matched[0].witnessMarketQuote,undefined);
 assert.equal(r.matched[1].witnessMarketQuote,undefined);
});
test('tampered hash-chain and order enabling report are both rejected',()=>{
 const bad=journal();
 bad.events[0].payload.side='YES';
 assert.throws(()=>auditWitnessQuotes({
  reconciliation:reconciled(),witnesses:[witness()],late:bad
 }),/checksum/i);
 assert.throws(()=>auditWitnessQuotes({
  reconciliation:{...reconciled(),ordersEnabled:true},
  witnesses:[witness()],late:journal()
 }),/Unsafe/);
});
test('size of zero or missing quote never counts as an executable contract',()=>{
 const w=witness();
 w.frozenEvidence[0].exchangeAtWitness=ext({
  witnessTimeQuotesNotFills:{noAskDollars:0,noAskSizeFp:0}
 });
 const r=auditWitnessQuotes({reconciliation:reconciled(),
  witnesses:[w],late:journal()});
 assert.equal(r.witnessMarketQuoteCoverage.observedDisplayedSizeBelowOne,1);
 assert.equal(r.matched[0].witnessMarketQuote.oneContractFillProven,false);
});
