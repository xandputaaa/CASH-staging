'use strict';
const BASE_KALSHI='https://external-api.kalshi.com/trade-api/v2';
const BASE_GAMMA='https://gamma-api.polymarket.com';
const BASE_CLOB='https://clob.polymarket.com';
const CACHE_MS=12000,STALE_MS=30000;
function price(x){const n=Number(x);return Number.isFinite(n)&&n>0&&n<1?n:null}
async function read(url,fetchImpl,timeout=3500){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{const resp=await fetchImpl(url,{signal:controller.signal,headers:{'Accept':'application/json','User-Agent':'CASH-readonly-market-dashboard/1.0'}});if(!resp.ok)throw Error('Market source HTTP failure');return await resp.json()}finally{clearTimeout(timer)}
}
function selectKalshi(data,now){
  if(!Array.isArray(data?.markets))throw Error('Invalid market response');
  const active=data.markets.filter(m=>typeof m?.ticker==='string'&&/^KXBTC15M-[A-Za-z0-9-]+$/.test(m.ticker)&&(!m.status||m.status==='open'||m.status==='active')&&Number.isFinite(Date.parse(m.close_time))&&Date.parse(m.close_time)>now&&(!m.open_time||Date.parse(m.open_time)<=now));
  active.sort((a,b)=>Date.parse(a.close_time)-Date.parse(b.close_time));
  const m=active[0];if(!m)throw Error('No current Kalshi BTC 15m market');
  const yesBid=price(m.yes_bid_dollars),yesAsk=price(m.yes_ask_dollars),noAsk=price(m.no_ask_dollars);
  const numberStrike=Number(m.floor_strike);
  const targetPrice=Number.isFinite(numberStrike)&&numberStrike>1000&&numberStrike<10000000?
    numberStrike:null;
  const rules=typeof m.rules_primary==='string'?m.rules_primary:'';
  const strikeType=typeof m.strike_type==='string'?m.strike_type:null;
  const canResolveTieAsYes=strikeType==='greater_or_equal';
  const contractRuleStatus=/\bBRTI\b|CF Benchmarks[^.]*Bitcoin Real[- ]Time Index/i.test(rules)
    &&/sixty seconds|60 seconds|60-second/i.test(rules)&&/before/i.test(rules)
     ?'BRTI_60S_RULE_TEXT_PRESENT':'RULE_TEXT_NOT_CONFIRMED';
  if(yesAsk===null&&noAsk===null)throw Error('No usable public Kalshi ask quote');
  return {venue:'Kalshi',marketId:m.ticker,
    title:typeof m.title==='string'?m.title.slice(0,180):'BTC Up or Down 15m',
    openTime:typeof m.open_time==='string'?m.open_time:null,endTime:m.close_time,
    targetPrice,targetSource:targetPrice===null?'MISSING':'KALSHI_FLOOR_STRIKE',
    contractRuleStatus,strikeType,
    tieGoesToYes:canResolveTieAsYes,yesBid,yesAsk,noAsk,
    status:yesAsk!==null&&noAsk!==null?'live':'partial',
    quotedFields:'YES bid, YES ask and NO ask; public observed dollars per $1 payout, not guaranteed executable'};
}
function parseTokens(raw){const a=typeof raw==='string'?JSON.parse(raw):raw;if(!Array.isArray(a)||a.length!==2||!a.every(x=>/^\d{10,}$/.test(String(x))))throw Error('Invalid CLOB token IDs');return a.map(String)}
function selectPolyEvent(data,slot,now){
  const events=Array.isArray(data)?data:[data],slug='btc-updown-5m-'+slot;
  const ev=events.find(e=>e?.slug===slug&&e.closed!==true);if(!ev||!Array.isArray(ev.markets))throw Error('No current Polymarket BTC 5m event');
  const m=ev.markets.find(x=>x&&x.closed!==true&&x.active!==false);if(!m)throw Error('No current active Polymarket market');
  const outcomes=typeof m.outcomes==='string'?JSON.parse(m.outcomes):m.outcomes;
  const tokens=parseTokens(m.clobTokenIds);
  if(tokens[0]===tokens[1])throw Error('Duplicate CLOB outcome tokens');
  if(typeof m.conditionId!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(m.conditionId))throw Error('Invalid Polymarket condition identifier');
  const up=outcomes?.findIndex(x=>String(x).toLowerCase()==='up'),down=outcomes?.findIndex(x=>String(x).toLowerCase()==='down');
  if(up<0||down<0||up===down)throw Error('Missing market outcomes');
  const endTime=new Date((slot+300)*1000).toISOString();
  if(slot>now/1000||slot+300<=now/1000)throw Error('Outside current 5m window');
  return {slug,marketId:typeof m.conditionId==='string'?m.conditionId:null,endTime,upToken:tokens[up],downToken:tokens[down],title:typeof ev.title==='string'?ev.title.slice(0,180):'BTC Up or Down 5m'};
}
function createVenueFeeds({fetchImpl=fetch,clock=()=>Date.now()}={}){
  const state={Kalshi:{cached:null,inflight:null,refreshFailed:false,refreshFailedAt:null,lastAttemptMs:null},Polymarket:{cached:null,inflight:null,refreshFailed:false,refreshFailedAt:null,lastAttemptMs:null}};
  function view(venue){if(!state[venue])throw Error('Unsupported venue');const st=state[venue],cached=st.cached,ageMs=cached?Math.max(0,clock()-cached.fetchedMs):null;return cached?{...cached.quote,status:st.refreshFailed||ageMs>STALE_MS||Date.parse(cached.quote.endTime)<=clock()?'stale':cached.quote.status,ageMs,fetchedAt:cached.fetchedAt,refreshFailed:st.refreshFailed,refreshFailedAt:st.refreshFailedAt}:{venue,status:'unavailable',ageMs:null,fetchedAt:null,marketId:null,refreshFailed:st.refreshFailed,refreshFailedAt:st.refreshFailedAt}}
  async function query(venue){
    if(!state[venue])throw Error('Unsupported venue');
    const st=state[venue];if(st.inflight)return st.inflight;
    if(st.refreshFailed&&st.lastAttemptMs!==null&&clock()-st.lastAttemptMs<CACHE_MS)return view(venue);
    if(st.cached&&clock()-st.cached.fetchedMs<CACHE_MS)return view(venue);
    st.lastAttemptMs=clock();
    st.inflight=(async()=>{
      try{
        let quote;
        if(venue==='Kalshi'){
          const data=await read(BASE_KALSHI+'/markets?series_ticker=KXBTC15M&status=open&limit=30',fetchImpl);
          quote=selectKalshi(data,clock());
          // Some market-list payloads omit full contract rules/target. Check
          // only the exact current ticker; never invent the BRTI target.
          if(quote.targetPrice===null||
            quote.contractRuleStatus==='RULE_TEXT_NOT_CONFIRMED'||!quote.tieGoesToYes){
            try{
              const detail=await read(BASE_KALSHI+'/markets/'+encodeURIComponent(quote.marketId),fetchImpl,2500);
              const row=detail?.market;
              if(row?.ticker===quote.marketId&&
                (!row.close_time||row.close_time===quote.endTime)){
                const listing=data.markets.find(m=>m.ticker===quote.marketId);
                if(listing){
                  const merged={...row,...listing,
                    floor_strike:listing.floor_strike??row.floor_strike,
                    strike_type:listing.strike_type||row.strike_type,
                    rules_primary:listing.rules_primary||row.rules_primary};
                  const updated=selectKalshi({markets:[merged]},clock());
                  if(updated.marketId===quote.marketId)quote=updated;
                }
              }
            }catch{/* Do not fabricate omitted official contract details */}
          }
        }else{
          const slot=Math.floor(clock()/300000)*300;
          const data=await read(BASE_GAMMA+'/events?slug=btc-updown-5m-'+slot,fetchImpl);
          const event=selectPolyEvent(data,slot,clock());
          const [up,down]=await Promise.allSettled([
            read(BASE_CLOB+'/price?token_id='+encodeURIComponent(event.upToken)+'&side=BUY',fetchImpl),
            read(BASE_CLOB+'/price?token_id='+encodeURIComponent(event.downToken)+'&side=BUY',fetchImpl)
          ]);
          const upAsk=up.status==='fulfilled'?price(up.value?.price):null;
          const downAsk=down.status==='fulfilled'?price(down.value?.price):null;
          if(upAsk===null&&downAsk===null)throw Error('No valid Polymarket prices');
          quote={venue:'Polymarket',marketId:event.marketId,slug:event.slug,title:event.title,endTime:event.endTime,upAsk,downAsk,status:upAsk!==null&&downAsk!==null?'live':'partial',quotedFields:'UP/DOWN public CLOB best BUY prices; venue USD dollars per $1 payout'};
        }
        const fetchedMs=clock();st.cached={quote,fetchedMs,fetchedAt:new Date(fetchedMs).toISOString()};st.refreshFailed=false;st.refreshFailedAt=null;
        return view(venue);
      }catch(e){
        st.refreshFailed=true;st.refreshFailedAt=new Date(clock()).toISOString();
        return view(venue);
      }
    })().finally(()=>{st.inflight=null});
    return st.inflight;
  }
  return {query,view};
}
module.exports={createVenueFeeds,selectKalshi,selectPolyEvent,price};
