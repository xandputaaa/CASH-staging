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


## Current-session coverage denominator — November 17, 2026

The reconciliation report now has a \`witnessCoverage\` section derived from the COMPLETE, verified public research journal export for **each frozen model in the current volatile Railway server session**. This closes a reporting blind spot: previous off-server hit rates listed only forecasts for which GitHub had successfully made an early observation. That is insufficient to measure external verification coverage, and it can accidentally create optimism if Github witnesses are only available for some calls.

For the early and late cohorts separately, the new section reports:

- All frozen markets, directional YES/NO forecasts, and WAITs, including unresolved calls.
- Public-proxy directional YES/NO denominator, separated from licensed BRTI records that cannot be posted in public observation artifacts.
- Distinct hash-matched, GitHub-runner pre-expiry directional witnesses, the number **without** a matched witness in currently retrieved GitHub artifacts, and corresponding WAIT coverage.
- Public market corroboration at observation time from the independent direct read-only Kalshi endpoint, and direct two-read final-result corroboration after expiry.
- Witnessed directional HITS, MISSES, and pending/rejected outcomes; these never erase or reclassify the unwitnessed subset.
- A descriptive \`observedDirectionalFractionOfPublicFrozen\` **coverage ratio**, not a probability of future prediction success, edge, win rate or trading readiness.

**Scope limitation:** This is a *bounded current-Railway-RAM-session versus recently downloaded GitHub observation artifacts* report. Existing GitHub automation enumerates at most 24 successful runs from the past 24 hours and artifacts expire after 30 days. Historic events missing from either source are NOT proof that a prediction never existed or a job never ran. The coverage counts are not a globally complete historical record; a Railway restart resets in-memory market journals. Never infer certified accuracy from the witnessed subset, and never relabel unobserved cases as wins or misses.

The artifact explicitly includes \`archivalCompletenessProven:false\`, \`independentlyQualifiedCount:0\`, \`actualFillsVerified:0\`, \`realOrdersEnabled:false\`, and \`calibrated:false\`. No model thresholds, fee forecasts, order routing, timestamps, live data or external accounts were changed. This is **GitHub-only** integrity reporting and does not require a Railway restart.


### Separate *correct forecast* from *economically favorable quoted hypothetical*

The witnessed-denominator report also includes \`witnessedCorrectPaperProfitableConservative\`, \`witnessedCorrectPaperNonpositiveConservative\`, \`witnessedPaperBreakEvenAtOrAbove100Pct\`, and \`witnessedScoredDirectionalWithoutPaperPrice\`. These values are derived only from the **original** hash-matched, pre-expiry frozen public ask and fee metadata and already-reconciled official final result. No future price, fills, order placement or user balance is used.

A real Nov 17/18 example illustrates why the extra fields matter. The three-minute NO forecast for \`KXBTC15M-26NOV172145-45\` was observed by GitHub at 02:41:55Z before the 02:45:00Z contract close, with active public Kalshi strike corroboration at that time, and later matched to Kalshi's final NO result via two direct after-close exchange reads. CASH's own frozen NO ask at 02:41:28Z was **$0.995**. A full $1 winning payout would generate only **$0.005 gross**. Under the published general fee approximation, centicent rounding produces a conditional **+$0.0046**, but conservatively assuming a one-cent taker fee produces **-$0.0050** net for the SAME correct call. The conservative assumed break-even success rate would be **100.5%**, impossible even for a perfect forecaster. The original trade's availability/liquidity/actual fees were never verified, and no actual order was placed.

The first separately GitHub-witnessed NO forecast (00:00Z contract) had frozen public NO ask $0.927 and conditional conservative one-contract win profit +$0.063. Combining the two hypothetical wins gives **+$0.058 conservative**, but these are **two unfilled paper scenarios**, not audited actual profits or a reliable EV estimate. Correct direction is never automatically labeled a tradable opportunity. All denominator counts remain scoped to the current volatile Railway research session plus the recent GH artifact set; independent qualification remains 0/100.


## GitHub witness-run pagination and honest coverage window

Previously the reconciliation job queried only the **first GitHub workflow-runs API page** and applied \`slice(0,24)\` to successful runs. At four scheduled observer attempts per hour (plus test/pull-request observer runs), that silently omitted witness artifacts from earlier in the **same day**, even when GitHub still retained them and the Railway journal had not restarted.

The reconciler now asks the GitHub Actions API for **all pages** of workflow runs created within the previous UTC calendar day and today, and locally filters to a rolling **exact last 24 hours**, including successful scheduled and test-run witnesses. The bounded \`witness-run-window.js\` helper retains up to **192** successful runs. It records the number of API pages, runs found, runs selected, the exact start/end of the observation-search window and whether the selection was truncated. If an earlier witness has expired, was not available, or lies outside this window, the system cannot assume it never existed.

The report's \`githubRunCrossCheck\` object now also states \`selectedRunsWithNoReadableWitnessArtifact\` and \`archivalCompletenessProven: false\`. Some successful observer runs legitimately produce *no* artifact when nothing is observed, while others may have download failures; this count cannot distinguish those causes and is NOT a false-negative forecast count. Partial GitHub artifact retrieval must never increase an independent qualification score or silently change an observed hit/miss denominator.

This widens evidence retrieval, **not** data capture. The 24h horizon and 30-day GitHub artifact expiry still prevent a complete long-term historical audit. Current RAM journals can be lost if Railway restarts. The GH-hosted reconciliation remains read-only, bounded to a nine-minute job, and does not add paid services, model changes, licensed BRTI inputs, trading or account permissions. Any reported directional witness coverage remains a time- and source-scoped descriptive count; it is not a validated prediction accuracy estimate.


## GitHub direct-market **witness-time** price and displayed-size audit

The off-server reconciliation now attaches \`witnessMarketQuote\` for each GitHub-hash-matched **late YES/NO** prediction with a separate public Kalshi active-market read. It shows the YES or NO *public ask and displayed ask size* at the GitHub runner's actual observation time—typically seconds or minutes **after** the CASH model froze its YES/NO direction. These are NOT the original frozen price, and they are not verified order-book executions. The original frozen ask continues to be the **only** quote used for the separately labeled one-contract hypothetical fee-and-payout calculation.

\`witnessMarketQuoteCoverage\` provides the number of externally witnessed late directional forecasts with an available public ask, how many have **missing displayed ask size**, how many publicly display at least one contract, how many show **under one contract**, how many have very expensive selected-side asks (>= $0.99), and when the later witness ask moved against the hypothetical buyer compared with the separately hash-locked original public ask. The strict states are \`WITNESS_ASK_SIZE_UNKNOWN\`, \`WITNESS_DISPLAYED_SIZE_BELOW_ONE_CONTRACT\`, \`WITNESS_DISPLAYED_SIZE_AT_LEAST_ONE_UNFILLED\`, plus unavailable/mismatched/time-rejected statuses.

Even a public displayed size >= one contract does **NOT** prove a person could buy it at that price: the exchange API may lag, the order book may have changed, a quote may be canceled, a different fee may apply, and no private order confirmation or fill was ever produced. A valid public ask plus size is evidence of a sampled public quote, **not** an executable live market order. Missing displayed size is neither a filled order nor automatic evidence that there was zero size. The GitHub witness quote cannot be used to retrospectively improve frozen-price paper outcomes; the reporting code retains separate \`witnessedPaper\` and always sets \`oneContractFillProven:false\`, \`executableLiquidityVerified:false\`, \`ordersEnabled:false\`, \`independentQualifiedCount:0\`.

This public-only GitHub workflow uses existing direct Kalshi REST snapshots, no new private API, paid provider or Railway service changes. It does not validate proprietary CF Benchmarks BRTI, future probability calibration or an ability to realize profits. It also cannot prove that original model features were generated honestly.
