# CASH: continuity backup of public-only, self-reported research sessions

The public deployed CASH late checkpoint model has **no persistent Railway volume**. Its in-RAM journal defaults to a cap of 160 markets. Every 30 minutes the existing GitHub \`CASH dual-model research snapshot\` workflow uploads a SHA-checked early and late public export as a GitHub Actions artifact that expires in 30 days. These alone do not make a lossless historical archive.

This optional GitHub-only improvement adds a separate \`cash-public-session-archive\` branch for sanitized **SELF-REPORTED** forecast event commitments. It is strictly separated from \`cash-public-evidence-ledger\`, which holds a smaller set of forecasts independently witnessed before market expiry by GitHub's scheduled runner and postclose public Kalshi final-result checks.

## Collection and archival

The trusted default-branch \`.github/workflows/public-session-archive.yml\` triggers only after an existing successful **scheduled** public research snapshot on the same repo's \`main\` branch completes. It never runs on PR or manual source snapshots, never executes downloaded code or a PR checkout, and uses a short-lived GitHub built-in token with write permission only to commit to \`cash-public-session-archive\`. The workflow downloads the exact public GH artifact by original scheduled run ID and checks the entire published early and late hash chain again before creating any files.

\`public-session-archive.js\` writes one JSON file for each public-proxy forecast commitment: \`public-sessions/<early-v3|late-v1>/<SHA256 of first FORECAST event in that volatile session>/<market-id>.json\`. An automatic new-session ID means records from separate Railway restarts are never silently combined into one unbroken validation sequence.

Only the following public research facts are whitelisted:
- Model type and Kalshi market ticker.
- The source service's claimed original forecast timestamp, market expiry, YES/NO/WAIT side, and the SHA256 of its original self-generated FORECAST event.
- The SHA256 of the *first* FORECAST event in that research server session and the event sequence, for continuity checks.
- Original scheduled GitHub read-only snapshot run ID, source head SHA, run times, and SHA256 of the exact downloaded public research export.
- Where available, the self-reported historical OUTCOME event SHA256, YES/NO/VOID winner, sequence, and the first GH snapshot in which that outcome appeared.

No public quote amounts, raw Kraken market samples or feature values, licensed CF BRTI values, private account keys, trades, fills, user balances, proprietary features, or personally identifying records are copied. Only \`SINGLE_EXCHANGE_PROXY\` source histories are accepted. If the source switches to a licensed/redacted format, that cohort is deliberately skipped; trying to archive raw licensed input data in the public format fails closed.

Original forecast identity and the first snapshot provenance cannot change once archived. A previously pending forecast can only gain an OUTCOME event hash and self-reported winner after it settles, and contradictory winner/event hash rejects the whole update. Every original hash chain and every already-saved public record is checked before any files are written. The archival job never force-pushes or deletes history.

The source GH snapshot's scheduled run timestamps impose a basic sanity check: no archived forecast can claim to be frozen after the source backup finished, and no outcome can claim to have been recorded before contract expiry or after the source snapshot finished. These are not source-authenticated timestamps, nor a guarantee against falsifying an earlier self-hashed server history.

## Read-only verification before commit

Every scheduled archiver run now invokes `node public-session-archive-inspection.js archive-store` after appending and **before** attempting a Git commit. This fails closed if any archived file has an unexpected or private field, a false qualification claim, or an outcome first-seen run ID that predates the record's first backup. It reports separate early/late session counts, archived forecast-file totals, source-reported outcome hashes, outcomes still absent from archive copies, and duplicate market IDs across server sessions.

The inspector can also be run on a checkout of the dedicated branch with `node public-session-archive-inspection.js .` while using trusted source from `main`. Zero files means `NO_SCHEDULED_SESSION_DATA_COMMIT_VERIFIED`; a passing inventory is still *not* pre-expiry witnessing, a public-exchange settlement recheck, or a qualified forecast.

## Important limits

**This is NOT an external pre-expiry forecast witness.** GitHub may first download an old forecast *after* its market has closed. Even with a valid hash chain, it cannot independently prove the original model forecast was produced before settlement, or that a self-reported outcome matches Kalshi. Every archived file is labeled \`UNVERIFIED_RAILWAY_JOURNAL_EXPORTED_DURING_GITHUB_SCHEDULE\`, \`independentQualifiedCount:0\`, \`actualFillsVerified:0\`, \`ordersEnabled:false\`.

A Git branch is more durable than 30-day workflow artifacts while the repository remains available, but ordinary Git history can be modified by repository writers. GitHub schedules can skip and public source data can be temporarily unavailable. This archival improvement does **not** create a persistent Railway database, resume the model from stored history, reset a capacity limit, prove trading edge, or authorize a restart. If Railway restarts, there may be data lost since the last successful snapshot. Before a controlled rollover near 160 markets, verify a fresh successful snapshot, verify both forecast-chain and evidence-ledger completeness, and obtain explicit authorization for the collector restart/recovery strategy.

Only the existing public repo and GitHub Actions are used. No new paid providers, credentials, model weights, Kalshi orders, licensed data, user-account integration, or Railway deployment changes. The first actual successful **scheduled** archive commit into \`cash-public-session-archive\` must be verified separately from passing PR tests.

All CASH trading decisions remain DISABLED and its independent qualification remains **0/100**.
