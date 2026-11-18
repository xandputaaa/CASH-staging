# CASH settlement research — fixed late checkpoint v1

## Frozen hypothesis (Nov 17, 2026)

The preserved **early V3** public-proxy research export captured nine pre-settlement records. One was a directional YES forecast; eight were WAITs, generally made with roughly 12–13 minutes remaining. This observation suggests researching **timing**, not assuming a model has predictive power. The past nine records do not count as out-of-sample validation for the new checkpoint.

### Separate predeclared experiment

- Model ID: `KXBTC15M_LATE_CHECKPOINT_SHADOW_V1`
- Market: Kalshi's KXBTC15M **15-minute** settlement YES/NO rule, based on its official starting strike and final 60-second benchmark average. Prices from public Kraken/Coinbase are only proxies, not BRTI.
- Freeze window: first complete, live, fresh, input-eligible snapshot when **150,000–210,000 milliseconds** remain before market close (2:30–3:30 minutes); never freeze more than once per market in this model.
- Direction: use the **unchanged** V3 rule (8 bp minimum basis buffer, 1.6 × realized volatility × sqrt(remaining seconds), 3+ minutes of past chronological source history). No price odds can determine the model's side.
- Abstention: WAIT when the gap is smaller than the guard band. Source failures and absent quotes cause **no frozen forecast**, never a synthetic WAIT or a guessed YES/NO.
- Freeze immutable `YES`, `NO` or `WAIT` before expiry. Keep the early V3 frozen record unchanged. Do not revise this specification after viewing late-checkpoint outcomes.
- Grade solely the original frozen side against finalized Kalshi public market outcomes, accepted only after two separated, matching source reads and semantic settlement evidence checks. WAITs, pending, missing, void, and abandoned markets stay separate from the directional hit/miss denominator.
- Keep official BRTI and public proxy model-source cohorts separate; if official data has been explicitly opted in but is offline, do **not** substitute a public proxy.
- Only claim **exploratory, self-timestamped** research. All model outputs remain uncalibrated, non-executable, untied to fill prices, zero independently verified /100, and `orders=DISABLED`.
- Retained in-process journal is **volatile**; backup via `/api/late-checkpoint/export` when deployed. A hash chain is not independent time attestation or a durable storage volume.

### Before further model changes

Evaluate prospectively on a **new chronological holdout** rather than adjusting the threshold on the same saved markets. Report, separately by model and source cohort: eligible windows, frozen attempts, YES/NO share, WAIT share, unobserved windows, expiry-to-settlement verification delays, independently witnessed sample size, scored hit/miss counts and uncertainty bands. If the late checkpoint predicts more often with lower accuracy, that is a failure rather than a win. Do not pool early and late forecasts to inflate sample size, or count multiple checkpoints on the same contract as independent trials.

A minimum of 100 independently witnessed prospective contracts per frozen model/venue must be resolved before discussing any accuracy gate; profitable trading additionally requires separate calibrated probabilities, actual price and fee-aware economic validation, execution and risk controls, and explicit authorization. No automatic ordering is implemented.


### Added paper-only price/fee observation protocol (Nov 17, 2026)

The prediction algorithm and its frozen direction remain unchanged. For **new** future late-checkpoint research, CASH additionally freezes the then-observed public YES and NO ask, the public quote observation time, and (only if fresh and verified) the official KXBTC15M series fee type and multiplier. It never substitutes later prices or retroactively applies economics to older records missing these inputs.

A separately labeled audit assumes an **unfilled hypothetical purchase of ONE contract at the observed ask**. It uses Kalshi's published general quadratic taker fee formula (\`0.07 × multiplier × contracts × P × (1−P)\`); reports a centicent-rounded estimated fee and an additional conservative cent-rounded sensitivity. General fee publication effective July 7, 2026: https://kalshi.com/docs/kalshi-fee-schedule.pdf . Current public series metadata is obtained read-only from Kalshi; member-specific overrides, fee schedule changes, liquidity, slippage, price changes between observation and fill, account records, real order placement, and actual transaction costs are **not verified**.

The audit does not produce calibrated probabilities, statistical expected value or an instruction to trade. It must show how many directional calls were **unpriced** (missing real pre-close ask or verified fee metadata), pending, void, WAIT or resolved. It cannot count unobserved prices as free fills, cannot count an unmatched market as a win, and cannot use any score from the earlier archived 20/20 pilot as a fee-tested economic result. This is an observational supplement, not a new model threshold or a validation gate.


## Volatile journal durability and no-cost backup frequency (November 17, 2026)

CASH's deployed research service currently has **no persistent Railway volume**. The late research monitor defaults to **160 frozen markets per in-memory journal**, after which it reports \`LATE_JOURNAL_FULL\` instead of generating further snapshots until an authorized reset or carefully reviewed persistence upgrade. This default can be constructor-overridden in future revisions; the GitHub backup job only estimates remaining slots from the source default and must not present this as a definitive live setting.

The existing GitHub Actions public-only hashed research snapshot job now schedules **twice every hour, at UTC minute :17 and :47**, rather than every four hours. It stores a SHA-256-checked **early and late** journal export in an expiring 30-day GitHub artifact. The job exposes \`CASH_LATE_BACKUP_DEFAULT_REMAINING\` and \`CASH_LATE_BACKUP_DEFAULT_CAPACITY_STATUS\`, warning when at or below 32 estimated slots (~eight hours at four contracts/hour). At the time of this change the service had far more headroom and was not restarted.

This is best-effort, **not** a durable database or an independent preclose timestamp. Github cron can be delayed or skipped, public backups can be lost when their 30-day artifacts expire, and service restarts can drop any events since the last successful archive. The backup frequency reduces but does not eliminate prospective research data loss. Results from separate server boot sessions must be kept distinct unless a properly reviewed external continuity protocol reconciles them; never silently merge or recalculate the experimental hit-rate.

This modification is GitHub-only. It does not change the frozen prediction formula, Kalshi private read credentials, CF BRTI licensing, quote economics, source integrity, order permissions or the 0/100 independent validation gate. Standard Linux GitHub Actions on a public repository are ordinarily free, but if repository visibility or billing rules change the schedule should be reassessed before incurring charges.
