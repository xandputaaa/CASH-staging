# CASH Shadow Audit Storage — Staging

CASH's read-only **SHADOW BASELINE** monitor observes venue price-favored sides. It does not produce independent AI forecasts, place orders, prove profits, or contribute to the 100-contract prospective model evaluation.

## Current configuration

The existing CASH staging service has **no mounted persistent volume** and no `CASH_AUDIT_DIR` environment variable. Its shadow observations therefore remain `VOLATILE_SERVER_SESSION`: they disappear on service restarts and deployments. Browser-stored paper history is separate.

The application now supports an **opt-in local filesystem journal**. This feature is code only until a storage mount is deliberately connected. No new paid service or Railway volume has been provisioned.

## To enable persistent file storage later (requires cost review and explicit approval)

1. Attach a persistent Railway volume to the CASH staging service at a **mounted directory**, for example `/data`. Confirm volume price and quota before creation. Use one service replica and preserve the existing CASH-only staging project.
2. Set the service environment variable `CASH_AUDIT_DIR=/data` (the directory must already exist and be a valid mount).
3. Redeploy and confirm the logs and `GET /health` show `FILESYSTEM_JOURNAL_UNVERIFIED`. Do not call it fully durable yet.
4. Observe one new `CAPTURE` event, export `GET /api/shadow/export`, restart the **same service with the same volume**, and verify the exact event count and `headHash` were recovered.
5. Confirm that invalid or truncated journals prevent startup instead of silently resetting. Test backup recovery and access controls before calling the audit operational.

Events are stored in `/data/shadow-events.jsonl` when configured, appended in sequence, SHA-256 chained, and flushed with `fsync` before memory state changes. On startup, the file is parsed, verified, and replayed. Malformed chain links, missing mounts, incomplete JSONL records, and semantic inconsistencies fail closed. Event count is capped at 650; the application will stop appending at capacity rather than discard old evidence.

**Limitations:** a hash chain can be rewritten by an attacker with filesystem access; it is not digital signing, independent time attestation, a write-once store, or proof that a quote preceded settlement. A single filesystem volume also is not an offsite backup and does not establish uptime or correct market rule interpretation. Database/backup/attestation design and external validation remain required.

## Verification checks

- `GET /health`: inspect `shadowStorage` and `qualifyingForecasts`.
- `GET /api/shadow`: inspect `storageMode`, `recoveredEvents`, `recordedEvents`, `headHash`, `pending`, `settled`.
- `GET /api/shadow/export`: download events and checksum-chain warning.
- `npm test`: runs automated pre-start tests. This does not replace a live Railway restart-and-recovery exercise.
- Confirm the Railway mounted volume in the service description before making any persistence claim.

## Accuracy gate

`qualifyingProspectiveContracts=0` remains hardcoded by design. Market-quote baseline observations and browser paper trades cannot qualify for the 100 chronological, officially settled, genuinely prospective **independent-model** forecasts. Real-money orders remain disabled; existing KAREN is not modified.

## Browser JSON recovery (not server durability)

On the CASH staging site, **Download browser archive** saves device-local session copies. **Restore JSON backup** can merge the download into another browser; it also accepts a direct `GET /api/shadow/export` file. Every incoming chain and existing local chain is checked for SHA-256 consistency before any write. Conflicting histories and insufficient capacity fail closed. An older snapshot cannot replace a newer saved session. The import is entirely local to the browser, never uploads an archive to CASH, and never qualifies for the 100-contract gate. The server cannot recover its own session history from a browser backup; missed history while the page was closed remains missing. Browser backups are not independently time-attested or tamper-proof.

## Read-only archived history review

CASH can now summarize downloaded or restored browser sessions by captured events, unique market IDs, outcome events present in the copies, overlap across sessions, and conflicts. **No outcome in a saved copy is a qualified independent model forecast.** In particular, `withoutResolutionInCopies` describes what is **missing from the archive copy**—it does not mean an official market remains unsettled or prove data loss at the venue. The review cannot infer unobserved markets, offline periods, or unrecorded contracts. Duplicate captured market IDs across restarts are flagged instead of counted as separate model forecasts. This is a read-only consistency report; SHA-256 checksums do not authenticate evidence or timestamps.

## In-process scanner continuity (not durable coverage proof)

CASH records a capped 30-scan rolling diagnostic history with each venue’s eligibility status, completed scans, last scan duration, overlapping calls, and gaps longer than 45 seconds between completed scans. A completed polling loop is **not** the same as receiving a full fresh market quote. In the CASH Diagnostics panel, `NO ELIGIBLE QUOTES` or `DEGRADED` may appear even when the process monitor is ACTIVE. These counters reset at restart and do not reconstruct missed contracts, external timestamps, full uptime, or qualified forecasts. The scanner cannot prove no gaps between server sessions.

## Experimental spot source windows and non-call visibility

New spot-momentum candidates include a source-only chronological sample window (Kraken or Coinbase BTC/USD). Journal replay can recalculate the exact reference and latest price, movement threshold, and directional proposal from those saved values, rejecting inconsistent sampled candidates. The dashboard also counts missing/stale/mixed/flat input checks instead of treating every unproduced candidate as an error or win. Older candidate records without a sampled window are labeled legacy in the snapshot. Exchange sample content and server timestamps remain **self-reported, not independently authenticated**. The candidate is not a venue-index forecast, the current benchmark is uncalibrated, and none of this meets the 100-contract verification gate.

The source window also has a SHA-256 fingerprint stored with each new candidate. Replacing one intermediate sample without updating that fingerprint now fails semantic replay checks. A malicious party with full file-write access can recalculate that fingerprint and the journal chain, so **these checks are consistency controls rather than external proof**.

## Retrospective experimental evaluation (never the qualification gate)

A new read-only `GET /api/evaluation` endpoint summarizes the spot-only heuristic across the **full current server session** rather than only the 15 most recent visible records. It separates candidates with verifiable-for-consistency sample windows, legacy records without source windows, invalid candidates, pending pre-expiry cases, unresolved and overdue outcomes, voids, and observations missing two-check public settlement evidence. Only sample-backed candidates paired with internally checked public settlement evidence contribute to the descriptive per-venue hits/misses denominator. The naïve Wilson 95% interval reflects finite-sample uncertainty alone and cannot correct nonrandom missingness, market dependence, or feed discrepancies. No independent timestamp attestation or durable server storage exists, so the 100-contract validation gate remains **0**. This endpoint never calls public feeds or accepts uploaded records, and no trading actions are enabled.

## Proof-input digest preflight and event capacity reservation

Railway inventory (Nov 16, 2026) confirmed no volume, bucket or `CASH_AUDIT_DIR` attached. CASH exposes a read-only `GET /api/audit-preflight` listing SHA-256 commitments for sample-backed spot candidates within its active server session. The commitment covers each existing chained capture event, so a later approved independent timestamp service could witness the hash **before contract expiry**. There is currently **no witness configured** and no independent pre-expiry receipts: the digest alone does not establish when the data existed or that the exchange supplied it. This endpoint makes no external requests, stores nothing new, and reports zero independently qualifying contracts. A separate source-of-truth settlement-rule audit is still required.

The monitor now reserves one potential settlement event for every pending contract when assessing remaining safe capture capacity. It blocks additional captures before the finite audit event limit can consume reserved settlement space. CASH Diagnostics shows `CAPTURE BLOCKED` or `NEAR LIMIT`; full scans can continue without new captures and must not be mistaken for collection. Export the session when the capacity warning appears. Only durable, independently audited storage with explicit approval can solve the eventual retention problem; manual export alone cannot.
