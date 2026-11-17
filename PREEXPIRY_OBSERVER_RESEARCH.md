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
