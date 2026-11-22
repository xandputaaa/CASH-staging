# CASH OS — current release gate (as of 2026-11-22 UTC)

> **The controlled three-deployment allowance has been fully used.** This is a private
> simulation / manual-analysis staging release, **not** a validated trading system.
> Do not initiate further Railway deployments, unpin the source SHA, migrate/delete
> the research volume, or enable real-money trading without separate user approval.

## Audited deployed release

- Project: `CASH — Simulation Staging`; environment: `staging`
- Service: `cash-simulation-web`, domain: `https://cash-simulation-web-staging.up.railway.app/`
- Verified live source: `xandputaaa/CASH-staging@6553304bcddf15b3648aa8ed735188b544124c18`
- Current deployment: `d136357a-74ed-4325-832d-c71fccd56e68` — `SUCCESS`
- Railway status after rollout: online, 1 running replica, 0 crashed, 0 reported unresolved warnings/critical issues; no pending configuration changes.
- The persistent `cash-shadow-audit` volume remains mounted at `/data`. Startup logged 600 old archived shadow events recovered as `FILESYSTEM_ARCHIVE_RECOVERED_UNVERIFIED`; *mounted and recovered do not mean externally certified, backed up, or independently validated*.
- Last new-deploy startup: browser login 7/7, HTTP startup paths 11/11. Kraken BTC spot, Kalshi public market, and Polymarket public market feeds were reported live at startup; these feeds can subsequently be partial, stale, or unavailable. Orders remained disabled.
- GitHub CI simulation tests passed on the final exact commit. The mobile UI code includes Market, Position, Assist, Lab, and System screens; actual iPhone Safari visual/interaction sign-off is **not** evidenced by HTTP smoke tests.
- The service reports **0/100 independently qualifying forecast results** and no calibrated profitable model. Counts of frozen journal entries, internal hit rates, historical backtests, and provisional GitHub witnesses are not qualified outcomes.

### Actual deployment consumption (3/3)

| # | Deployment ID | Git SHA | Outcome |
| --- | --- | --- | --- |
| 1 | `1d44b481-978d-4d7c-a6c3-7c2c5d9dcbbd` | `fd338b57f93f1312a9710bded51d4be3a098273a` | SUCCESS (replaced) |
| 2 | `efd1cefc-240c-40d7-8631-06dd5e779978` | `90138677ff63e0d20c9bfa6b2b04ece9042ef72d` | SUCCESS (replaced) |
| 3 | `d136357a-74ed-4325-832d-c71fccd56e68` | `6553304bcddf15b3648aa8ed735188b544124c18` | SUCCESS (live) |

All three updates applied to the existing staging service, not to an isolated canary.
Do not treat the successful smoke tests as a substitute for a tested backup,
full journal semantic integrity/recovery audit, or independent mobile-device QA.

## Late-checkpoint evidence persistence candidate (NOT deployed)

The late research scorecard is a separate model from early V3. In a *real
scheduled* November 22 research backup (run `44978875092`), the early model
had 302 freezes, all **302 WAIT**, 301 officially resolved and zero directional
calls. Thus early's 0 scored was **not** a settlement outage. The same backup
showed 154 frozen late decisions (62 directional, 92 WAIT), 62 directional
self-scored outcomes (59 HIT, 3 MISS), zero independently qualifying results.
These numbers are historical provisional research, not verified edge, realized
profitability, independently time-attested predictions, or a frozen holdout.

A source-level candidate now supports `CASH_LATE_DURABLE_RESEARCH=1` as an
explicit *future rollout* option, only with existing `CASH_AUDIT_DIR` and
`CASH_EXCLUSIVE_JOURNAL_WRITER=1`. **This flag must stay unset until the
operator separately approves deployment and an archive preflight.** When
enabled, the pre-existing tested late store reads its own hash-chained
`late-checkpoint-events.jsonl`, rejects invalid/truncated or duplicate
completed segments, and fsyncs accepted events. Existing pre-rollout
GitHub-only late forecasts are **not imported** or declared independently
witnessed. No automatic rotation, deletion, archival overwrite or limit
increase occurs. At the 160-frozen-market cap, new late forecasts remain
blocked until an explicitly authorized **offline** non-destructive rotation
and preflight; use `late-checkpoint-rotation.js` under its own instructions.
Do not try to clear, truncate or reset a corrupt file to force startup.

The separate prospective early journal has a 320-forecast cap. PR #214
increases bounded settlement reads to eight per 20-second scan but does not
increase capacity, modify the model, or fabricate directional calls. A
legitimate WAIT never enters a directional performance denominator.

## Outstanding acceptance gates

- [x] Live service online with fixed source SHA, healthy replica, no pending changes.
- [x] Signed Safari-friendly browser-login, stylesheet, JS, chart, and manual-calls route smoke passed 7/7.
- [x] Read-only app startup route validation passed 11/11.
- [x] $10 hypothetical maximum-loss guards, fee/quote staleness checks, and no-order posture covered by automated tests.
- [x] GitHub simulation tests passed on the deployed SHA.
- [ ] **Post-deploy real scheduled OIDC proof:** a newly created scheduled pre-expiry or shadow observer running the final deployed SHA must fetch its matching protected export without 401, record a valid off-server source observation or explicitly report no eligible contracts, and never acquire UI/order privileges. PR tests and old pre-deploy scheduled successes are insufficient. Separate `workflow_run` follow-ups should also be checked for genuine eligible scheduled-parent provenance.
- [ ] **Post-deploy real scheduled reconciliation proof:** a scheduled `CASH witnessed-settlement reconciliation` run on the final code successfully fetches both private settlement exports using ephemeral OIDC, emits the bounded provisional report, and no unauthorized source error. A green PR-only reconciliation run is not proof.
- [ ] **True evidence quality:** ≥100 prospective, independently qualified, chronologically held-out, correctly settled directional calls *per frozen model/venue, on distinct contracts* before discussing the original 85% accuracy gate; no mixing retrospective records, proxy versus official BRTI, WAITs, repeated polls, or same-contract cohorts. A numerical hit rate alone cannot establish economic profitability.
- [ ] **Executable economics:** fee freshness, tradeable quote depth, slippage, actual fill evidence (if trading is eventually approved), and calibrated net-EV verification. No automated orders without explicit separate authority.
- [ ] **Disaster-recovery review:** verify persistent journal semantics, continuity, archive capacity and a non-destructive usable backup/restore procedure. Merely observing a volume mount and a 600-event recovery log does not complete this.
- [ ] **iPhone Safari visual acceptance:** owner verifies logged-in dashboard, bottom navigation, chart responsive states, quote expiry, manual position entry, assists and sign-out on a real device.
- [ ] **Kalshi data terms / privacy:** independently review whether deployment, storage, retention, display and sharing comply with current terms; no broad distribution until approved.

## Next operational checkpoint (no new Railway deployment)

Read GitHub Actions' next actual `schedule` events for the two witness observers
and the settlement reconciliation workflow. Check the job logs for real authorized
source reads, evidence provenance, missing/denied quotes, record counts and zero
trade authority. Do not count successful jobs that actually saved only
`SOURCE_UNAVAILABLE` or `SOURCE_AUTHORIZATION_REJECTED` as verified collection.
If the next scheduled runs have not happened yet, keep these gates open; do not
invent future results or redeploy just to manufacture success.

---

## Historical 2026-11-20 release plan (superseded, preserved for audit only)

The following original checklist and three-deployment proposal predates the
completed rollout above. Its unchecked boxes are historical, **not**
authorization to restart a new three-deployment budget.

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
