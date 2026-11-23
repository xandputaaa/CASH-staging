# CASH Signal Lab — gated release and acceptance checklist

Status: **code-review candidate only**; PR #219; do not merge, deploy or change active Railway services from this checklist.

## What the reference-video feature actually does

- Renders **recorded Kraken BTC/USD closed 1-minute candlesticks**.
- Displays historical BUY/SELL markers from EMA 9/21 crossovers filtered using Wilder RSI 14; these are research annotations, not investment instructions or verified predictive trading calls.
- Shows current spot technical bias, observed EMA values, RSI, candle count and data timestamps.
- Preserves the existing **Kalshi BTC 15m BRTI-target decision engine** and the explicit no-execution policy. A Kraken spot crossover does not establish Kalshi settlement probability, fee-adjusted EV, fillability, or a profitable market edge.

## Verification already available

- GitHub simulation suite (Node 22) exercises Signal Lab calculations, historical chart rendering through a DOM simulation, stale/invalid-data clearing, authentication of new static assets, and expanded startup smoke checks.
- No screenshots or physical iPhone Safari sign-off are present. A synthetic DOM test is **not** a real browser rendering test.
- No extra Railway rollout is authorized by the earlier three-deployment allowance.

## Before requesting a staging rollout

- [ ] On the exact final PR commit, record the successful GitHub Actions run ID and total passing tests.
- [ ] Verify PR branch has no conflicts with staging main and no unrelated edits.
- [ ] Verify changes to browser bundles and server routes are source-only, and that the app's existing private-access gate still runs before static-asset delivery.
- [ ] Keep all automatic order placement disabled and the model qualification count unchanged.
- [ ] Obtain **specific new approval for a fourth staging deployment**, as CASH-RELEASE-GATE.md states the original 3/3 deployment allowance is exhausted.
- [ ] Preserve the current staged source commit, Railway configuration and volume details for rollback. Do not migrate/reset/delete the audit volume, change keys, or toggle any experimental durable-journal setting.
- [ ] If approval is not given, leave PR #219 unmerged and do not alter the running service.

## Real-browser acceptance after separately approved deployment

- [ ] **iPhone Safari**: private login, return navigation, chart loading, no clipped elements at 375–430px, card order, bottom dock accessibility, sign-out.
- [ ] **Desktop Chromium/Safari**: column alignment, complete candlesticks with clearly readable marker labels, no horizontal overflow.
- [ ] Test 30+ valid closed consecutive Kraken candles. Verify correct real-source timestamps, prices, EMA 9/21, RSI 14, and historical marker placement.
- [ ] Toggle markers off/on; the underlying verified candles should stay visible.
- [ ] Remove/expire Kraken OHLC data and observe state switch to **SOURCE UNAVAILABLE**, **AWAITING 30 CANDLES**, or **STALE / NO SIGNAL**, with no cached misleading bias.
- [ ] Hide/reopen app; no stale market recommendation should survive background time. Confirm data refreshes only after returning.
- [ ] Verify Kalshi YES/NO quotes, official BRTI target, countdown, and manual position assistant still use their existing distinct data sources and fail closed.
- [ ] Verify source public API failures do not fabricate OHLC, hidden markers, simulated quotes, probabilities, or execution rights.
- [ ] Ensure logged-out requests to both new Signal Lab assets receive the expected private-login response.

## Release/rollback constraints

Keep PR #219 as a draft until explicit staging rollout approval and completed acceptance checks. On failure, revert source to the recorded last-good commit using an **individually approved** rollback deployment; do not rely on a GitHub merge to deploy or silently restart an audit-writing service.

Research integrity: no prediction accuracy or profitability is claimed. No broker/exchange trade or order is placed.
