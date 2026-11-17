'use strict';
/*
 * Railway key name compatibility, server-only. Prefer the documented
 * namespaced variables; accept the shorter names the owner already set.
 * Never serialize, log, export or expose credential values.
 */
function resolvePrivateConfig(env=process.env){
 const selected=(main,alias)=>typeof env[main]==='string'&&env[main].length>0?
  env[main]:env[alias];
 return {
  keyId:selected('CASH_KALSHI_READ_KEY_ID','READ_KEY_ID'),
  privateKeyPem:selected('CASH_KALSHI_READ_KEY_PEM','READ_KEY_PEM'),
  ownerToken:selected('CASH_OWNER_VERIFY_TOKEN','OWNER_VERIFY_TOKEN')
 };
}
module.exports={resolvePrivateConfig};
