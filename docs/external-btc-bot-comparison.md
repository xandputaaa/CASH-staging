# External 15-minute BTC bot comparison (research only)

Reviewed publicly described implementations, **not verified performance rankings**:
- `oribarlevco-cell/kalshi-btc-15m-bot`: lognormal barrier baseline, quote/depth lifecycle, local paper records and Wilson intervals.
- `SiddhaBasu/kalshi-bot`: driftless GBM baseline, walk-forward XGBoost, calibration, train/serve feature parity and depth-weighted paper fills.
- `aaryann123/kalshi-bot`: large-scale historical experiments that report no demonstrated profitability; a reminder not to infer edge from hit rate.
- `BJW333/BTC_15Min_Trading`: multi-source LSTM/order-flow/cross-asset ideas, with no independent performance proof established here.
- Freqtrade lookahead-analysis: dedicated leakage checks.

KAREN reuse: prior KAREN experiments reportedly tested short-window momentum, volatility, strike distance and a late-checkpoint model. The historical performance claims are NOT independent validation. This change does **not** import KAREN model weights or code: the archived KAREN implementation must first be inventoried and compared for licensing, timestamp causality, market rules and data provenance.

## Safe incorporation in this PR
An isolated offline `research-lognormal-baseline.js` implements a driftless lognormal benchmark using a timestamp-checked spot/strike/volatility snapshot. It never generates CASH's frozen YES/NO/WAIT call, never changes existing forecast records, never makes trades and never enters the independent-qualification denominator. It has no live-data wiring or trading API.

## Next experiment (not implemented)
Compare the baseline and archived KAREN candidates **only on future independently witnessed contracts**, preserving each original CASH frozen forecast. For each eligible contract, freeze model version, inputs, timestamps and price/fee snapshots before expiry. Report WAIT coverage, Brier score, chronological holdout performance, Wilson intervals, and hypothetical orderbook-depth-weighted fee/slippage-aware paper P&L separately by model and venue. Reject missing inputs rather than backfilling after settlement. Do not train on holdout outcomes.

Sources:
- https://github.com/oribarlevco-cell/kalshi-btc-15m-bot
- https://github.com/SiddhaBasu/kalshi-bot
- https://github.com/aaryann123/kalshi-bot
- https://github.com/BJW333/BTC_15Min_Trading
- https://github.com/freqtrade/freqtrade/blob/develop/docs/commands/lookahead-analysis.md

## Verified KAREN source inspection (2026-11-19)

Read directly from `xandputaaa/Karen-v1`:
- `research/walkforward.mjs` exports `walkForward` and `evaluateHoldout`. The evaluator trains on earlier nonoverlapping settled contracts and freezes weights for a chronological test partition. **Limitation:** its evaluation consumes supplied historical price arrays and cannot itself prove those prices or predictions were independently visible before expiry.
- `research/prospective-diagnostics.mjs` computes one earliest eligible forecast per ticker, Brier score, confusion matrix, calibration bins, Wilson confidence intervals and base-rate comparisons. **Limitation:** it accepts event timestamps as input and does not independently witness publication.
- `research/paper-execution.mjs` models hypothetical YES/NO tickets, fee and extra-cost deductions, bankroll and $10 maximum-ticket loss, but explicitly marks fillability and settlement unverified.
- `KAREN_FINAL_V1_SPEC.md` is a feature acceptance plan, **not evidence that its sports, voice, projected-path, or market-data capabilities were deployed**.

CASH already contains `paired-model-benchmark.js`, `paper-execution-audit.js`, `prospective-scorecard.js`, `witnessed-paper-economics.js`, and independent observer/settlement modules. Compare their contracts and test coverage before porting KAREN implementations. Do not overwrite CASH's immutable records, import KAREN's historical scores as prospective evidence, or promote a model using a reused test set.

Original source links:
- https://github.com/xandputaaa/Karen-v1/blob/main/research/walkforward.mjs
- https://github.com/xandputaaa/Karen-v1/blob/main/research/prospective-diagnostics.mjs
- https://github.com/xandputaaa/Karen-v1/blob/main/research/paper-execution.mjs
- https://github.com/xandputaaa/Karen-v1/blob/main/KAREN_FINAL_V1_SPEC.md
