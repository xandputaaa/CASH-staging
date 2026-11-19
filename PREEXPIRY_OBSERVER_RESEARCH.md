# CASH GitHub-hosted public pre-expiry observation (research only)

This observer is **not** part of the prediction model, cannot issue orders, and cannot upgrade the 0/100 independent forecast-validation gate. It is an external evidence collection **attempt** that checks already-public frozen Kalshi KXBTC15M research after the model has committed a side but while the contract is still open.

## Method and limitations

- GitHub Actions is scheduled to start at minute **12, 27, 42 or 57 UTC** of each hour, approximately three minutes before the conventional 15-minute market close. GitHub may delay or skip scheduled runs; the script does not infer missed records and never invents observations.
- Using a separate standard GitHub-hosted runner (not Railway), the action reads the public early and late exported forecast journals. No Kalshi key, owner token, bank account record, trade permission, GitHub write token or privileged data is used.
- It checks JSON event sequences and SHA-256 self-hash chains; demands a public proxy forecast of the frozen model; verifies the exact predeclared freeze timing, a plausible event recording delay and at least 15 seconds remaining before market close according to the **runner's UTC clock after reading the snapshot**.
- Only a minimal record is uploaded: GitHub run/commit ID, runner observation timestamp, model, market, frozen YES/NO/WAIT side, original freeze time and expiry, frozen event digest and journal head digest. Live benchmark samples, Kalshi account information, private index data and authenticated endpoints are **not** included.
- When neither journal contains a timely eligible frozen record, no observation artifact is uploaded. This is NOT an observed loss, an absent prediction, or evidence of a model's accuracy.
- Public artifacts are set to expire after **30 days** and must not be mistaken for durable server storage. An external observer timestamp is more useful than a self-declared Railway timestamp but is **not** cryptographically signed independent attestation. GitHub runner clocks and job-run metadata need later outside review. Even a valid public hash can be forged by a malicious source before the snapshot.
- The script never reads official licensed BRTI payloads for attestation. Public-proxy research and licensed BRTI data are kept separate.
- Human or independently implemented audit must reconcile the original public Kalshi result, frozen strike, market expiry, original hash chain and GitHub-hosted run metadata before counting any contract as externally witnessed. No automatic code path sets the models' \`qualifiedCount\` above zero.

## Cost and cadence

The standard GitHub-hosted Linux runner is currently free on public repositories under GitHub's published billing rules. This is a lightweight, ~four-runs-per-hour read-only job with no purchases and no third-party paid service. If the repository becomes private or fee rules change, disable or reassess the workflow before running it. GitHub scheduling is best-effort, not real-time, and exact quote availability is not guaranteed.

The previous four-hour dual-model research export remains separate. It catches more accumulated events but **does not** serve as pre-expiry witnessing when captured after the contract closed.


## Direct Kalshi pre-close market corroboration (November 17, 2026 addition)

