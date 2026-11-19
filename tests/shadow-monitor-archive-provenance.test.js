'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createShadowMonitor}=require('../shadow-monitor');
test('fresh monitor clearly reports no archived hydration',()=>{
 const monitor=createShadowMonitor({quotes:{},results:{},clock:()=>Date.parse('2026-11-19T20:00:00Z')});
 const state=monitor.snapshot();
 assert.equal(state.archivedPendingHydrated,false);
 assert.equal(state.archivedPendingCount,0);
 assert.equal(state.archivedHistoricalCaptures,0);
 assert.equal(state.archiveHydrationEvidenceStatus,null);
 assert.equal(state.qualifyingProspectiveContracts,0);
});
