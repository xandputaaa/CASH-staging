const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
test('simulation script exists',()=>assert.ok(script));
function app(){const elements=new Map();const document={getElementById(id){if(!elements.has(id))elements.set(id,{textContent:'',className:'',disabled:false,innerHTML:'',setAttribute(k,v){this[k]=v}});return elements.get(id)}};const mem=new Map();const localStorage={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,v)};const ctx=vm.createContext({document,alert:()=>{},localStorage});vm.runInContext(script,ctx);return {run:s=>vm.runInContext(s,ctx),get:id=>document.getElementById(id)}}
test('starts at $100 with no order',()=>{const a=app();assert.equal(a.get('balance').textContent,'$100.00');assert.match(a.get('position').textContent,/No open/)});
test('stake reservation and reset refund',()=>{const a=app();a.run("setStake(2);buy('UP')");assert.equal(a.get('balance').textContent,'$98.00');a.run('reset()');assert.equal(a.get('balance').textContent,'$100.00');assert.match(a.get('ledger').innerHTML,/CANCELLED/)});
test('cannot buy after first tick',()=>{const a=app();a.run("advance();buy('UP')");assert.equal(a.get('balance').textContent,'$100.00')});
test('winning paper position pays $10 on $5 stake',()=>{const a=app();a.run("buy('UP');for(let i=0;i<7;i++)advance()");assert.equal(a.get('balance').textContent,'$105.00');assert.match(a.get('ledger').innerHTML,/WIN/)});
test('losing paper position forfeits stake',()=>{const a=app();a.run("buy('DOWN');for(let i=0;i<7;i++)advance()");assert.equal(a.get('balance').textContent,'$95.00');assert.match(a.get('ledger').innerHTML,/LOSS/)});
test('duplicate buys do not double reserve',()=>{const a=app();a.run("buy('UP');buy('DOWN')");assert.equal(a.get('balance').textContent,'$95.00')});
test('no real trading or external fetch APIs in client script',()=>{assert.doesNotMatch(script,/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(/)});
test('server has no order route',()=>{const server=fs.readFileSync('server.js','utf8');assert.doesNotMatch(server,/\/order|\/trade|\/execute/)});

test('fictional price and fee accounting',()=>{const a=app();a.run("setStake(2);setPrice(0.4);toggleFee();buy('UP');for(let i=0;i<7;i++)advance()");assert.equal(a.get('balance').textContent,'$102.94');assert.equal(a.get('trades').textContent,'1');assert.equal(a.get('winrate').textContent,'100.0%')});
test('cancelled positions do not inflate win rate',()=>{const a=app();a.run("setStake(2);buy('UP');reset()");assert.equal(a.get('trades').textContent,'0');assert.equal(a.get('cancelled').textContent,'1');assert.equal(a.get('balance').textContent,'$100.00')});
test('fictional scenario band is generated for both markets',()=>{const a=app();assert.match(a.get('range').d,/^M /);a.run("selectVenue('Polymarket')");assert.match(a.get('range').d,/ Z$/)});

test('ledger captures entry, fee and net for a hypothetical winning position',()=>{const a=app();a.run("setStake(2);setPrice(0.4);toggleFee();buy('UP');for(let i=0;i<7;i++)advance()");assert.match(a.get('ledger').innerHTML,/40¢/);assert.match(a.get('ledger').innerHTML,/\$0\.06/);assert.match(a.get('ledger').innerHTML,/\+\$2\.94/)});
test('losing position records negative net and zero fee',()=>{const a=app();a.run("buy('DOWN');for(let i=0;i<7;i++)advance()");assert.match(a.get('ledger').innerHTML,/−\$5\.00/);assert.match(a.get('ledger').innerHTML,/\$0\.00/)});

test('performance net reconciles to itemized ledger',()=>{const a=app();a.run("setStake(2);setPrice(0.4);toggleFee();buy('UP');for(let i=0;i<7;i++)advance()");assert.equal(a.get('pnl').textContent,'+$2.94');assert.match(a.get('ledger').innerHTML,/\+\$2\.94/)});

test('integrity matches ledger and wallet for fictional settlement',()=>{const a=app();a.run("setStake(2);setPrice(0.4);toggleFee();buy('UP');for(let i=0;i<7;i++)advance()");assert.match(a.get('integrity').textContent,/MATCH/)});
test('integrity detects fictional wallet discrepancies',()=>{const a=app();a.run("buy('UP');for(let i=0;i<7;i++)advance();balance+=10;render()");assert.match(a.get('integrity').textContent,/MISMATCH/)});
test('legacy ledger is not claimed to be audited',()=>{const a=app();a.run("ledger.push({round:1,venue:'Kalshi',side:'UP',stake:5,result:'WIN'});render()");assert.match(a.get('integrity').textContent,/LEGACY/)});
