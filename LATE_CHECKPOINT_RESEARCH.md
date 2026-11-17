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
