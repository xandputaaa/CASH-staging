'use strict';
/*
 * Read-only backup risk label for the default late-checkpoint RAM journal.
 * This is NOT the market model, a persistence layer, or a trading signal.
 * The deployed late monitor defaults to maxRecords=160, but code can
 * override that setting; this is therefore an ASSUMED default, not a
 * guaranteed live capacity value.
 */
const DEFAULT_MAX=160;
const WARNING_REMAINING=32;
function assessDefaultLateCapacity(exportData){
 if(!exportData||exportData.version!=='CASH_LATE_CHECKPOINT_SHADOW_V1'||
  exportData.format!=='CASH_LATE_CHECKPOINT_UNVERIFIED_HASH_CHAIN_V1'||
  !Number.isSafeInteger(exportData.records)||exportData.records<0||
  !Array.isArray(exportData.events)||
  exportData.realMoneyAuthorized!==false||
  exportData.canExecuteOrders!==false)
  throw Error('Unsafe or malformed late research capacity input');
 const headroom=Math.max(0,DEFAULT_MAX-exportData.records);
 return {
  version:'CASH_ASSUMED_DEFAULT_JOURNAL_CAPACITY_V1',
  defaultConfiguredMax:DEFAULT_MAX,
  marketsFrozen:exportData.records,
  estimatedRemainingFrozenMarketSlots:headroom,
  caution:'Default 160-market limit from current source; may differ if server overrides the constructor. GitHub artifacts expire after 30 days. This is not permanent storage or independent forecast validation.',
  state:exportData.records>=DEFAULT_MAX?'DEFAULT_JOURNAL_FULL':
   headroom<=WARNING_REMAINING?'DEFAULT_JOURNAL_CAPACITY_LOW':
   'DEFAULT_JOURNAL_HAS_HEADROOM',
  independentlyQualified:0,tradingEnabled:false
 };
}
module.exports={assessDefaultLateCapacity,DEFAULT_MAX,WARNING_REMAINING};
