# CASH BTC15 accuracy and evidence gate — November 23, 2026

**Status: research only.** This branch adds a NO-GO evidence digest to the existing scheduled public witness/reconciliation workflow. It does not modify an on-server model, reconfigure Railway, place orders, use account keys or enable trading.

## Current direct operational observation

Read-only Railway deploy log inspection (existing `cash-simulation-web`, `staging`, November 23, 2026, approx. 14:45 UTC):

| Distinct system | Live observed state | Scope |
|---|---|---|
| Early KXBTC15M V3 | `JOURNAL_CAPACITY_REACHED`, 320/320 frozen, 0 scored directional, 0/100 independently qualified | **Blocked for new frozen early records**. Do NOT delete, restart, reset or raise cap without backed-up quiesced preflight and separate approval |
| Late KXBTC15M shadow V1 | 136 frozen, 55 directional, 81 WAIT, 55 self-scored directional, 0/100 independently qualified | **Experimental only**. The runtime logs did not report external witness count, hit count, calibrated EV or real fills |
| Separate early 45-second spot momentum research | 240 frozen, 90 directional, 39 hits, 51 misses | Different short-horizon market study; **NOT** the 15-minute early V3 model and cannot be pooled with it |

The public evidence ledger ref `cash-public-evidence-ledger@a975bf5c2cf339fa4d82a599291d670640aebea0` contains 124 sanitized JSON files (64 early, 60 late) as of its 2026-11-23 13:50 UTC commit. **File counts are not model calls, independently qualified predictions, wins, trades or a complete chronological denominator.** No account credentials or licensed BRTI history were inspected.

## New evidence digest

`btc15-evidence-gate.js` accepts ONLY the already-generated `CASH_PROVISIONAL_EXTERNAL_WITNESS_RECONCILIATION_V1` JSON and outputs `CASH_BTC15_EVIDENCE_GATE_V1`:

- Frozen public-proxy directional and WAIT denominators **separately for early and late**.
- Exact hash-matched external pre-expiry witnessed directional count and source-only unobserved directional count.
- Directly rechecked public Kalshi final outcome count, accepted provisional source-scored hits/misses and unscored witness count.
- Original-frozen-quote **counterfactual only** prices versus unpriced rows. No later quote backfill or actual fill claims.
- Code-default bounded research journal capacity advisory, with `liveCapacityVerified:false`.
- Explicit GO/NO-GO: `NO_GO_REAL_MONEY`, qualification 0/100, uncalibrated probabilities, no guaranteed profitable edge, no order rights.

## Execution

After a successful scheduled reconciliation creates its original report, the workflow computes an additional small `audit/report/btc15-evidence-gate.json` using the existing files, before uploading both reports to the current 30-day GitHub artifact. No new network requests or scheduled jobs are added. The digest step is nonblocking: if malformed/source-incomplete evidence prevents a valid digest, the original reconciliation report is still retained. A failed digest is never a passed accuracy gate.

PR tests use synthetic data to reject forged calibration, fake fills, inflated denominators and a falsely promoted 100/100 observational sample. The digest is NOT independent certification and intentionally cannot authorize execution.

## Remaining acceptance blockers before any accuracy claim

1. Maintain an immutable, independently witnessed, **future chronological** model/venue holdout of at least 100 uniquely settled directional contracts. WAIT, absent source, pending, void and unobserved contracts cannot be counted as wins.
2. Independent confirmation of the forecast freeze-before-expiry origin, the current Kalshi KXBTC15M market terms and source model inputs, and two-read direct public settlement; ideally authenticated benchmark provenance, not simply two requests to the same cache.
3. Report ALL eligible/frozen calls and the rate of missing witnesses; no selecting only winning examples.
4. Test the model frozen in advance and hold source cohorts separate (licensed BRTI vs single-exchange spot proxy; early vs late; KXBTC15M vs 45s spot).
5. Require genuine pre-entry, fillable order-book quotes, series and account fee schedule, actual spread, slippage and net profit analysis before any economic edge claim.
6. Verify backups and journal continuity. The full early journal and approaching-late journal must not be reset or rotated automatically.
7. A new explicitly approved Railway deployment and real iPhone/web QA are needed before integrating any new UI or runtime code; an evidence-only GitHub PR does not authorize it.

**No deployment, journal rollover, credential alteration, brokerage action, or model parameter change was performed in this evidence-only branch.**
