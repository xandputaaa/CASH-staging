# CASH public session backup — unverified source records

This branch preserves **self-reported, public-only CASH research journal commitments** from scheduled, already SHA-checked GitHub snapshot runs. It is **not** the pre-expiry externally witnessed archive. For that separate and more meaningful provenance, see [cash-public-evidence-ledger](https://github.com/xandputaaa/CASH-staging/tree/cash-public-evidence-ledger).

Files will appear under `public-sessions/early-v3/<session-first-forecast-event-SHA256>/<market>.json` and `public-sessions/late-v1/<session-first-forecast-event-SHA256>/<market>.json`. Each stores only the model ID, market ID, self-reported original frozen event hash and time, YES/NO/WAIT, closing time, original scheduled GitHub backup run metadata and (when recorded later) source-reported settlement outcome hash and winner. An ordinary Git commit makes those public research commitments more durable than the 30-day Actions artifacts, **but does not establish that the prediction was honestly frozen before expiry**.

No Kraken raw sample features, proprietary licensed BRTI values, account data, Kalshi authentication keys, member bets, quotes, fills or bank balances belong here. The privileged archiver does not check out PR source or archive PR-generated backups. It uses source-whitelisted default-branch code and writes only to this separate branch. These commitments may still be deleted or rewritten by an authorized repository administrator; Git is not an independent notary or a persistent database.

A new first forecast-event SHA256 is treated as a separate server/journal session, which makes pre/post restart records distinguishable. That does **not** authorize restarting the existing Railway server, guarantee lossless recovery, or restore the model automatically. Late model's default 160-market RAM limit still needs an authorized rollover plan before it fills.

Independent qualification remains **0/100**. Real-money orders are **disabled**. Even a correct side at a costly public ask can be a losing hypothetical purchase after fees.

Implementation: [public-session-archive.js](https://github.com/xandputaaa/CASH-staging/blob/main/public-session-archive.js) and [research documentation](https://github.com/xandputaaa/CASH-staging/blob/main/PUBLIC_SESSION_ARCHIVE.md).
