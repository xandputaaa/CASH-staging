'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const pkg=require('../package.json');
test('production start does not run test suites against mounted live audit data',()=>{
 assert.equal(pkg.scripts.start,'node server.js');
 assert.match(pkg.scripts.test,/node --test tests\/\*\.test\.js/);
 const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 assert.match(server,/runStartupSmoke\(\{port,authorization:/);
 assert.match(server,/createShadowLiveFeed\(\{quotes:venueFeeds,spot:feed\}\)/);
});
