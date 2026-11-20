'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const {makeManualCalls,netExitAtBid}=require('../manual-entry-exit-calls');

test('recording-inspired position inspector preserves separate instrument types',()=>{
 const html=read('index.html'),css=read('cash-v3.css');
 assert.match(html,/id="v3Position"/);
 assert.match(html,/data-v3-nav="position"/);
 assert.match(html,/id="v3PositionInput"/);
 assert.match(html,/id="v3PosPnl"/);
 assert.match(html,/id="v3PosBreakeven"/);
 assert.match(html,/QQQ \$636 put/i);
 assert.match(html,/unrealized \+\$306/i);
 assert.match(html,/not a Kalshi BTC 15-minute YES\/NO contract/i);
 assert.match(html,/The recording does not show the order entry, actual sale/i);
 assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
 assert.match(css,/prefers-reduced-motion/);
});
test('manual tracker and position inspector always invalidate stale pricing',()=>{
 const cash=read('cash-v3.js'),manual=read('manual-calls-ui.js');
 assert.match(cash,/cash:position-snapshot/);
 assert.match(manual,/broadcast\(null\)/);
 assert.match(manual,/broadcast\(out\)/);
 assert.match(cash,/Date\.now\(\)-stamp<=21000/);
 assert.match(cash,/out\?\.marketId===tracked\.marketId/);
 assert.match(cash,/p\?\.pricesAreNonExecutable===true/);
 assert.match(cash,/p\.estimatedEntryTotal<=10\.000001/);
 assert.match(cash,/resetPosition\(/);
 assert.doesNotMatch(cash,/fetch\([^)]*\/orders\b/);
});
test('indicative manual position has fee-aware exit break-even and no trade authority',()=>{
 const now=Date.parse('2026-11-20T18:00:00Z');
 const quote={venue:'Kalshi',marketId:'KXBTC15M-26NOV201805',
  status:'live',refreshFailed:false,fetchedAt:new Date(now-1000).toISOString(),
  endTime:new Date(now+300000).toISOString(),
  targetPrice:100000,targetSource:'KALSHI_FLOOR_STRIKE',
  contractRuleStatus:'BRTI_60S_RULE_TEXT_PRESENT',strikeType:'greater_or_equal',tieGoesToYes:true,
  yesBid:.64,yesAsk:.65,noBid:.33,noAsk:.35};
 const fees={state:'SERIES_METADATA_LIVE',feeType:'quadratic',feeMultiplier:1,
  refreshedAt:new Date(now-500).toISOString()};
 const position={marketId:quote.marketId,side:'YES',contracts:3,entryPrice:.50};
 const p=makeManualCalls({quote,fees,now,position}).position;
 assert.equal(p.noPositionDataStored,true);
 assert.equal(p.pricesAreNonExecutable,true);
 assert.ok(p.illustrativeBreakEvenBid>=.50&&p.illustrativeBreakEvenBid<.60);
 const candidate=netExitAtBid(position,p.illustrativeBreakEvenBid,fees.feeMultiplier);
 assert.ok(candidate.estimatedNetPnlUsd>=0);
 const prev=netExitAtBid(position,p.illustrativeBreakEvenBid-.01,fees.feeMultiplier);
 assert.ok(prev.estimatedNetPnlUsd<0);
 assert.ok(p.estimatedEntryTotal<=10);
 const out=makeManualCalls({quote,fees,now,position});
 assert.equal(out.ordersPlaced,0);
 assert.equal(out.tradingAuthorization,false);
 assert.equal(out.calibratedWinProbability,null);
 assert.equal(out.expectedValue,null);
});
test('invalid or stale exit never offers displayed estimated profit',()=>{
 const backend=read('manual-entry-exit-calls.js'),html=read('index.html');
 assert.match(backend,/NO_CURRENT_EXIT_BID_OR_FEE/);
 assert.match(backend,/POSITION_EXCEEDS_RESEARCH_RISK_CAP/);
 assert.match(html,/Positions? are entered manually|Track a manual Kalshi/i);
 assert.match(html,/gross bid market value/i);
 assert.match(html,/Net proceeds if sold/i);
});
