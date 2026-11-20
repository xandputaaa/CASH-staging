'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {authorized, privateAccessGate} = require('../private-access-gate');

const password = 'local-test-only-not-a-real-secret';
const header = (user, pass) => 'Basic ' + Buffer.from(user + ':' + pass).toString('base64');

test('private gate requires exact username and password; malformed credentials fail closed', () => {
  assert.equal(authorized(header('cash', password), password), true);
  assert.equal(authorized(header('admin', password), password), false);
  assert.equal(authorized(header('cash', password + 'x'), password), false);
  assert.equal(authorized(header('cash', password).replace(/.$/, '!'), password), false);
  assert.equal(authorized('Bearer abc', password), false);
  assert.equal(authorized(undefined, password), false);
  assert.throws(() => authorized(header('cash', 'short'), 'short'), /at least 16/);
});

test('unauthenticated gate emits 401 challenge without echoing supplied credentials', () => {
  const headers = {};
  let body = '';
  const req = {headers:{authorization:header('cash', 'incorrect-private-password')},socket:{remoteAddress:'test-auth-boundary'}};
  const res = {writeHead(code, values){headers.code=code;headers.values=values;},end(value){body=value;}};
  assert.equal(privateAccessGate(req,res,password),true);
  assert.equal(headers.code,401);
  assert.match(headers.values['WWW-Authenticate'], /^Basic realm=/);
  assert.equal(headers.values['Cache-Control'],'no-store');
  assert.doesNotMatch(JSON.stringify(headers)+body,/incorrect-private-password|local-test-only-not-a-real-secret/);
});
