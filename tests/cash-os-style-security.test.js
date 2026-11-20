'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('CASH OS external stylesheet is permitted by the actual HTML response CSP',()=>{
 const server=read('server.js');
 assert.match(server,/Content-Security-Policy',\s*"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';/);
 assert.doesNotMatch(server,/style-src 'unsafe-inline'; img-src/);
 assert.match(server,/req\.url==='\/cash-v3\.css'/);
 assert.match(server,/Content-Type':'text\/css; charset=utf-8'/);
 assert.match(read('index.html'),/<link rel="stylesheet" href="\/cash-v3\.css">/);
});
test('recorded dual-dashboard failure is prevented even if CSS is temporarily unavailable',()=>{
 const js=read('cash-v3.js'),css=read('cash-v3.css');
 assert.match(js,/document\.body\.classList\.add\('cash-v3'\)/);
 assert.match(js,/legacyMain\.hidden=true/);
 assert.match(css,/body\.cash-v3>main\{display:none!important\}/);
 assert.match(css,/#cashV3 \.v3-page\[data-visible="true"\]/);
});
test('CASH OS focuses market chart then call, with metrics and diagnostics underneath on mobile',()=>{
 const html=read('index.html'),css=read('cash-v3.css');
 for(const id of ['v3MarketChart','v3MarketCall','v3MarketMetrics','v3MarketIntegrity']){
  assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(css,new RegExp('#cashV3 #'+id+'\\{order:[1-4]\\}'));
 }
 assert.match(css,/#cashV3 \.v3-layout>\.v3-stack\{display:contents\}/);
 assert.match(html,/The market, in focus\./);
 assert.match(html,/class="v3-logo">CASH <span class="v3-osmark">OS<\/span>/);
 assert.match(html,/id="v3Call"/);
 assert.match(html,/id="v3Chart"/);
 assert.match(html,/data-v3-nav="market"/);
 assert.match(html,/data-v3-nav="assist"/);
 assert.match(html,/data-v3-nav="lab"/);
 assert.match(html,/data-v3-nav="system"/);
});
test('CASH OS accessible reduced-motion styling and existing research controls survive',()=>{
 const css=read('cash-v3.css'),js=read('cash-v3.js');
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/safe-area-inset-bottom/);
 assert.match(css,/backdrop-filter:blur/);
 assert.match(js,/movePanel/);
 for(const id of ['cashManualCalls','cashProspective','cashEvaluation','cashDiagnostics'])
  assert.match(js,new RegExp(id));
 assert.doesNotMatch(js,/Math\.random\(/);
 assert.doesNotMatch(js,/Math\.sin\(/);
 assert.doesNotThrow(()=>execFileSync(process.execPath,['--check',path.join(root,'cash-v3.js')]));
});
