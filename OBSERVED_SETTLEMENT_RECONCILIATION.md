# CASH — provisional GitHub witness-to-settlement reconciliation

## Purpose

CASH has two research-only frozen Kalshi BTC 15-minute models. The 3-minute model sometimes makes YES/NO calls; the early model often chooses WAIT. Internal event hashes and timestamps do not certify that a forecast was made before settlement.

This tool connects three **separate public artifacts** without claiming genuine independent validation:

1. A GitHub-hosted action observed the already-frozen forecast hash while the market was still open.
2. The running CASH staging service later produced unprivileged, self-hashed early/late research journals that include selected published Kalshi settlement evidence.
3. A separate GitHub-hosted reconciliation run reads the prior GitHub-run metadata, confirms the pre-expiry observation lies inside the platform's recorded workflow window, matches the original **exact forecast hash** against a later event chain, and recomputes the settlement evidence digest, published \`expiration_value\` versus \`floor_strike\`, contract expiry and official winner.

Each frozen model and Kalshi market pair is counted **at most once**. Same-market early and late predictions are not independent samples. WAITs, unverified/contradictory results, missing archival sessions, source failures and pre-expiry observations after market close never enter a directional hit-rate denominator. Verified directional misses are recorded as misses, not discarded. The report includes separate totals and Wilson intervals for early and late directional calls.

### Running and output

GitHub workflow: \`.github/workflows/observed-settlement-reconciliation.yml\`

Schedule: UTC minute 21 every 4 hours, after the existing minute-17 dual-journal snapshot (both are best effort). The workflow can also run on a pull request or via a GitHub Actions manual dispatch. It uses only public read-only CASH endpoints and GitHub's short-lived built-in **read-only actions token**, not Kalshi private read keys or user account tokens.

GitHub API lists recent successful pre-expiry observation workflow runs (last 24 hours, up to 24 runs). GitHub CLI downloads matching observation artifacts from the same repository. The CLI rejects malformed or missing artifacts and runner timestamps outside GitHub's recorded run window. A newly fetched public later journal is used for the outcome check; it does NOT restore or change the original Railway collector. If Railway restarted before retaining an old contract, the reconciliation conservatively emits \`FORECAST_COMMITMENT_NOT_RECONCILED\` or a missing-session blocker, never a false hit.

Output: a single 30-day-expiring artifact, \`provisional-reconciliation.json\`, with status per witness/model/market, separate early and late counts, informational descriptive Wilson intervals, and \`independentQualifiedCount: 0\`, \`ordersEnabled: false\`. No private licensed index numerical inputs, credentials, user positions or trading decisions are published.

### Critical limitations

This is **provisional external observation**, not cryptographically signed notarization or an independent audit of software honesty. The source service could have fabricated its public journal before capture; self-hashes merely establish consistency of the published record. Github-runner time can corroborate an observation but is not a trusted universal clock. The later settlement snapshot originates from the same external public Kalshi API feed via our service, not from an independently retrieved raw exchange record. GitHub artifacts expire, and schedules can be late/missed. Neither the earlier 20/20 exploratory pilot nor any current observations meet independent 100-contract qualification.

The comparison does **not** establish price availability, fills, market liquidity, slippage, profit, calibration or expected value. The separate read-only fee-aware hypothetical tool uses public asks captured by the late checkpoint only for *new* forecasts. Real money orders remain disabled and no paid services or volumes have been created.

Before any independent-validation count is nonzero, a researcher must corroborate the recorded GitHub run/artifact provenance, exchange settlement evidence and frozen original inputs separately, then implement an explicit audited acceptance policy. No app code is authorized to automatically unlock orders or quality gates.
