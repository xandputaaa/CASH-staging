'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'..','.github','workflows','observed-settlement-reconciliation.yml');
const yaml=fs.readFileSync(file,'utf8');
test('scheduled reconciliation archive manifest is a real YAML multiline path, not literal slash-n bytes',()=>{
 const artifact=yaml.split('- name: Retain a provisional audit report only')[1];
 assert.ok(artifact,'Existing original report upload must be retained');
 assert.ok(artifact.includes('          path: |\n            audit/report/provisional-reconciliation.json\n            audit/report/btc15-evidence-gate.json'),
   'Artifact paths must use actual newlines for the YAML block scalar');
 assert.ok(!artifact.includes('path: |\\n'),'Literal backslash-n makes the entire GitHub Actions workflow invalid');
 assert.ok(!artifact.includes('artifact.yml'),'Do not substitute unrequested artifact routes');
});
test('failed optional evidence add-on cannot block preserving the original scheduled research audit',()=>{
 const compute=yaml.indexOf('- name: Recompute witnessed forecast and numeric Kalshi settlement evidence');
 const gate=yaml.indexOf('- name: Produce read-only BTC15 evidence go/no-go summary');
 const upload=yaml.indexOf('- name: Retain a provisional audit report only');
 assert.ok(compute>=0&&gate>compute&&upload>gate);
 const block=yaml.slice(gate,upload);
 assert.match(block,/continue-on-error: true/);
 assert.match(block,/audit\/recovery\/late\.json/);
 assert.doesNotMatch(block,/approve|ordersEnabled: true|deploy|set_variables/);
});
