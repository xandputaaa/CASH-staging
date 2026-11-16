'use strict';
/*
 * Independent arithmetic over Kalshi-published settlement fields.
 * Does NOT independently authenticate the values, market rule, publication
 * time or whether CF Benchmarks data was calculated correctly.
 */
function parsedPrice(x){
 if(typeof x!=='number'&&typeof x!=='string')return null;
 if(typeof x==='string'&&!/^(?:[0-9]+)(?:\.[0-9]{1,8})?$/.test(x))return null;
 const n=Number(x);
 return Number.isFinite(n)&&n>1000&&n<10000000?n:null;
}
function checkKalshiSettlement(m){
 const state=String(m?.result||'').toLowerCase();
 if(state==='void')return {state:'VOID_EXCLUDED',numericRuleMatched:null,
  explanation:'Official void result is not a directional win or loss.'};
 if(!['yes','no'].includes(state))return {state:'NO_FINAL_DIRECTIONAL_RESULT',
  numericRuleMatched:null,explanation:'No final directional result supplied.'};
 const strike=parsedPrice(m?.floor_strike),final=parsedPrice(m?.expiration_value);
 if(strike===null||final===null)return {state:'NUMERIC_FIELDS_MISSING',
  numericRuleMatched:null,explanation:'Official strike or final index value is unavailable.'};
 if(m.strike_type!=='greater_or_equal')return {state:'STRIKE_RULE_UNCONFIRMED',
  numericRuleMatched:null,explanation:'Only the KXBTC15M greater-or-equal payout rule is supported.'};
 // Compare 2-decimal benchmark/strike values, per the market rule.
 const strikeCents=Math.round(strike*100),finalCents=Math.round(final*100);
 const expected=finalCents>=strikeCents?'yes':'no';
 return expected===state?{state:'NUMERIC_MATCH',numericRuleMatched:true,
  strikeCents,finalCents,
  explanation:'Kalshi-published strike and expiration value agree arithmetically with the result.'}:
  {state:'NUMERIC_CONTRADICTION',numericRuleMatched:false,
   strikeCents,finalCents,
   explanation:'Final result disagrees with published strike and expiration value; do not score.'};
}
module.exports={checkKalshiSettlement};
