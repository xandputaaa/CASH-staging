'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {resolvePrivateConfig}=require('../private-key-config');
test('short Railway variable names correctly resolve to existing owner secrets',()=>{
 const x=resolvePrivateConfig({READ_KEY_ID:'id-test',READ_KEY_PEM:'pem-test',
  OWNER_VERIFY_TOKEN:'token-test'});
 assert.deepEqual(x,{keyId:'id-test',privateKeyPem:'pem-test',ownerToken:'token-test'});
});
test('documented namespaced secret names have priority over short aliases',()=>{
 const x=resolvePrivateConfig({
  CASH_KALSHI_READ_KEY_ID:'preferred',READ_KEY_ID:'alias',
  CASH_KALSHI_READ_KEY_PEM:'preferredPem',READ_KEY_PEM:'aliasPem',
  CASH_OWNER_VERIFY_TOKEN:'preferredToken',OWNER_VERIFY_TOKEN:'aliasToken'});
 assert.deepEqual(x,{keyId:'preferred',privateKeyPem:'preferredPem',ownerToken:'preferredToken'});
});
test('unset or empty variable pairs do not manufacture working credentials',()=>{
 const x=resolvePrivateConfig({});
 assert.equal(x.keyId,undefined);
 assert.equal(x.privateKeyPem,undefined);
 assert.equal(x.ownerToken,undefined);
 const y=resolvePrivateConfig({CASH_KALSHI_READ_KEY_ID:'',READ_KEY_ID:'key'});
 assert.equal(y.keyId,'key');
});
