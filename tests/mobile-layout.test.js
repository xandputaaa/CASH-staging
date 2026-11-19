'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
test('mobile viewport and iPhone safe areas exist',()=>{
 assert.match(html,/name="viewport" content="width=device-width,initial-scale=1"/);
 assert.match(html,/env\(safe-area-inset-bottom\)/);
 assert.match(html,/@media\(max-width:600px\)/);
 assert.match(html,/@media\(max-width:360px\)/);
});
test('live assist inputs are accessible, touch sized and bounded',()=>{
 assert.match(html,/class="assist-controls"/);
 assert.match(html,/<label for="assistSide">/);
 assert.match(html,/<label for="assistQty">/);
 assert.match(html,/id="assistQty"[^>]*min="1"[^>]*max="10000"/);
 assert.match(html,/#cashManualAssist \.assist-controls select,#cashManualAssist \.assist-controls input\{[^}]*min-height:48px/);
});
test('narrow panels do not force fixed-width metric rows',()=>{
 assert.match(html,/\.shadow-metrics\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
 assert.match(html,/\.ledger-scroll\{max-width:100%;overflow-x:auto\}/);
});
