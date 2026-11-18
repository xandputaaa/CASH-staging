# CASH public research evidence ledger

This Git branch is a **public, Git-versioned archive of limited research evidence**. It is separate from the live CASH app and the `main` development branch.

Automated updates are intended only from a successful **scheduled** GitHub public-settlement reconciliation, not pull-request test observations. The trusted validator whitelists public KXBTC15M market identifiers, frozen YES/NO/WAIT decisions, event hashes, GitHub runner timestamps, later public Kalshi settlement hashes and limited hypothetical one-contract fee sensitivity. No raw licensed CF Benchmarks BRTI samples, Kalshi account credentials, private records, real orders, or user balances should be committed.

Files will appear in `public-evidence/YYYY-MM-DD/<contract>/<early-v3|late-v1>.json` once a real scheduled archive job completes. The lack of files **does not** mean no forecasts were made; GitHub cron can be delayed/skipped and the Railway collector is volatile.

The archived hashes and repository history provide useful provenance but **do not independently prove** CASH's inputs, settlement calculation history, profitable real fills, or accuracy. Authorized GitHub writers may rewrite branch history; Git commits are not third-party notarization. All models remain research-only, `0/100` independently qualified, and orders disabled.

Research methodology and source code: https://github.com/xandputaaa/CASH-staging/blob/main/PUBLIC_RESEARCH_LEDGER.md
