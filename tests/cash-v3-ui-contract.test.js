'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const base=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(base,file),'utf8');
test('CASH v3 client, feed and existing server scripts parse in Node',()=>{
 for(const file of ['cash-v3.js','cash-v3-chart-feed.js','server.js'])
  assert.doesNotThrow(()=>execFileSync(process.execPath,['--check',path.join(base,file)]));
});
test('mobile-first navigation is four clear destinations with hidden research modules',()=>{
 const html=read('index.html'),js=read('cash-v3.js'),css=read('cash-v3.css');
 for(const name of ['market','assist','lab','system']){
  assert.match(html,new RegExp('data-v3-nav="'+name+'"'));
  assert.match(html,new RegExp('id="v3'+name[0].toUpperCase()+name.slice(1)+'"'));
 }
 assert.match(html,/id="cashV3"/);
 assert.match(html,/viewport-fit=cover/);
 assert.match(html,/\/cash-v3.css/);
 assert.match(html,/\/cash-v3.js/);
 assert.match(js,/appendChild\(primary\)/);
 assert.match(js,/movePanel/);
 assert.match(css,/body\.cash-v3>main\{display:none!important\}/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(css,/safe-area-inset-bottom/);
});
test('new market chart does not embed fictitious price candles or demo chart generator',()=>{
 const js=read('cash-v3.js'),html=read('index.html');
 assert.match(js,/fetch\('\/api\/cash-v3\/market'/);
 assert.match(js,/Number\.isFinite\(p\?\.t\)/);
 assert.match(js,/No entry/);
 assert.match(html,/No synthetic market motion/);
 assert.doesNotMatch(js,/Math\.random\(/);
 assert.doesNotMatch(js,/Math\.sin\(/);
 assert.doesNotMatch(js,/setInterval\(.*samplePrice/);
});
test('private route returns no order permissions and reads the two official public chart sources',()=>{
 const server=read('server.js'),feed=read('cash-v3-chart-feed.js');
 assert.match(server,/if\(privateAccessGate\(req,res,process\.env\.CASH_PRIVATE_ACCESS_PASSWORD\)\)return/);
 assert.match(server,/req\.url==='\/api\/cash-v3\/market'/);
 assert.match(server,/inventedTicks|const chart=await cashV3ChartFeed\.query/);
 assert.match(server,/ordersEnabled:false,executionAuthorized:false/);
 assert.match(feed,/api\.kraken\.com\/0\/public\/OHLC/);
 assert.match(feed,/external-api\.kalshi\.com\/trade-api\/v2\/series\/KXBTC15M/);
 assert.match(feed,/COMPLEMENT_OF_RECORDED|DERIVED_FROM_KALSHI_YES_BID/);
 assert.match(feed,/syntheticForecastPath:false/);
});
