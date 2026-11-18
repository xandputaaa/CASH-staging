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

## Append-only proof against previous archive branch state

Before the trusted schedule-only archiver writes a new Git commit, it now copies the already-checked-out dedicated public-session branch into a temporary local baseline. After the source hash-chain archiver and complete strict-file inspector run, `public-session-archive-delta.js` independently compares this baseline with the proposed worktree.

It **fails before Git push** if any existing forecast file is deleted, if a previous frozen YES/NO/WAIT forecast or original GitHub backup metadata is changed, or if an existing source-reported outcome is rewritten or removed. Its only permitted update to an existing record is a previously absent self-reported outcome whose `firstSeenBackupRunId` equals the current successful scheduled source snapshot ID. New forecasts must likewise originate from this run. It reports separate counts of newly added forecasts, first appended outcomes, and unchanged records; an idempotent run with no file changes passes.

Both copies are strictly schema-validated for unexpected fields, private data, symlinks and counterfeit qualification claims. This is an **independent code-path check of Git branch continuity**, not an independent time witness or third-party settlement attestation. It adds no Railway volume, API key, scheduled workflow or resource spend.

## Scheduled archive operational health (no new writes)

Each successful scheduled research-snapshot job runs the **read-only** `session-archive-health.js` status checker near its end. It inspects GitHub's recent scheduled snapshot history, the session-archive `workflow_run` history, and the current session-archive branch HEAD commit. No extra GitHub archive commit is made by the checker, and a GitHub API health read failure is explicitly labeled `INDETERMINATE`, not silently interpreted as success.

The status distinguishes a snapshot **before** the new archiver was enabled from an eligible later scheduled snapshot; it distinguishes an initialized empty branch from a real branch commit named `Archive unverified public CASH session source (run ID)`. It compares that ID to an actual successful scheduled source run. Before the first commit, a two-hour grace separates `FIRST_ARCHIVE_COMMIT_AWAITING_SCHEDULE` from `FIRST_ARCHIVE_COMMIT_NOT_OBSERVED_AFTER_GRACE`. GitHub schedules may still delay or skip runs, and these are **operational diagnostic labels**, not proof of data loss or availability.

A later successful archival workflow may produce **no new commit** if the source snapshot contains no changed records. Therefore the monitor can request review of later archive job logs but never treats an older branch HEAD as proof that later history was preserved. The checker also never treats a skipped PR-triggered archive as a scheduled success. It is deliberately nonfatal to the existing public research export to avoid sacrificing source backups when GitHub's metadata API is temporarily unavailable.

Neither the Git commit metadata nor this monitor proves that the server froze predictions honestly before expiry. Independent qualification remains zero, and orders remain disabled.

## Safe rollover preflight — no restart authorization

The schedule-only archiver now runs `research-rollover-preflight.js` after source-chain archival, independent append-only comparison and strict whole-branch inspection, but **before any Git commit**. The read-only report cross-checks every current late-model public-proxy FORECAST event hash and immutable YES/NO/WAIT/expiry against its corresponding sanitized file in the proposed archive. Source-reported OUTCOME event hashes are separately counted and missing ones explicitly listed. Older unrelated sessions cannot substitute for a current session backup.

The report labels estimated remaining slots under the **assumed default 160-market journal cap** (actual live limit may be different), including a warning at 32 or fewer remaining. If the late source artifact is absent or contains a nonpublic/licensed source, complete public coverage is explicitly *unavailable*, never represented as successful. Invalid model hashes, changed forecast identities or unsafe archived fields fail visibly.

**This is a backup preflight, not a recovery mechanism.** Even when every sanitized public forecast and outcome hash is backed up, the running Railway service has **no persistent volume**; these public files omit necessary spot samples, index inputs, in-process state, scheduler cursor and pending verification state. The preflight **always** reports `serverStateRestorableFromPublicArchive:false` and `safeToRestartRailway:false`. It never calls Railway, orders anything, installs a database, exports secrets, or changes the model. A controlled recovery/rollover requires a separately designed and explicitly approved state-persistence plan, plus independent first/last snapshot coverage checks.

## Important limits

**This is NOT an external pre-expiry forecast witness.** GitHub may first download an old forecast *after* its market has closed. Even with a valid hash chain, it cannot independently prove the original model forecast was produced before settlement, or that a self-reported outcome matches Kalshi. Every archived file is labeled \`UNVERIFIED_RAILWAY_JOURNAL_EXPORTED_DURING_GITHUB_SCHEDULE\`, \`independentQualifiedCount:0\`, \`actualFillsVerified:0\`, \`ordersEnabled:false\`.

A Git branch is more durable than 30-day workflow artifacts while the repository remains available, but ordinary Git history can be modified by repository writers. GitHub schedules can skip and public source data can be temporarily unavailable. This archival improvement does **not** create a persistent Railway database, resume the model from stored history, reset a capacity limit, prove trading edge, or authorize a restart. If Railway restarts, there may be data lost since the last successful snapshot. Before a controlled rollover near 160 markets, verify a fresh successful snapshot, verify both forecast-chain and evidence-ledger completeness, and obtain explicit authorization for the collector restart/recovery strategy.

Only the existing public repo and GitHub Actions are used. No new paid providers, credentials, model weights, Kalshi orders, licensed data, user-account integration, or Railway deployment changes. The first actual successful **scheduled** archive commit into \`cash-public-session-archive\` must be verified separately from passing PR tests.

All CASH trading decisions remain DISABLED and its independent qualification remains **0/100**.