For future eligible forecasts already observed before expiry, the GitHub-hosted observer makes a **separate unauthenticated GET directly to Kalshi** for the published market record: \`https://external-api.kalshi.com/trade-api/v2/markets/{ticker}\`. This is the officially documented public Get Market endpoint. It returns the selected public market's ticker, status, published close time, strike, strike type and optional public YES/NO asks and quantities. CASH's service does **not** relay these responses.

The observer independently compares the direct exchange record with the previously captured model payload: same exact ticker, same close time, published strike equal to the frozen public strike to cents, same \`greater_or_equal\` rule, active/open and no final result. GitHub runner must finish that direct lookup at least 15 seconds **before** the close. The observer saves its own receipt timestamp, a SHA-256 digest of the selected public fields, public strike/close metadata, and optional public asks and displayed quantities from **the witness observation time**.

Direct verification is opportunistic and may fail because of rate limits, network errors, API cache lag, publication differences, or GitHub scheduling delays. Failure or mismatch is explicitly reported as \`EXCHANGE_MARKET_UNAVAILABLE\`, \`EXCHANGE_READ_TOO_LATE\`, \`EXCHANGE_STRIKE_OR_RULE_MISMATCH\`, etc. None of these are silently recoded as matched. Earlier observation artifacts with no direct market check remain usable as **provisional uncorroborated** witnesses, not retrospectively upgraded.

The exchange quotes and sizes are recorded at the **later witness check time**, not at the original prediction freeze, and **cannot be used as the purchase ask** in CASH's price/fee paper performance calculations. An API quote does not establish that a one-contract buy was fillable. The public endpoint itself can be briefly cached and is not independently signed market attestation. The additional direct market check is a second source sanity check, not proof the forecast was genuinely generated with the claimed original past-only data, not independent qualification, and never trading authorization.

Reconciliation reports will separately expose \`directExchangeCorroborated\` and \`directionalOutcomesWithDirectExchange\`, while **always retaining \`independentQualifiedCount: 0\`**. The old self-hashed 20/20 pilot remains outside any externally witnessed denominator.


## Scheduled-run delay recovery (November 17, 2026)

GitHub scheduled Actions can start **several minutes after** their cron slot, as demonstrated by actual runs around 00:37 UTC and 01:54 UTC. A single fetch at that delayed start may miss the 3-minute checkpoint from the intended contract. Do not misreport it as an observed loss or use a post-close observation as proof that a forecast was pre-close.

For scheduled events only, \`observer-watch.js\` now repeats the existing *read-only* public-journal hash verification and unauthenticated direct Kalshi market comparison every 40 seconds for **at most 12 minutes and 20 attempts**, stopping early when a late-checkpoint frozen event and active public-market strike are both matched before expiry. Any PR/manual run retains the previous one-shot quick check. GitHub workflow timeout is 15 minutes, with no persistent watcher process on Railway. Poll results remain within the one run's GitHub-runner timestamp window.

Only the strongest single qualifying **pre-expiry** observation is written to \`witness/public-preexpiry-observation.json\`. It preserves that actual observation's original runner UTC timestamp, frozen event hash, market ID, preclose quote caveat and separate direct API receipt metadata, even if subsequent polls time out, become stale or encounter network errors. If the run sees only an early WAIT or an uncorroborated late YES/NO, that provisional evidence can still be archived, with its limitations explicit. No eligible event means **no observation artifact**, not an assumed correct prediction.

This is a best-effort mitigation, NOT guaranteed continuous data collection, and cannot recover schedules that never trigger. The watcher performs at most ~20 lightweight public-pair fetches per run; if late-stage matching succeeds quickly it exits early. Scheduled runner minutes may increase, so this feature is appropriate only while standard GitHub-hosted runners are free for this public repository; disable if billing terms or repository visibility change. It does not touch CASH's frozen model weights, prediction thresholds, Railway memory, licensed BRTI, exchange orders, validation gates, calibrated probabilities or original historical results.


## Full bounded runner probe retention (November 18, 2026)

Previously, the scheduled observer made up to 20 source probes over its bounded 12-minute run but retained only one "best" observation. That could discard earlier valid WAITs or directional frozen records for different contracts, distorting external-witness coverage.

The scheduled watcher now archives original runner-clock observations to witness/probes/NNN.json when a new model/market/frozen commitment first appears or when a previously unavailable direct public Kalshi check is later matched while still open. Repeated unchanged polls are deduplicated, while the original witness/public-preexpiry-observation.json summary remains intact. Both are uploaded within the existing cash-preexpiry-observation GitHub artifact, without new scheduled jobs or hosting.

The later GitHub reconciliation reads each valid individual probe plus the original summary, checks model, frozen side, hash, contract close and its GitHub-run start/finish bounds, sorts by earliest runner timestamp, and deduplicates by model plus contract. Contradictory frozen commitments fail closed rather than choosing a favorable side. Older summary-only artifacts still work; probe counts are reported separately from unique GitHub runs. No 100-contract validation count, pre-expiry coverage guarantee, independent BRTI settlement proof, or trade authorization is asserted. All models, WAIT decisions, estimated fees, and trading permissions are unchanged.


## Opportunistic late-checkpoint observer after trusted scheduled workflows (November 2026)

GitHub Actions scheduled workflows are best-effort and can run late. The frozen late checkpoint only fires 150-210 seconds before a Kalshi BTC15m contract closes, so a late or skipped GitHub cron can miss a valid YES/NO decision, even when CASH's own source journal recorded it. This is an evidence collection failure, not a false prediction.

The pre-expiry public research observer now also starts on completed runs of three existing CASH workflows: dual-model research snapshot, Model Lab shadow public settlement recheck, and witnessed-settlement reconciliation. The capture job accepts that trigger only when its triggering workflow was a successful scheduled run of main in the same repository, and the observer's own branch is also main. PR checks run only on same-repository changes, and no job can write to trading systems or the code repository. The backup uses the original public-source export, independent GitHub-runner clock captured after each fetch, read-only direct public Kalshi contract comparison, and per-probe archival from the earlier change.

Backup-triggered runs are bounded to three minutes with 40-second probe intervals. Original scheduled runs keep their maximum 12-minute observation window, and manual/PR runs remain single-pass. Both upload the existing run-scoped observation archive and a separate bounded summary; every frozen WAIT is still an abstention, not a hit. These extra GitHub Actions runs consume runner minutes and do not guarantee precise scheduling, pre-expiry coverage, independent BRTI verification, model calibration, profitability or trading permission. The existing long-term public evidence ledger intentionally still accepts only direct scheduled observer origins; workflow-run-triggered evidence is held as time-limited GitHub artifacts until parent-event provenance for permanent promotion has been separately audited.


## Durable, authenticated GitHub late-checkpoint witness history (November 18, 2026)

The previously confirmed late observer and its parent-schedule-triggered backup runs only uploaded 30-day GitHub Actions artifacts. This is useful short-term external observation, but lacks a long-lived immutable audit trail. Those old artifacts are **not retroactively admitted** by this new system, since they did not include the new original GitHub event-origin file.

All future successful scheduled or authorized scheduled-parent-triggered observer runs include an extra small observer-origin.json in the existing original witness artifact. The original runner context reports its own run ID, event name, main-branch SHA and, where appropriate, the exact successful parent scheduled workflow run ID/name. This source-supplied metadata is not trusted by itself.

A separate privileged workflow, running only frozen default-branch verification code, starts after completion of the observer. It fetches the exact original observer artifact and original GitHub Actions REST run metadata. For a parent-triggered run, it also directly retrieves the claimed parent run from GitHub and verifies it is one of three explicitly allowed successful scheduled workflows on main, from the same repository, with valid ordering. The validator rejects PR-originated/foreign/failed/manually triggered parent claims, missing primary evidence, late observations, conflicting frozen sides/hashes, malformed public fields, symlink/oversized files, and attempts to overwrite a previously archived run.

The verified original probe bytes and original primary observation, the original job summary, public event-origin metadata, and an audited file-hash manifest are then appended as one run-ID directory on a **dedicated nondefault cash-late-public-witness branch**. Writes are serialized. Each commit is append-only. A full on-disk archive inspection occurs before and after every append; repeated immutable forecasts are deduplicated by model and contract, but never overwritten with later outcomes. Empty legitimate observation runs can be recorded as zero-forecast coverage evidence. The separately existing Model Lab shadow archive and the historical late public-evidence-ledger are unchanged.

This is more durable and cross-checkable than expiring GitHub artifacts, but it remains **GitHub-hosted public research evidence**, not cryptographically independent time notarization or independent CF Benchmarks BRTI replication. A self-hashed server-side forecast is a source claim; a correct public result does not establish executable price, profit or predictive edge. WAITs are abstentions and no old evidence is backfilled into a new timestamp. Research model thresholds, live trading credentials and the real-money order gate remain unchanged at **0 independently qualified / 100 required**.


## Bounded recovery of older, still-original GitHub source artifacts

A release of the permanent late archive failed its first live write because of incorrectly escaped GitHub Actions interpolation. PR #62 repaired the live writer, but GitHub's original pre-expiry observer artifacts remain immutable and available for only 30 days; a newly successful writer should not erase those missed archival opportunities.

The separate trusted recovery workflow audits a bounded last-48-hour window of successful original CASH observer workflow runs (direct GitHub schedules or successful scheduled-parent-triggered observers, not PR or manual witnesses). It runs once when the recovery workflow is merged on main, can run on a best-effort six-hour cadence, and permits an explicit workflow dispatch. At most 24 newest eligible original run IDs are processed chronologically. Existing durable archives are skipped. The original GitHub artifact must still exist AND contain its original pre-expiry observation, original GitHub provenance receipt, original watcher summary, and every original per-probe timestamp. Old pre-receipt artifacts are refused, not retroactively timestamped.

For each candidate the recovery uses fresh GitHub API source run metadata and, when applicable, direct GitHub API parent-run metadata. It delegates all timestamp, event/branch/repo, source-hash, public-market, consistency, and security validation to the same canonical append-only late observer archive validator used by live capture. The writer and normal archive share a serialized concurrency group and write only to the dedicated public archive branch, never Railway or Kalshi. A missing/expired original is visible and skipped; invalid present provenance fails the run closed, without pushing partly archived additions. The count of archived runs is not the number of independent contracts, and no retrospective outcome is promoted to a proof of prediction. Independent qualification remains 0/100 and trading remains disabled.

This strengthens continuity and coverage transparency. A GitHub Actions artifact and Git commit do not certify proprietary CF BRTI, guarantee a prospective market edge or prove fills or returns.


## Read-only durable pre-expiry versus scheduled public-settlement cohort audit

CASH's separate public witness ledgers preserve different and individually incomplete evidence: the new cash-late-public-witness branch saves original timed GitHub observer files and their hash manifests, including allowed scheduled-parent backups; the older cash-public-evidence-ledger branch saves scheduled-only witnessed frozen predictions and later checked public settlement/conditional paper economics. These two branches must never be added together as if they represent independent forecast samples.

The late-public-cohort-audit.js read-only analyzer first runs the full integrity validators for BOTH archives, then deduplicates records by immutable model and Kalshi contract identity. It rejects any differing frozen side, source-commitment hash or close timestamp on a shared model/market pair. It computes the overlapping, durable-only and scheduled-ledger-only model/contract observations, plus the distinct Kalshi market count across both models (early/late predictions about the same contract are one market). The old ledger can supply a separately published direct-final outcome for a matching directional forecast but can never backfill a missing pre-expiry timestamp or turn WAIT into a hit. Older legacy-only records remain explicitly classified as legacy-only rather than misrepresented as new originally archived witnesses. Inverse absent-ledger originals remain unscored.

The existing cross-archive audit now also checks both of these branches on every same-repo PR, manual run and a best-effort daily read-only schedule. This is structural evidence consistency, NOT independent validation, certified CF BRTI outcome or index audit, fill verification, execution economics, model calibration, or full prospective data capture. The independent qualification gate remains 0/100; real-money trading remains disabled. Missing GitHub runs, source volatility, failed scheduled workflows, branch rewriting by authorized writers and incomplete observed denominators remain limitations.
