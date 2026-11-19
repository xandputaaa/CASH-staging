'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const page=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');

test('mobile command layout retains original read-only market identifiers',()=>{
 for(const id of ['cashSimple','cashSettlementCall','cashManualAssist','livePaperLab','cashOrderVerify','cashProspective','cashLateCheckpoint','cashEvaluation','shadowMonitor','cashCognition','cashDiagnostics','kalshi15Terminal']){
  assert.match(page,new RegExp('id="'+id+'"'));
 }
 assert.match(page,/NO REAL ORDERS/);
 assert.match(page,/PRACTICE ONLY/);
 assert.match(page,/data-cash-mobile-tab="market"/);
});

test('four accessible mobile destinations are present',()=>{
 assert.equal((page.match(/data-cash-tab="/g)||[]).length,4);
 for(const tab of ['market','assist','lab','system']){
  assert.match(page,new RegExp('data-cash-tab="'+tab+'"'));
 }
 assert.match(page,/aria-label="CASH mobile sections"/);
 assert.match(page,/aria-pressed="true"/);
});

test('navigation is responsive, keyboard-accessible, and reduces motion',()=>{
 assert.match(page,/@media\(max-width:760px\)/);
 assert.match(page,/prefers-reduced-motion:reduce/);
 assert.match(page,/ArrowLeft/);
 assert.match(page,/ArrowRight/);
 assert.match(page,/main>section\.panel\{display:none!important\}/);
 assert.match(page,/style\.removeProperty\('display'\)/);
});

test('inline mobile controller parses without touching model or order APIs',()=>{
 const start=page.lastIndexOf('<script>');
 const end=page.indexOf('</script>',start);
 assert.ok(start!==-1&&end!==-1);
 const script=page.slice(start+8,end);
 assert.doesNotThrow(()=>new vm.Script(script));
 assert.doesNotMatch(script,/fetch\s*\(/);
 assert.doesNotMatch(script,/localStorage/);
 assert.doesNotMatch(script,/api\/orders?/);
});
