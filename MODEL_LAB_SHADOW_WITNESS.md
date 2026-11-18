# CASH Model Lab: public shadow observation (research only)

## Evidence boundaries

The Model Lab shadow momentum candidate is **not calibrated**. Its public spot input is **not** the Kalshi BRTI reference, and neither the shadow journal hash chain nor the source-side forecast timestamp proves an independent prediction timestamp.

The service exposes an isolated GET /api/model-lab/shadow/export only when an existing absolute audit directory (CASH_AUDIT_DIR) is mounted. Without durable storage this returns HTTP 503 and shadow collection remains OFF. GET /api/model-lab/shadow/status always publishes safe high-level diagnostics.

When enabled, the service appends **one** shadow forecast per exact KXBTC15M contract ID, after verifying a public Kalshi target, contract rules, fresh single-source Kraken/Coinbase history, and a 90-to-780-second horizon. The new hash-chain snapshot is fsynced to the audit volume **before** the public API makes it visible. A corrupt prior snapshot blocks startup instead of resetting history. The existing early/late models and settlement archives are unchanged.

## Separate GitHub runner capture

The GitHub workflow at .github/workflows/shadow-public-observer.yml runs on the default branch with a 5-minute requested schedule (not a guaranteed exact cadence). Its runner fetches the full public snapshot, checks the entire chain, and **then** records its independent runner time. It only retains records more than 15 seconds before the advertised close. GitHub Actions can be delayed; empty observations must never become qualified forecasts.

Each run uploads a 90-day artifact, even if the source is down, and adds eligible pre-expiry source-claim observations to the separate public cash-shadow-public-witness Git branch, one immutable file per Actions run. The branch is distinct from existing research/archive/settlement branches.

Public witnessing attests only that GitHub's runner observed the claimed commitment before expiry. It does not establish model inference time, source truth, BRTI settlement, contract completeness, calibrated performance, actual fills, or real-money eligibility. The independent qualification count is always zero and real-money orders remain disabled.

## Staging rollout and checks

1. Review all PR CI, including witnessed-settlement reconciliation.
2. Mount persistent Railway storage at /data on the existing CASH service and set CASH_AUDIT_DIR=/data in the same environment. This may incur Railway volume charges.
3. Deploy the merged GitHub main branch to the existing staging service.
4. Check /health, /api/model-lab/shadow/status, then the export. A valid, empty journal is initially expected. If the status shows unverified contract or insufficient history, do not invent forecasts.
5. Inspect the first scheduled GitHub witness artifact. Confirm source hash, runner observation time, actual eligible count, and zero qualification. Check the public branch for an appended record only if observed records exist.

No exchange orders or promotion to frozen CASH predictions are part of this change. Live model edge requires a separate, independently settled, chronological holdout experiment and explicit approval for any trading action.
