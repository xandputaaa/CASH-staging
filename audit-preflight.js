'use strict';
/*
 * CASH audit-preflight manifest: proof-input digests only, not evidence that an
 * independent authority observed anything before expiration.
 * No outbound requests or external signing; no real trading actions.
 */
const {createHash}=require('node:crypto');
const {verifyChain}=require('./audit-journal');
const {isValidSpotCandidate}=require('./spot-momentum');
const SHA=x=>createHash('sha256').update(x).digest('hex');
const statuses={NO_CANDIDATE:0,LEGACY_NO_SOURCE_WINDOW:0,
 INVALID_CANDIDATE:0,SAMPLE_BACKED_COMMITMENT:0};
function createAuditPreflight(exported,{now=Date.now(),maxListed=12}={}){
 if(!Number.isFinite(now)||!Number.isSafeInteger(maxListed)||maxListed<0||maxListed>30)
  throw Error('Invalid audit-preflight settings');
 if(!exported||exported.mode!=='PUBLIC_MARKET_FAVORED_ASK_V1'||
  !['VOLATILE_SERVER_SESSION','FILESYSTEM_JOURNAL_UNVERIFIED'].includes(exported.storageMode)||
  exported.qualifyingProspectiveContracts!==0||exported.independentForecastModel!==false||
  !Array.isArray(exported.events))
  throw Error('Unsupported or falsely qualified audit session');
 if(verifyChain(exported.events)!==exported.headHash)throw Error('Audit head does not match event chain');
 const counts={...statuses},pending=new Map(),eligible=[];
 for(const event of exported.events){
  if(event.type==='CAPTURE'){
   const data=event.payload||{};
   const id=data.id,venue=data.venue,candidate=data.spotCandidate;
   if(typeof id!=='string'||pending.has(id))throw Error('Duplicate or missing capture identity');
   pending.set(id,{expiredAt:data.endTime,settlementSeen:false});
   if(!candidate){counts.NO_CANDIDATE++;continue}
   if(!Array.isArray(candidate.sampleWindow)){
    counts.LEGACY_NO_SOURCE_WINDOW++;continue;
   }
   const captureMs=Date.parse(data.serverCapturedAt);
   const expiryMs=Date.parse(data.endTime);
   if(!Number.isFinite(captureMs)||!Number.isFinite(expiryMs)||
    expiryMs-captureMs<60000||!['Kalshi','Polymarket'].includes(venue)||
    data.id!==venue+':'+data.marketId||
    !isValidSpotCandidate(candidate,venue,captureMs)){
    counts.INVALID_CANDIDATE++;continue;
   }
   counts.SAMPLE_BACKED_COMMITMENT++;
   const commitment=SHA('CASH-PRE-ATTESTATION-V1:'+event.hash);
   eligible.push({
    venue,marketId:data.marketId,
    serverClaimedCapturedAt:data.serverCapturedAt,
    scheduledExpiryAt:data.endTime,
    minimumLeadMs:60000,
    modelName:candidate.name,
    eventSequence:event.sequence,
    eventHash:event.hash,
    sampleWindowSha256:candidate.sampleWindowSha256,
    preAttestationCommitmentSha256:commitment,
    independentlyTimeAttested:false,
    validationStatus:'DIGEST_ONLY_NOT_WITNESSED'
   });
  }else if(event.type==='RESOLUTION'){
   const existing=pending.get(event.payload?.id);
   if(!existing||existing.settlementSeen)throw Error('Unpaired or repeated result event');
   existing.settlementSeen=true;
  }
 }
 const unpaired=[...pending.values()].filter(x=>!x.settlementSeen).length;
 const storagePersistent=exported.storageMode!=='VOLATILE_SERVER_SESSION';
 const caps=exported.capacity||null;
 return {
  mode:'CASH_AUDIT_PREFLIGHT_V1',
  generatedAt:new Date(now).toISOString(),
  storageMode:exported.storageMode,
  sessionBootAt:exported.bootAt,
  sessionHeadHash:exported.headHash,
  totalJournalEvents:exported.events.length,
  counts,
  unresolvedCaptureEvents:unpaired,
  capacity:caps,
  commitments:{
   total:eligible.length,
   listed:eligible.slice(-maxListed).reverse(),
   limit:maxListed
  },
  independentVerification:{
   state:'NOT_VALIDATED',
   qualifyingProspectiveContracts:0,
   requiredProspectiveContracts:100,
   timeWitnessConfigured:false,
   independentlyTimeAttestedCaptures:0,
   durableJournalConfirmed:false,
   settlementRulesIndependentlyAudited:false,
   realOrdersEnabled:false
  },
  blockers:[
   storagePersistent?'Filesystem journal exists but attached-volume persistence has not been independently tested':
    'No durable server-side storage is attached; session resets on redeploy',
   'No independent pre-expiry time witness; event hashes can be rewritten by the server operator',
   'Venue-specific contract targets and settlement-rule interpretation are not independently certified',
   'Experimental spot heuristic is not a calibrated venue-index forecasting model'
  ],
  note:'SHA-256 commitments are preparatory digests, not independent RFC3161 receipts or proof that forecasts preceded settlement. Nothing is sent externally.'
 };
}
module.exports={createAuditPreflight};
