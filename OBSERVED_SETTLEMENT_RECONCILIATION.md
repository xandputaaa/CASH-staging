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


### Witness-matched conditional purchase economics (November 17 addition)

The 3-minute model captures the public Kalshi YES and NO ask **together with** its frozen side, quote timestamp and cached KXBTC15M series fee multiplier. The reconciliation now computes a one-contract counterfactual **only** after an external GitHub-runner pre-expiry observation matches the exact immutable FORECAST event hash and after the final public numeric settlement fields pass consistency checks. The price used is read **from that exact forecast event**; no later quote is substituted. Any missing or stale bid/ask timestamp or series fee data yields \`UNPRICED\` with null profit, not a free or profitable trade.

Example: a hypothetical NO purchase at a public ask of \`$0.927\` costs \$0.927 before fees. At a fee multiplier of 1, the general quadratic taker formula gives about \$0.0048 after centicent rounding; a conservative cent-rounding sensitivity assumes \$0.01. A NO win would net roughly \`$0.0630–$0.0682\` per contract under these hypothetical **unfilled** assumptions. A NO loss would cost roughly \`$0.9318–$0.9370\` including fees. At the conservative assumed cost of \$0.937, a calibrated win probability would need to exceed 93.7% merely to have positive *theoretical* expected value before slippage and liquidity constraints. CASH does not currently have such calibrated probabilities, and none of these figures are trading recommendations or evidence of actual fillability.

Model hit rates and counterfactual economics must remain distinct. Older unwitnessed 20/20 archived observations are excluded from the witnessed economic denominator, even if their settlement winners can be rechecked. Only a completed reported \`WITNESSED_QUOTED_COUNTERFACTUAL_ONLY\` contributes to the grouped conditional value totals. The report still explicitly sets \`profitVerified=false\`, \`ordersEnabled=false\`, \`independentQualifiedCount=0\` and contains no automatic order-approval logic.


## Additional off-server Kalshi final-result audit — November 17, 2026

The GitHub-only reconciler now adds a **second-source post-expiry read**. It is deliberately *separate* from CASH's server-provided settlement events: after an externally witnessed forecast is hash-matched to a reported HIT/MISS, the GitHub runner makes up to 12 unique read-only public GET requests **directly to Kalshi**. It independently checks market ID, exact close time, final status, nonprovisional result, published floor strike, final \`expiration_value\`, strike comparison, and that the direct result agrees with the earlier reported final winner. A second GET of the same market is made at least 20 seconds later; only identical selected public market snapshots receive the \`DIRECT_FINAL_TWO_READ\` labels.

A matching public market snapshot digest is stronger than merely comparing a YES/NO label. If the numeric result agrees but other selected public API fields differ from the older server journal, report \`DIRECT_FINAL_TWO_READ_NUMERIC_MATCH_FIELDS_DIFFER\` rather than silently claiming the snapshots are identical. If the direct official result conflicts with the saved journal, the market closes at a different time, the number fields are missing, two reads differ, the direct API is unreachable, the audit is too early, or a second result was not observed at least 20 seconds later, **do not** treat that observation as second-source corroborated.

When the *same* market is in both early and late models, one direct read pair may be reused to limit traffic, but every model's own published winner, expiration timestamp and snapshot digest must independently agree. Missing or skipped checks remain in the denominator as unconfirmed instead of being assumed valid. A 12-unique-market cap prevents heavy public API polling in a single GitHub workflow; the latest markets are checked first and older unverified observations remain explicitly unchecked.

The added \`secondSourceFinalAudit\` report tabulates source corroboration separately from the unmodified \`groups.early\` and \`groups.late\` descriptive scores, original pre-expiry witnesses, and quoted-but-unfilled fee sensitivity. **No forecast is removed, no hit or miss is reclassified, no expected value is calibrated, and independent qualification stays 0/100.**

Two reads from the same exchange endpoint can share an API cache and are not two independent data providers. Direct Kalshi public prices and the exchange's reported expiration benchmark are not independent verification of the proprietary CF Benchmarks calculation or its original minute history; source fields and GitHub timing are not cryptographically signed evidence. No user balance, Kalshi private key, trade endpoint, bank data, paid integration, or Railway collector change is needed.
