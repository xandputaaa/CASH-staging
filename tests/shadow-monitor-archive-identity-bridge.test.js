'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createShadowMonitor}=require('../shadow-monitor');
const providers={quotes:{},results:{}};
test('monitor refuses pending archived captures instead of silently losing settlements',()=>{
 assert.throws(()=>createShadowMonitor({...providers,archivedIdentityState:{
  state:'ARCHIVE_SEMANTIC_INDEX_VERIFIED',captures:1,pending:1,capturedIds:['Kalshi:KXBTC15M-ABCDEF']
 }}),/not fully settled/);
});
test('monitor accepts settled archive identities and refuses malformed lists',()=>{
 const state={state:'ARCHIVE_SEMANTIC_INDEX_VERIFIED',captures:1,pending:0,capturedIds:['Kalshi:KXBTC15M-ABCDEF']};
 assert.equal(createShadowMonitor({...providers,archivedIdentityState:state}).snapshot().observed,0);
 assert.throws(()=>createShadowMonitor({...providers,archivedIdentityState:{...state,capturedIds:[]}}),/not fully settled/);
});
