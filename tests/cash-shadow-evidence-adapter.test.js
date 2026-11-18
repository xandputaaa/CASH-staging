'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {compareShadowEvidence}=require('../cash-shadow-evidence-adapter');
const marketId='KXBTC15M-TEST123',candidateId='CASH_SHADOW_SPOT_MOMENTUM_V1';
const evidence={marketId,side:'YES',winner:'YES',sourcePresent:true,witnessPresent:true,
 sourceFrozenHash:'a'.repeat(64),witnessFrozenHash:'a'.repeat(64),
 directPrecloseCorroborated:true,directTwoReadSettlementVerified:true};
const shadow={...evidence,modelId:candidateId,forecastAtMs:1000,marketCloseMs:301000,archivedBeforeExpiry:true};
test('archived shadow evidence stays offline and unqualified',()=>{
 const r=compareShadowEvidence({baseline:[evidence],candidate:[shadow],candidateId});
 assert.equal(r.candidatePromoted,false);
 assert.equal(r.realMoneyOrdersAllowed,false);
 assert.equal(r.independentQualificationCount,0);
 assert.equal(r.shadowPreExpiryProvenanceIndependentlyVerified,false);
});
test('rejects unarchived, postclose, wrong model, and nonpaired candidate',()=>{
 for(const change of [{archivedBeforeExpiry:false},{forecastAtMs:301000},
  {modelId:'CASH_SHADOW_WRONG'},{marketId:'KXBTC15M-OTHER123'}])
  assert.throws(()=>compareShadowEvidence({baseline:[evidence],candidate:[{...shadow,...change}],candidateId}));
});
