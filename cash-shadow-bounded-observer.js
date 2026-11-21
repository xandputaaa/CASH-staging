'use strict';
/*
 * Bounded follow-up observation on the SAME GitHub runner.
 * GitHub scheduled workflows can arrive late or be missed; this small
 * retry window does not promise exact cadence or 100% market coverage.
 *
 * Each attempt fetches the complete public source independently, then the
 * existing observer assigns a NEW GitHub runner clock AFTER response.
 * A successful pre-expiry observation is never overwritten by later reads.
 * The original one-observation-per-run archive schema is unchanged.
 */
const {runPublicShadowObserver}=require('./cash-shadow-public-observer-runner');
const MAX_WAIT_MS=180000,DEFAULT_INTERVAL_MS=30000;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function runBoundedShadowObserver({
 runObserver=runPublicShadowObserver,
 now=()=>Date.now(),sleep=wait,log=console.log,
 maxWaitMs=MAX_WAIT_MS,intervalMs=DEFAULT_INTERVAL_MS,
 observerOptions={}
}={}){
 if(typeof runObserver!=='function'||typeof now!=='function'||
    typeof sleep!=='function'||typeof log!=='function'||
    !Number.isInteger(maxWaitMs)||maxWaitMs<0||maxWaitMs>MAX_WAIT_MS||
    !Number.isInteger(intervalMs)||intervalMs<1000||intervalMs>MAX_WAIT_MS||
    !observerOptions||typeof observerOptions!=='object'||
    Array.isArray(observerOptions))
  throw Error('Unsafe bounded shadow observer configuration');
 const started=now();
 if(!Number.isSafeInteger(started))throw Error('Runner start clock invalid');
 let attempts=0,result=null;
 // Aggregate fixed, non-sensitive categories across attempts; never log exception text.
 const failureCounts=Object.create(null);
 const allowedFailureCodes=new Set([
  'SOURCE_AUTHORIZATION_REJECTED','SOURCE_HTTP_ERROR','SOURCE_BODY_TOO_LARGE',
  'RUNNER_CLOCK_UNAVAILABLE','SOURCE_INVALID_JSON','SOURCE_INVALID_UTF8','SOURCE_TRANSPORT_OR_UNKNOWN'
 ]);
 // This guard also protects tests and the runner from a clock that stalls.
 const maxAttempts=Math.floor(maxWaitMs/intervalMs)+1;
 while(attempts<maxAttempts){
  result=await runObserver(observerOptions);
  attempts++;
  if(result?.status==='PUBLIC_SOURCE_UNAVAILABLE_OR_INVALID'){
   const code=allowedFailureCodes.has(result.errorCode)
    ?result.errorCode:'SOURCE_TRANSPORT_OR_UNKNOWN';
   failureCounts[code]=(failureCounts[code]||0)+1;
  }
  // A non-success status must never carry purported pre-expiry evidence.
  // Reject unknown statuses instead of letting an upstream schema change
  // silently enter the archive as an apparently valid observation.
  if(!result||!Number.isSafeInteger(result.observedBeforeExpiryCount)||
    !['OBSERVED_PREEXPIRY','NO_ELIGIBLE_PREEXPIRY_RECORDS',
      'PUBLIC_SOURCE_UNAVAILABLE_OR_INVALID'].includes(result.status)||
    (result.status==='OBSERVED_PREEXPIRY'
      ?result.observedBeforeExpiryCount<1
      :result.observedBeforeExpiryCount!==0))
   throw Error('Shadow source observer returned inconsistent evidence');
  // Check the runner clock even on a successful witness: otherwise a
  // backwards clock bypasses the existing fail-closed timing guard.
  const elapsed=now()-started;
  if(!Number.isFinite(elapsed)||elapsed<0)
   throw Error('GitHub runner time moved backwards');
  if(result.status==='OBSERVED_PREEXPIRY')break;
  const remaining=maxWaitMs-elapsed;
  if(remaining<intervalMs)break;
  await sleep(intervalMs);
 }
 // Validate the final clock sample too: do not publish a success summary
 // if time regresses after the last observation or becomes non-finite.
 const elapsed=now()-started;
 if(!Number.isSafeInteger(elapsed)||elapsed<0)
  throw Error('GitHub runner final clock invalid');
 log('CASH_SHADOW_BOUNDED_OBSERVER_FAILURE_COUNTS='+JSON.stringify(failureCounts));
 log('CASH_SHADOW_BOUNDED_OBSERVER_ATTEMPTS='+attempts);
 log('CASH_SHADOW_BOUNDED_OBSERVER_ELAPSED_MS='+elapsed);
 log('CASH_SHADOW_BOUNDED_OBSERVER_FINAL_STATUS='+result.status);
 log('CASH_SHADOW_BOUNDED_OBSERVER_PREEXPIRY='+result.observedBeforeExpiryCount);
 log('CASH_SHADOW_BOUNDED_OBSERVER_QUALIFIED=0');
 log('CASH_SHADOW_BOUNDED_OBSERVER_ORDERS=false');
 return {result,attempts,elapsedMs:elapsed,maxWaitMs,failureCounts};
}
if(require.main===module)runBoundedShadowObserver().catch(error=>{
 console.error('CASH shadow observer bounded retry stopped without attestation');
 process.exitCode=1;
});
module.exports={runBoundedShadowObserver,MAX_WAIT_MS,DEFAULT_INTERVAL_MS};
