'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const script=fs.readFileSync(require('node:path').join(__dirname,'../view-mode.js'),'utf8');
function harness(saved){
 const listeners={},elements={};
 for(const id of ['modeSimple','modeAdvanced','modeHelp']){
  elements[id]={id,className:'',attrs:{},textContent:'',
   setAttribute(k,v){this.attrs[k]=v},
   addEventListener(k,fn){listeners[id+':'+k]=fn}};
 }
 const body={attrs:{},
  setAttribute(k,v){this.attrs[k]=v},
  getAttribute(k){return this.attrs[k]}};
 const storage={value:saved,writes:[],
  getItem(){return this.value},
  setItem(k,v){this.value=v;this.writes.push([k,v])}};
 const events=[];
 const document={body,getElementById:id=>elements[id]||null,dispatchEvent:e=>events.push(e.type)};
 const ctx={document,localStorage:storage,Event:class Event{constructor(type){this.type=type}}};
 vm.runInNewContext(script,ctx);
 return {elements,body,storage,events,click:id=>listeners[id+':click']()};
}
test('new visitors start in Simple Mode, can switch to Advanced, and preference persists',()=>{
 const h=harness(null);
 assert.equal(h.body.attrs['data-cash-mode'],'simple');
 assert.equal(h.elements.modeSimple.attrs['aria-pressed'],'true');
 assert.equal(h.storage.writes.length,0);
 h.click('modeAdvanced');
 assert.equal(h.body.attrs['data-cash-mode'],'advanced');
 assert.equal(h.elements.modeAdvanced.attrs['aria-pressed'],'true');
 assert.equal(h.elements.modeSimple.attrs['aria-pressed'],'false');
 assert.equal(h.storage.writes.at(-1)[1],'advanced');
 assert.ok(h.events.includes('cash-mode-change'));
 h.click('modeSimple');
 assert.equal(h.body.attrs['data-cash-mode'],'simple');
 assert.match(h.elements.modeHelp.textContent,/plain-English/);
});
test('returning users retain Advanced Mode and unknown storage cannot create a third mode',()=>{
 assert.equal(harness('advanced').body.attrs['data-cash-mode'],'advanced');
 assert.equal(harness('paper-trade-enabled').body.attrs['data-cash-mode'],'simple');
});
