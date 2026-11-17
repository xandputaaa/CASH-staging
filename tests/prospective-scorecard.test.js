'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {prospectiveScorecard,wilson95}=require('../prospective-scorecard');
const rec=(marketId,side,status,indexSourceType='SINGLE_EXCHANGE_PROXY')=>
 ({marketId,side,status,indexSourceType});
test('mixed YES/NO/WAIT records preserve full observed denominator and pending gaps',()=>{
 const rows=[rec('a','YES','HIT'),rec('b','NO','MISS'),rec('c',null,'WAIT_RESOLVED'),
  rec('d','YES','PENDING'),rec('e',null,'PENDING'),rec('f','NO','VOID')];
 const r=prospectiveScorecard(rows);
 assert.equal(r.overall.captured,6);
 assert.equal(r.overall.directional,4);
 assert.equal(r.overall.waits,2);
 assert.equal(r.overall.hits,1);
 assert.equal(r.overall.misses,1);
 assert.equal(r.overall.scoredDirectional,2);
 assert.equal(r.overall.pendingDirectional,1);
 assert.equal(r.overall.pendingWaits,1);
 assert.equal(r.overall.waitResolved,1);
 assert.equal(r.overall.voids,1);
 assert.equal(r.overall.exploratoryDirectionalHitRate,.5);
 assert.equal(r.overall.directionalShareOfCaptured,4/6);
 assert.ok(r.overall.descriptiveWilson95.lower<.5);
 assert.ok(r.overall.descriptiveWilson95.upper>.5);
 assert.equal(r.qualifiedCount,0);
 assert.equal(r.independentlyTimeAttested,false);
});
test('isolated public proxy and official BRTI groups never inflate each other',()=>{
 const r=prospectiveScorecard([
  rec('proxy1','NO','MISS'),rec('proxy2',null,'WAIT_RESOLVED'),
  rec('official1','YES','HIT','OFFICIAL_BRTI_LIVE'),
  rec('official2','NO','PENDING','OFFICIAL_BRTI_LIVE')
 ]);
 assert.equal(r.bySource.publicSpotProxy.captured,2);
 assert.equal(r.bySource.publicSpotProxy.scoredDirectional,1);
 assert.equal(r.bySource.publicSpotProxy.exploratoryDirectionalHitRate,0);
 assert.equal(r.bySource.officialBrtiLive.captured,2);
 assert.equal(r.bySource.officialBrtiLive.scoredDirectional,1);
 assert.equal(r.bySource.officialBrtiLive.exploratoryDirectionalHitRate,1);
 assert.equal(r.bySource.officialBrtiLive.pendingDirectional,1);
 assert.equal(r.bySource.officialBrtiLive.independentValidationCount,0);
 assert.equal(r.bySource.publicSpotProxy.independentValidationCount,0);
});
test('zero scored predictions means no numerical hit rate or confidence interval',()=>{
 const r=prospectiveScorecard([rec('a',null,'PENDING'),rec('b','YES','PENDING')]);
 assert.equal(r.overall.scoredDirectional,0);
 assert.equal(r.overall.exploratoryDirectionalHitRate,null);
 assert.equal(r.overall.descriptiveWilson95,null);
 assert.equal(r.bySource.officialBrtiLive.exploratoryDirectionalHitRate,null);
 assert.equal(r.qualifiedCount,0);
 assert.equal(wilson95(1,0),null);
});
test('one apparent hit has a broad descriptive interval rather than a guaranteed 100%',()=>{
 const {lower,upper}=wilson95(1,1);
 assert.ok(lower>.2&&lower<.3);
 assert.equal(upper,1);
 assert.equal(wilson95(0,1).lower,0);
});
test('duplicate, unsupported source or inconsistent WAIT win cannot be counted',()=>{
 assert.throws(()=>prospectiveScorecard([rec('a','YES','HIT'),rec('a','YES','HIT')]),/duplicate/);
 assert.throws(()=>prospectiveScorecard([rec('a',null,'HIT')]),/conflicting/);
 assert.throws(()=>prospectiveScorecard([rec('a','NO','WAIT_RESOLVED')]),/conflicting/);
 assert.throws(()=>prospectiveScorecard([rec('a','YES','HIT','UNKNOWN_FEED')]),/conflicting/);
});
