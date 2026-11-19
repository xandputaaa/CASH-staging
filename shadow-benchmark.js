'use strict';
// Research-only deterministic benchmark. No market feeds, orders, or historical mutations.
function evaluateShadow(rows) {
  if (!Array.isArray(rows)) throw new TypeError('rows must be an array');
  const summary = new Map();
  for (const row of rows) {
    if (!row || typeof row.model !== 'string' || !row.model.trim()) throw new TypeError('model required');
    if (!Number.isFinite(row.predictedProbability) || row.predictedProbability < 0 || row.predictedProbability > 1) throw new TypeError('invalid probability');
    if (row.outcome !== 0 && row.outcome !== 1) throw new TypeError('settled binary outcome required');
    if (!Number.isSafeInteger(row.contractId?.length) || !row.contractId) throw new TypeError('contract identity required');
    if (!Number.isFinite(row.forecastAt) || !Number.isFinite(row.settledAt) || row.forecastAt >= row.settledAt) throw new TypeError('forecast must precede settlement');
    const key = row.model;
    const s = summary.get(key) || {model:key, contracts:new Set(), count:0, correct:0, brierSum:0};
    if (s.contracts.has(row.contractId)) throw new Error('duplicate contract within model');
    s.contracts.add(row.contractId);
    s.count++;
    s.correct += Number(Number(row.predictedProbability >= 0.5) === row.outcome);
    s.brierSum += (row.predictedProbability - row.outcome) ** 2;
    summary.set(key,s);
  }
  return [...summary.values()].sort((a,b)=>a.model.localeCompare(b.model)).map(s=>Object.freeze({
    model:s.model, independentContracts:s.count,
    directionalAccuracy:s.correct/s.count, meanBrier:s.brierSum/s.count,
    executionPnl:'NOT_MEASURED', qualification:'RESEARCH_ONLY'
  }));
}
module.exports={evaluateShadow};
