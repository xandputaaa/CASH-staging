# CASH controlled release gate — maximum three deployments

This is a release procedure, not evidence of validated predictions or authorization for automated orders.

## Verified baseline (2026-11-20)
- The Railway staging service was last deployed from commit `cd3741457c6767096a37c70b8c1ada489ececa29` (PR #85). GitHub merges do not automatically deploy.
- Railway has `CASH_AUDIT_DIR` and a persistent volume. `CASH_EXCLUSIVE_JOURNAL_WRITER` and `CASH_ARCHIVE_DIR` are not currently listed in staging variables.
- `server.js` constructs `createAuditJournal` and `createShadowMonitor` directly. It does **not** use the offline archive recovery factory.
- `createAuditJournal` intentionally refuses startup if an archive manifest is present. Do not bypass this guard.
- `createOfflineRecoveredMonitor` is read-only and returns a snapshot, not a writable live monitor.

## Pre-deployment checks (no Railway deployment consumed)
- [ ] All GitHub CI checks green on the exact candidate SHA, including simulation tests.
- [ ] Reconcile existing persistent journal, archive directory, manifest presence, and any stale lease; preserve a backup before changes. Never delete an unknown lock or archive to force startup.
- [ ] Confirm all startup participants share the same cooperative lease and recovery is complete before any monitor can append. If not implemented, **block live archive startup**.
- [ ] Run local route-level startup smoke for `/`, `/health`, and `/api/live-check`; confirm real orders disabled and qualification counts not fabricated.
- [ ] Review Kalshi Developer Agreement for permitted API data storage, display and sharing. Do not broaden public distribution of stored Kalshi data without appropriate authorization.
- [ ] Review secret exposure, endpoint access control, data retention, rate limiting, and error logging against OWASP ASVS.
- [ ] Verify no exchange order placement is reachable through public or private routes.
- [ ] Verify fee freshness, quote staleness, settlement rule, and $10 hypothetical max-loss blockers.

## Deployment budget
**At most three new Railway deployments from this point**, not three attempts per environment.
1. Candidate deploy to an isolated service/environment with a separate, empty or safely cloned audit volume. Smoke-test and observe live feed behavior. Stop and roll back if health or data integrity fails.
2. Only after candidate passes, deploy the validated commit to the intended staging service, with a verified backup and compatible archive startup. Stop on any integrity failure.
3. Reserved solely for a verified critical fix or rollback. Do not spend it on cosmetic tweaks.

Before every deployment record the exact Git SHA, target service/environment, journal state, smoke result, and deployment ID. A GitHub merge alone does not consume a deployment.

## Release posture
Research and manual information only. No automated orders. Do not claim 85%/90% accuracy or independent settlement validation without the specified prospective evidence. Do not claim an offline journal hash is an external timestamp attestation.
