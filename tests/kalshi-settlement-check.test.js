'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {checkKalshiSettlement}=require('../kalshi-settlement-check');
const result=(winner,final,strike=86000.12)=>({
 result:winner,strike_type:'greater_or_equal',floor_strike:strike,expiration_value:final
});
test('Kalshi numeric settlement audit compares official strike and final value with YES ties',()=>{
 assert.equal(checkKalshiSettlement(result('yes',86000.12)).state,'NUMERIC_MATCH');
 assert.equal(checkKalshiSettlement(result('yes',86000.13)).state,'NUMERIC_MATCH');
 assert.equal(checkKalshiSettlement(result('no',86000.11)).state,'NUMERIC_MATCH');
 assert.equal(checkKalshiSettlement(result('no',86000.12)).state,'NUMERIC_CONTRADICTION');
 assert.equal(checkKalshiSettlement(result('yes',86000.11)).numericRuleMatched,false);
});
test('incomplete settlement values or unsupported rules never claim numeric rule validation',()=>{
 assert.equal(checkKalshiSettlement(result('yes',null)).state,'NUMERIC_FIELDS_MISSING');
 assert.equal(checkKalshiSettlement({...result('yes',86001),strike_type:'greater'}).state,'STRIKE_RULE_UNCONFIRMED');
 assert.equal(checkKalshiSettlement({...result('yes',86001),floor_strike:'garbage'}).state,'NUMERIC_FIELDS_MISSING');
 assert.equal(checkKalshiSettlement({result:'void'}).state,'VOID_EXCLUDED');
 assert.equal(checkKalshiSettlement({result:null}).state,'NO_FINAL_DIRECTIONAL_RESULT');
});
