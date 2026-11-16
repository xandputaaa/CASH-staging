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
