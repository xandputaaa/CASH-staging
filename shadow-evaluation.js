'use strict';
/*
 * Descriptive, leakage-conscious retrospective evaluation of CASH's
 * experimental spot-only candidate, NOT independent trading validation.
 * No network calls, no external clock proof and no new forecast creation.
 * Outcome validation is provided by the existing public-result checker.
 */
const {isValidSpotCandidate}=require('./spot-momentum');
const {checkKalshiSettlement}=require('./kalshi-settlement-check');
const VENUES=['Kalshi','Polymarket'];
const MATCH={Kalshi:['YES','NO'],Polymarket:['UP','DOWN']};
function wilson95(hits,total){
 if(!total)return null;
 const z=1.959963984540054, p=hits/total, z2=z*z;
 const denominator=1+z2/total;
 const center=(p+z2/(2*total))/denominator;
 const radius=z*Math.sqrt((p*(1-p)+z2/(4*total))/total)/denominator;
 return {lower:Math.max(0,center-radius),upper:Math.min(1,center+radius)};
}
function blank(){
 return {captured:0,withoutCandidate:0,candidates:0,sampleBacked:0,
  legacyWithoutWindow:0,invalidCandidate:0,
  awaitingExpiry:0,unresolvedAfterExpiry:0,overdueWithoutOutcome:0,
  voided:0,missingSettlementEvidence:0,scored:0,hits:0,misses:0,
  kalshiNumericChecked:0,kalshiNumericMissing:0};
}
function combine(items){
 const out=blank();
 for(const item of items)for(const key of Object.keys(out))out[key]+=item[key];
 const accuracy=out.scored?out.hits/out.scored:null;
 return {...out,hitRate:accuracy,wilson95:wilson95(out.hits,out.scored),
  resultCoverage:out.sampleBacked?out.scored/out.sampleBacked:null};
}
function evaluateShadowRecords(records,{now=Date.now(),graceMs=600000,
  verifyOutcome=()=>false}={}){
 if(!Array.isArray(records)||!Number.isFinite(now)||
  !Number.isFinite(graceMs)||graceMs<0||typeof verifyOutcome!=='function')
  throw Error('Invalid evaluation input');
 const venues={Kalshi:blank(),Polymarket:blank()},seen=new Set();
 let duplicates=0,invalidIdentity=0;
 for(const record of records){
  if(!record||!VENUES.includes(record.venue)||
    typeof record.marketId!=='string'||
    record.id!==record.venue+':'+record.marketId){
   invalidIdentity++;continue;
  }
  const key=record.venue+':'+record.marketId;
  if(seen.has(key)){duplicates++;continue}
  seen.add(key);
  const group=venues[record.venue];group.captured++;
  const candidate=record.spotCandidate;
  if(!candidate){group.withoutCandidate++;continue}
  group.candidates++;
  if(!Array.isArray(candidate.sampleWindow)||
    typeof candidate.sampleWindowSha256!=='string'){
   group.legacyWithoutWindow++;continue;
  }
  const captured=Date.parse(record.serverCapturedAt),
   expiry=Date.parse(record.endTime);
  if(!Number.isFinite(captured)||!Number.isFinite(expiry)||
    expiry-captured<60000||
    !isValidSpotCandidate(candidate,record.venue,captured)){
   group.invalidCandidate++;continue;
  }
  group.sampleBacked++;
  if(record.status==='PENDING'){
   if(expiry>now)group.awaitingExpiry++;
   else{
    group.unresolvedAfterExpiry++;
    if(now-expiry>graceMs)group.overdueWithoutOutcome++;
   }
   continue;
  }
  const outcome=record.outcomeEvidence;
  const winner=record.winner;
  const allowed=MATCH[record.venue];
  const result={
   venue:record.venue,marketId:record.marketId,slug:record.slug,
   winner,checkedAt:record.outcomeCheckedAt,
   source:record.outcomeSource,
   confirmationCount:outcome?.confirmationCount,
   firstObservedAt:outcome?.firstObservedAt,
   evidenceSha256:outcome?.evidenceSha256,
   evidenceSourceUrl:outcome?.evidenceSourceUrl,
   evidenceSnapshot:outcome?.evidenceSnapshot
  };
  const consistentStatus=record.status==='VOID'?winner==='VOID':
    (record.status==='CORRECT'||record.status==='INCORRECT')&&
    allowed.includes(winner)&&
    (record.status==='CORRECT')===(record.baselineSide===winner);
  let valid=false;
  try{valid=Boolean(consistentStatus&&verifyOutcome(result,record))}catch{}
  if(!valid){group.missingSettlementEvidence++;continue}
  if(winner==='VOID'){group.voided++;continue}
  if(record.venue==='Kalshi'){
   const state=checkKalshiSettlement(outcome?.evidenceSnapshot).state;
   if(state==='NUMERIC_MATCH')group.kalshiNumericChecked++;
   else group.kalshiNumericMissing++;
  }
  group.scored++;
  if(candidate.predictedContractSide===winner)group.hits++;
  else group.misses++;
 }
 const perVenue=Object.fromEntries(VENUES.map(x=>[x,combine([venues[x]])]));
 const total=combine(VENUES.map(x=>venues[x]));
 return {
  report:'CASH_EXPERIMENTAL_SPOT_EVALUATION_V1',
  evaluatedAt:new Date(now).toISOString(),
  mode:'DESCRIPTIVE_SESSION_ONLY',
  evaluationState:total.scored>=30?'EXPLORATORY_ONLY':'INSUFFICIENT_RESOLVED_EVIDENCE',
  sampleSizeMinimumForExploratoryDisplay:30,
  total,venues:perVenue,
  duplicates,invalidIdentity,
  qualification:{state:'NOT_VALIDATED',
   prospectiveIndependentAttested:0,required:100,
   independentTimeAttestation:false,permanentStorageVerified:false,
   officialSettlementRuleAuditComplete:false,realOrdersEnabled:false},
  warnings:[
   'Candidate is an uncalibrated single-exchange spot heuristic, not a venue settlement-index model.',
   'Only sample-window-backed observations paired with two-check public result evidence enter the exploratory scored denominator.',
   'Pending, overdue, void, legacy and unverified outcomes are excluded from accuracy but counted separately.',
   'Wilson intervals describe sampling variation only; they do not correct selection bias, market dependence, or missing outcomes.',
   'All capture timestamps and feeds remain self-reported; no independent time attestation or durable audit exists.'
  ]
 };
}
module.exports={evaluateShadowRecords,wilson95};
